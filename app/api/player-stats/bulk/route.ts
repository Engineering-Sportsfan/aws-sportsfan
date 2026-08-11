// api/player-stats/bulk/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validatePlayerStatsCreate } from "../../../../lib/validations/playerStatsValidation";
import { validatePlayerStatsRecord, runPlayerStatsDQChecks } from "../../../../lib/ingestion/playerStatsRules";
import { parseExcelBuffer, parseCSVBuffer } from "../../../../lib/ingestion/excelParser";
import type { PlayerStatsCreateInput } from "../../../../lib/validations/playerStatsValidation";
import { docClient } from "@/lib/dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const CHUNK_SIZE = 25;

async function fetchExistingPlayers(
  playerNames: string[],
  tournament: string
): Promise<Set<string>> {
  const existing = new Set<string>();
  if (!db) return existing;

  for (let i = 0; i < playerNames.length; i += CHUNK_SIZE) {
    const chunk = playerNames.slice(i, i + CHUNK_SIZE);
    try {
      const snap = await db
        .collection("playerStats")
        .where("player_name", "in", chunk)
        .where("tournament", "==", tournament)
        .select("player_name")
        .get();
      snap.docs.forEach((d) => existing.add(d.data().player_name));
    } catch (err) {
      console.error("[DEDUP] playerStats chunk failed:", err);
      throw err;
    }
  }
  return existing;
}

export async function POST(req: NextRequest) {
  console.log("[PLAYER-STATS/BULK] POST called");

  let stats: Record<string, unknown>[] = [];
  let sourceFile = "manual";
  let dryRun = false;
  let tournament = "";

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });

    sourceFile = file.name;
    dryRun = formData.get("dry_run") === "true";
    tournament = String(formData.get("tournament") ?? "");

    const buffer = Buffer.from(await file.arrayBuffer());
    const isCSV = file.name.endsWith(".csv");
    const parsed = isCSV ? parseCSVBuffer(buffer, file.name) : parseExcelBuffer(buffer, file.name);
    stats = parsed.rows as Record<string, unknown>[];
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
    tournament = body.tournament ?? "";
  }

  if (stats.length === 0) {
    return NextResponse.json({ success: false, error: "No stats records found" }, { status: 400 });
  }

  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  const errors: Array<{ row: number; player?: string; errors: { field: string; message: string }[] }> = [];
  const validStats: PlayerStatsCreateInput[] = [];

  // Pre-validation
  for (let i = 0; i < stats.length; i++) {
    const record = { ...stats[i], source_file: sourceFile } as Record<string, unknown>;
    if (tournament && !record.tournament) record.tournament = tournament;

    const injection = validatePlayerStatsRecord(record);
    if (!injection.valid) {
      errors.push({ row: i + 1, player: String((record as Record<string, unknown>)['player_name'] ?? ""), errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })) });
      skipped++;
      continue;
    }

    const schema = validatePlayerStatsCreate(record);
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

  // Chunked batch write to DynamoDB & Firestore
  const toInsert: PlayerStatsCreateInput[] = [];
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
        const id = `pstat_${now}_${i + idx}_${Math.random().toString(36).substring(2, 7)}`;
        const nameLower = stat.player_name.toLowerCase();
        const words = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);

        return {
          PutRequest: {
            Item: {
              entityId: `PLAYER_STAT#${id}`,
              sk: "PLAYER_STAT#META",
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
      console.warn("[player-stats bulk] DynamoDB notice:", e);
    }

    // 2. Firestore Batch
    if (db) {
      const batch = db.batch();
      for (const stat of chunk) {
        const nameLower = stat.player_name.toLowerCase();
        const words = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);
        const docRef = db.collection("playerStats").doc();
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