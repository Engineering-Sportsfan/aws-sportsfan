// api/fifa-player-stats/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaPlayerStatsCreate } from "@/lib/validations/fifaPlayerStatsValidation";
import { validateFifaPlayerStatsRecord, runFifaPlayerStatsDQChecks } from "@/lib/ingestion/fifaPlayerStatsRules";
import { parseFifaExcelBuffer } from "@/lib/ingestion/fifaExcelParser";
import type { FifaPlayerStatsCreateInput } from "@/lib/validations/fifaPlayerStatsValidation";

const CHUNK_SIZE = 30;

async function fetchExistingPlayers(playerNames: string[], tournament: string): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < playerNames.length; i += CHUNK_SIZE) {
    const chunk = playerNames.slice(i, i + CHUNK_SIZE);
    const snap = await db
      .collection("fifaPlayerStats")
      .where("player_name", "in", chunk)
      .where("tournament", "==", tournament)
      .select("player_name")
      .get();
    snap.docs.forEach((d) => existing.add(d.data().player_name));
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
  
  stats = stats.map(row => ({
    ...row,
    tournament: tournamentMap[row.tournament as string] || row.tournament || tournament
  }));
  } else {
    let body: { stats?: unknown; source_file?: string; dry_run?: boolean; tournament?: string };
    try { body = await req.json(); } catch {
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
  let updated = 0;
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
      summary: { total: stats.length, valid: validStats.length, invalid: skipped },
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  // Dedup
  // const tournamentForDedup = validStats[0]?.tournament ?? tournament;
  // let existingPlayers: Set<string>;
  // try {
  //   existingPlayers = await fetchExistingPlayers(validStats.map((s) => s.player_name), tournamentForDedup);
  // } catch (err) {
  //   const msg = err instanceof Error ? err.message : String(err);
  //   return NextResponse.json({ success: false, error: `Dedup check failed: ${msg}` }, { status: 500 });
  // }

  let existingPlayers: Set<string>;
try {
  // Group by tournament so dedup works correctly across multiple tournaments in one upload
  const byTournament = validStats.reduce<Record<string, string[]>>((acc, s) => {
    (acc[s.tournament] ??= []).push(s.player_name);
    return acc;
  }, {});

  existingPlayers = new Set<string>();
  for (const [t, names] of Object.entries(byTournament)) {
    const existing = await fetchExistingPlayers(names, t);
    existing.forEach((name) => existingPlayers.add(`${name}::${t}`));
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ success: false, error: `Dedup check failed: ${msg}` }, { status: 500 });
}


  const processedInBatch = new Set<string>();
  const writtenStats: FifaPlayerStatsCreateInput[] = [];

  for (let i = 0; i < validStats.length; i++) {
    const stat = validStats[i];
    const key = `${stat.player_name}::${stat.tournament}`;

    if (processedInBatch.has(key)) {
      errors.push({ row: i + 1, player: stat.player_name, errors: [{ field: "player_name", message: "Duplicate in batch" }] });
      skipped++;
      continue;
    }

    try {
      // if (existingPlayers.has(stat.player_name)) {
      if (existingPlayers.has(`${stat.player_name}::${stat.tournament}`)) {
        // Upsert — FIFA stats are tournament-total, a corrected file replaces them
        const existingSnap = await db
          .collection("fifaPlayerStats")
          .where("player_name", "==", stat.player_name)
          .where("tournament", "==", stat.tournament)
          .limit(1)
          .get();
        if (!existingSnap.empty) {
          await db.collection("fifaPlayerStats").doc(existingSnap.docs[0].id).set(
            { ...stat, updated_at: FieldValue.serverTimestamp() },
            { merge: true }
          );
          updated++;
        }
      } else {
        await db.collection("fifaPlayerStats").add({
          ...stat,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        processed++;
        writtenStats.push(stat);
      }
      processedInBatch.add(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ row: i + 1, player: stat.player_name, errors: [{ field: "firestore", message: `Write failed: ${msg}` }] });
      skipped++;
    }
  }

//   const dq = runFifaPlayerStatsDQChecks(writtenStats);
//   const duration = Date.now() - startTime;

//   return NextResponse.json({
//     success: true,
//     summary: { total: stats.length, processed, updated, skipped, duration },
//     errors: errors.length > 0 ? errors : undefined,
//     dqWarnings: dq.results,
//   });
// }


const dq = writtenStats.length > 0 
  ? runFifaPlayerStatsDQChecks(writtenStats) 
  : { passed: true, results: [{ passed: true, message: "No new stats written, skipping DQ checks" }] };

const duration = Date.now() - startTime;

return NextResponse.json({
  success: true,
  summary: { total: stats.length, processed, updated, skipped, duration },
  errors: errors.length > 0 ? errors : undefined,
  dqWarnings: dq.results,
})
}