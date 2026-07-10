// api/player-stats/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validatePlayerStatsCreate } from "../../../../lib/validations/playerStatsValidation";
import { validatePlayerStatsRecord, runPlayerStatsDQChecks } from "../../../../lib/ingestion/playerStatsRules";
import { parseExcelBuffer, parseCSVBuffer } from "../../../../lib/ingestion/excelParser";
import type { PlayerStatsCreateInput } from "../../../../lib/validations/playerStatsValidation";

const CHUNK_SIZE = 30;

async function fetchExistingPlayers(
  playerNames: string[],
  tournament: string
): Promise<Set<string>> {
  const existing = new Set<string>();
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

  // ── Pre-validation ────────────────────────────────────────────────────────
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
      summary: { total: stats.length, valid: validStats.length, invalid: skipped },
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  // ── Dedup ─────────────────────────────────────────────────────────────────
  const tournamentForDedup = validStats[0]?.tournament ?? tournament;
  let existingPlayers: Set<string>;
  try {
    existingPlayers = await fetchExistingPlayers(
      validStats.map((s) => s.player_name),
      tournamentForDedup
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Dedup check failed: ${msg}` }, { status: 500 });
  }

  const processedInBatch = new Set<string>();
  const writtenStats: PlayerStatsCreateInput[] = [];

  // ── Firestore writes ──────────────────────────────────────────────────────
  for (let i = 0; i < validStats.length; i++) {
    const stat = validStats[i];
    const key = `${stat.player_name}::${stat.tournament}`;

    if (existingPlayers.has(stat.player_name)) {
      errors.push({ row: i + 1, player: stat.player_name, errors: [{ field: "player_name", message: `Already exists in DB for ${stat.tournament}` }] });
      skipped++;
      continue;
    }
    if (processedInBatch.has(key)) {
      errors.push({ row: i + 1, player: stat.player_name, errors: [{ field: "player_name", message: "Duplicate in batch" }] });
      skipped++;
      continue;
    }

    try {
      await db.collection("playerStats").add({
        ...stat,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      processedInBatch.add(key);
      writtenStats.push(stat);
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: i + 1, player: stat.player_name, errors: [{ field: "firestore", message: `Write failed: ${msg}` }] });
      skipped++;
    }
  }

  const dq = runPlayerStatsDQChecks(writtenStats);
  const duration = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    summary: { total: stats.length, processed, skipped, duration },
    errors: errors.length > 0 ? errors : undefined,
    dqWarnings: dq.warnings,
  });
}