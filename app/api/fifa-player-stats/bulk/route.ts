// api/fifa-player-stats/bulk/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaPlayerStatsCreate } from "@/lib/validations/fifaPlayerStatsValidation";
import { validateFifaPlayerStatsRecord, runFifaPlayerStatsDQChecks } from "@/lib/ingestion/fifaPlayerStatsRules";
import { parseFifaExcelBuffer } from "@/lib/ingestion/fifaExcelParser";
import type { FifaPlayerStatsCreateInput } from "@/lib/validations/fifaPlayerStatsValidation";
import { docClient } from "@/lib/dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const CHUNK_SIZE = 25;

async function fetchExistingPlayers(playerNames: string[], tournament: string): Promise<Set<string>> {
  const existing = new Set<string>();
  if (!db) return existing;

  for (let i = 0; i < playerNames.length; i += CHUNK_SIZE) {
    const chunk = playerNames.slice(i, i + CHUNK_SIZE);
    try {
      const snap = await db
        .collection("fifaPlayerStats")
        .where("player_name", "in", chunk)
        .where("tournament", "==", tournament)
        .select("player_name")
        .get();
      snap.docs.forEach((d) => existing.add(d.data().player_name));
    } catch (err) {
      console.error("[DEDUP] fifaPlayerStats chunk failed:", err);
      throw err;
    }
  }
  return existing;
}

export async function POST(req: NextRequest) {
  console.log("[FIFA-PLAYER-STATS/BULK] POST called");

  let stats: Record<string, unknown>[] = [];
  let sourceFile = "manual";
  let dryRun = false;
  let tournament = "mens_fifa_wc_2022";

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });

    sourceFile = file.name;
    dryRun = formData.get("dry_run") === "true";
    tournament = String(formData.get("tournament") ?? "mens_fifa_wc_2022");

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseFifaExcelBuffer(buffer, file.name);
    stats = parsed.rows;

    const tournamentMap: Record<string, string> = {
      "FIFA World Cup": "mens_fifa_wc_2022",
      "FIFA World Cup Qualifier": "mens_fifa_wc_qualifier_2022",
      "UEFA Champions League": "uefa_champions_league_2022",
    };

    stats = stats.map((row) => ({
      ...row,
      tournament: tournamentMap[row.tournament as string] || row.tournament || tournament,
    }));
  } else {
    let body: { stats?: unknown; source_file?: string; dry_run?: boolean; tournament?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    stats = Array.isArray(body.stats) ? (body.stats as Record<string, unknown>[]) : [];
    sourceFile = body.source_file ?? "api";
    dryRun = body.dry_run ?? false;
    tournament = body.tournament ?? "mens_fifa_wc_2022";
  }

  if (stats.length === 0) {
    return NextResponse.json({ success: false, error: "No stats records found" }, { status: 400 });
  }

  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  const errors: Array<{ row: number; player?: string; errors: { field: string; message: string }[] }> = [];
  const validStats: FifaPlayerStatsCreateInput[] = [];

  // Pre-validation
  for (let i = 0; i < stats.length; i++) {
    const record = { ...stats[i], source_file: sourceFile } as Record<string, unknown>;
    if (!record.tournament) record.tournament = tournament;

    const injection = validateFifaPlayerStatsRecord(record);
    if (!injection.valid) {
      errors.push({ row: i + 1, player: String((record as Record<string, unknown>)['player_name'] ?? ""), errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })) });
      skipped++;
      continue;
    }

    const schema = validateFifaPlayerStatsCreate(record);
    if (!schema.success) {
      errors.push({ row: i + 1, player: String((record as Record<string, unknown>)['player_name'] ?? ""), errors: schema.errors ?? [] });
      skipped++;
      continue;
    }

    validStats.push(schema.data!);
  }

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      total_rows: stats.length,
      valid_rows: validStats.length,
      skipped_rows: skipped,
      errors,
    });
  }

  // Deduplication
  const namesByTourn: Record<string, string[]> = {};
  for (const s of validStats) {
    if (!namesByTourn[s.tournament]) namesByTourn[s.tournament] = [];
    namesByTourn[s.tournament].push(s.player_name);
  }

  const existingByTourn: Record<string, Set<string>> = {};
  for (const [tourn, names] of Object.entries(namesByTourn)) {
    existingByTourn[tourn] = await fetchExistingPlayers(names, tourn);
  }

  const toInsert: FifaPlayerStatsCreateInput[] = [];
  for (const stat of validStats) {
    if (existingByTourn[stat.tournament]?.has(stat.player_name)) {
      skipped++;
      continue;
    }
    toInsert.push(stat);
  }

  const now = Date.now();
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);

    // 1. DynamoDB BatchWrite
    try {
      const putRequests = chunk.map((stat, idx) => {
        const id = `fifastat_${now}_${i + idx}_${Math.random().toString(36).substring(2, 7)}`;
        const nameLower = stat.player_name.toLowerCase();
        const words = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);

        return {
          PutRequest: {
            Item: {
              entityId: `FIFA_PLAYER_STAT#${id}`,
              sk: "FIFA_PLAYER_STAT#META",
              id,
              ...stat,
              player_name_lower: nameLower,
              name_words: words,
              created_at: now,
              updated_at: now,
            },
          },
        };
      });

      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            SportsData: putRequests,
          },
        })
      );
    } catch (e) {
      console.warn("[fifa-player-stats bulk] DynamoDB notice:", e);
    }

    // 2. Firestore Batch
    if (db) {
      const batch = db.batch();
      for (const stat of chunk) {
        const nameLower = stat.player_name.toLowerCase();
        const words = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);
        const docRef = db.collection("fifaPlayerStats").doc();
        batch.set(docRef, {
          ...stat,
          player_name_lower: nameLower,
          name_words: words,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    processed += chunk.length;
  }

  return NextResponse.json({
    success: true,
    total: stats.length,
    processed,
    skipped,
    error_count: errors.length,
    errors,
    duration_ms: Date.now() - startTime,
  });
}