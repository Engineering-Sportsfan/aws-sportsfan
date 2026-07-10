#!/usr/bin/env ts-node
// scripts/dailyIncrementalIngestion.ts
// Run each day after WPL match to ingest new match + player stats
// Usage:
//   ts-node scripts/dailyIncrementalIngestion.ts --file ./data/wpl_match_2025-03-15.xlsx
//   ts-node scripts/dailyIncrementalIngestion.ts --file ./data/wpl_stats_2025-03-15.csv --type playerStats
//   ts-node scripts/dailyIncrementalIngestion.ts --dir ./data/daily/2025-03-15  (auto-detects both)

import * as fs from "fs";
import * as path from "path";   
import * as readline from "readline";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { parseExcelBuffer, parseCSVBuffer, parseInningsSheet, detectFileConfig } from "../../lib/ingestion/excelParser";
import { validateMatchRecord, runMatchDQChecks } from "../../lib/ingestion/matchRules";
import { validatePlayerStatsRecord, runPlayerStatsDQChecks } from "../../lib/ingestion/playerStatsRules";
import { validateMatchCreate } from "../../lib/validations/matchValidation";
import { validatePlayerStatsCreate } from "../../lib/validations/playerStatsValidation";
import type { MatchCreateInput } from "../../lib/validations/matchValidation";
import type { PlayerStatsCreateInput } from "../../lib/validations/playerStatsValidation";

// ─── Firebase init ────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(
  fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "./serviceAccount.json", "utf-8")
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};
const filePath = getArg("--file");
const dirPath = getArg("--dir");
const typeOverride = getArg("--type") as "matches" | "playerStats" | undefined;
const dryRun = args.includes("--dry-run");

if (!filePath && !dirPath) {
  console.error("Usage: ts-node scripts/dailyIncrementalIngestion.ts --file <path> [--type matches|playerStats] [--dry-run]");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function askConfirm(question: string): Promise<boolean> {
  if (dryRun) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) =>
    rl.question(`${question} (y/N): `, (ans) => {
      rl.close();
      res(ans.trim().toLowerCase() === "y");
    })
  );
}

// ─── Match ingestion ──────────────────────────────────────────────────────────
async function ingestMatches(buffer: Buffer, filename: string) {
  log(`Parsing matches from ${filename}`);
  const parsed = parseExcelBuffer(buffer, filename);
  log(`Parsed ${parsed.rowCount} match rows`);

  let inningsRows: Record<string, unknown>[] = [];
  try {
    const inningsParsed = parseInningsSheet(buffer);
    inningsRows = inningsParsed.rows;
    log(`Parsed ${inningsRows.length} innings rows`);
  } catch {
    log("No innings sheet found — skipping innings");
  }

  // Validate
  const valid: MatchCreateInput[] = [];
  const invalid: Array<{ row: number; errors: { field: string; message: string }[] }> = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const record = parsed.rows[i] as Record<string, unknown>;
    const injection = validateMatchRecord(record);
    if (!injection.valid) {
      invalid.push({ row: i + 1, errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })) });
      continue;
    }
    const schema = validateMatchCreate(record);
    if (!schema.success) {
      invalid.push({ row: i + 1, errors: schema.errors ?? [] });
      continue;
    }
    valid.push(schema.data!);
  }

  log(`Valid: ${valid.length} | Invalid: ${invalid.length}`);
  if (invalid.length > 0) {
    console.error("Validation errors:");
    invalid.forEach(({ row, errors }) =>
      errors.forEach((e) => console.error(`  Row ${row}: [${e.field}] ${e.message}`))
    );
  }

  if (dryRun) {
    log("[DRY RUN] No writes performed");
    return;
  }

  if (invalid.length > 0) {
    const proceed = await askConfirm(`${invalid.length} invalid rows — proceed with ${valid.length} valid rows?`);
    if (!proceed) { log("Aborted"); return; }
  }

  // Dedup
  let written = 0;
  let skipped = 0;
  const writtenMatches: MatchCreateInput[] = [];

  for (const match of valid) {
    const existing = await db.collection("matches").doc(match.match_id).get();
    if (existing.exists) {
      log(`  SKIP (exists): ${match.match_id}`);
      skipped++;
      continue;
    }

    const batch = db.batch();
    const matchRef = db.collection("matches").doc(match.match_id);
    batch.set(matchRef, { ...match, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });

    // Write innings
    const matchInnings = inningsRows.filter((r) => r.match_id === match.match_id);
    for (const innings of matchInnings) {
      const inningsRef = matchRef.collection("innings").doc(String(innings.innings_no));
      batch.set(inningsRef, innings);
    }

    await batch.commit();
    log(`  ✅ ${match.match_id} — ${match.team1} vs ${match.team2} on ${match.date}`);
    written++;
    writtenMatches.push(match);
  }

  log(`Done — written: ${written}, skipped: ${skipped}`);

  // DQ report
  const dq = runMatchDQChecks(writtenMatches, []);
  if (!dq.passedAll) {
    console.warn("\n⚠️  DQ Warnings:");
    dq.warnings.forEach((w) => console.warn(`  [${w.rule}] ${w.message}`));
  } else {
    log("DQ checks passed ✓");
  }
}

// ─── Player stats ingestion ───────────────────────────────────────────────────
async function ingestPlayerStats(buffer: Buffer, filename: string) {
  log(`Parsing player stats from ${filename}`);
  const isCSV = filename.endsWith(".csv");
  const parsed = isCSV ? parseCSVBuffer(buffer, filename) : parseExcelBuffer(buffer, filename);
  log(`Parsed ${parsed.rowCount} stat rows`);

  const valid: PlayerStatsCreateInput[] = [];
  const invalid: Array<{ row: number; errors: { field: string; message: string }[] }> = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const record = parsed.rows[i] as Record<string, unknown>;
    const injection = validatePlayerStatsRecord(record);
    if (!injection.valid) {
      invalid.push({ row: i + 1, errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })) });
      continue;
    }
    const schema = validatePlayerStatsCreate(record);
    if (!schema.success) {
      invalid.push({ row: i + 1, errors: schema.errors ?? [] });
      continue;
    }
    valid.push(schema.data!);
  }

  log(`Valid: ${valid.length} | Invalid: ${invalid.length}`);
  if (invalid.length > 0) {
    console.error("Validation errors:");
    invalid.forEach(({ row, errors }) =>
      errors.forEach((e) => console.error(`  Row ${row}: [${e.field}] ${e.message}`))
    );
  }

  if (dryRun) { log("[DRY RUN] No writes"); return; }

  if (invalid.length > 0) {
    const proceed = await askConfirm(`Proceed with ${valid.length} valid rows?`);
    if (!proceed) { log("Aborted"); return; }
  }

  let written = 0;
  let skipped = 0;
  const writtenStats: PlayerStatsCreateInput[] = [];

  for (const stat of valid) {
    // Incremental: UPDATE existing record if player+tournament already exists
    const existingSnap = await db
      .collection("playerStats")
      .where("player_name", "==", stat.player_name)
      .where("tournament", "==", stat.tournament)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      // UPSERT — daily stats replace previous (cumulative season stats)
      const docId = existingSnap.docs[0].id;
      await db.collection("playerStats").doc(docId).set(
        { ...stat, updated_at: FieldValue.serverTimestamp() },
        { merge: true }
      );
      log(`  ↻ UPDATED: ${stat.player_name} (${stat.tournament})`);
      skipped++; // counted as "upsert" not "new write"
    } else {
      await db.collection("playerStats").add({
        ...stat,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      log(`  NEW: ${stat.player_name} (${stat.tournament})`);
      written++;
      writtenStats.push(stat);
    }
  }

  log(`Done — new: ${written}, updated: ${skipped}`);

  const dq = runPlayerStatsDQChecks(writtenStats);
  if (!dq.passedAll) {
    console.warn("\n⚠️  DQ Warnings:");
    dq.warnings.forEach((w) => console.warn(`  [${w.rule}] ${w.message}`));
  } else {
    log("DQ checks passed ✓");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log(dryRun ? "=== DRY RUN MODE ===" : "=== INCREMENTAL INGESTION ===");

  const filesToProcess: { path: string; type: "matches" | "playerStats" }[] = [];

  if (filePath) {
    const config = detectFileConfig(path.basename(filePath));
    const type = typeOverride ?? config?.collection ?? "matches";
    filesToProcess.push({ path: filePath, type });
  }

  if (dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith(".xlsx") && !file.endsWith(".csv")) continue;
      const config = detectFileConfig(file);
      if (!config) { log(`Unrecognised file: ${file} — skipping`); continue; }
      filesToProcess.push({ path: path.join(dirPath, file), type: config.collection });
    }
  }

  for (const { path: fp, type } of filesToProcess) {
    log(`\nProcessing: ${fp} (type: ${type})`);
    const buffer = fs.readFileSync(fp);
    const filename = path.basename(fp);

    if (type === "matches") {
      await ingestMatches(buffer, filename);
    } else {
      await ingestPlayerStats(buffer, filename);
    }
  }

  log("\nAll done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});