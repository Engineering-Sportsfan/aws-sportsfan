#!/usr/bin/env ts-node
// scripts/ingest/ingestFifaClubDaily.ts
//
// ─── Purpose ──────────────────────────────────────────────────────────────────
// Two-phase ingestion for FIFA WC 2026 club campaign data:
//
//   PHASE 1 — Pre-tournament (now, once):
//     Upload the baseline Excel sheet to Firestore as the initial snapshot.
//     Every club row is written as a new document.
//
//   PHASE 2 — Daily during tournament:
//     After each match day you drop a new Excel sheet (same format, updated
//     cumulative stats). This script:
//       1. Parses the new sheet
//       2. Loads the current Firestore snapshot for each club
//       3. Diffs every numeric stat field
//       4. Writes ONLY changed fields + records a delta log entry
//       5. Updates the "last_ingested_at" and "wc2026_match_day" counters
//
// ─── Usage ───────────────────────────────────────────────────────────────────
//   # Phase 1 — baseline (run once, before tournament)
//   ts-node scripts/ingest/ingestFifaClubDaily.ts \
//     --file ./data/fifaclub_baseline.xlsx \
//     --phase baseline
//
//   # Phase 2 — daily update (run every day after match results)
//   ts-node scripts/ingest/ingestFifaClubDaily.ts \
//     --file ./data/fifaclub_day3.xlsx \
//     --phase daily \
//     --match-day 3
//
//   # Dry run (always safe to run first)
//   ts-node scripts/ingest/ingestFifaClubDaily.ts \
//     --file ./data/fifaclub_day3.xlsx \
//     --phase daily \
//     --match-day 3 \
//     --dry-run
//
// ─── Cron (runs at 23:30 UTC after each match day) ───────────────────────────
//   30 23 * * * cd /app && ts-node scripts/ingest/ingestFifaClubDaily.ts \
//     --file ./data/fifaclub_latest.xlsx \
//     --phase daily \
//     --match-day $(date +\%j) \
//     >> /var/log/fifa-daily-ingest.log 2>&1

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// ─── Field map: Excel header → Firestore field ────────────────────────────────
const FIELD_MAP: Record<string, string> = {
  "Country":              "country",
  "Club ID":              "club_id",
  "FIFA Rank":            "fifa_rank",
  "World Cup Apps":       "world_cup_apps",
  "Matches Played":       "matches_played",
  "Wins":                 "wins",
  "Draws":                "draws",
  "Losses":               "losses",
  "Goals For (GF)":       "goals_for",
  "Goals Against (GA)":   "goals_against",
  "Goal Difference":      "goal_difference",
  "2026 Head Coach":      "head_coach_2026",
  "2026 Captain":         "captain_2026",
  "All-Time Best Finish": "all_time_best_finish",
};

// Fields that change after every match day — these are the ones we diff
const STAT_FIELDS = [
  "matches_played",
  "wins",
  "draws",
  "losses",
  "goals_for",
  "goals_against",
  "goal_difference",
  "fifa_rank",           // rankings shift after match results
  "world_cup_apps",      // increments once per tournament (edge case)
];

// Fields that are stable metadata — updated only if they actually change
const META_FIELDS = [
  "country",
  "head_coach_2026",
  "captain_2026",
  "all_time_best_finish",
];

const COLLECTION      = "fifaClubs";
const DELTA_LOG_COL   = "fifaClubDeltaLogs";  // one doc per club per match day
const INGEST_LOG_COL  = "ingestLogs";
const BATCH_SIZE      = 400;

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "baseline" | "daily";

interface ClubRow {
  club_id: string;
  country: string;
  fifa_rank: number;
  world_cup_apps: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  head_coach_2026: string | null;
  captain_2026: string | null;
  all_time_best_finish: string | null;
}

interface FieldDelta {
  field: string;
  from: number | string | null;
  to: number | string | null;
  diff?: number; // for numeric fields
}

interface ClubDelta {
  club_id: string;
  country: string;
  match_day: number;
  ingested_at: FirebaseFirestore.FieldValue;
  changes: FieldDelta[];
  had_match_today: boolean; // true if matches_played incremented
  source_file: string;
}

interface RunSummary {
  phase: Phase;
  match_day: number;
  source_file: string;
  total_clubs: number;
  created: number;
  updated: number;
  skipped_no_change: number;
  errors: { club_id: string; message: string }[];
  delta_docs_written: number;
  duration_ms: number;
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback = "") => {
    const i = args.indexOf(flag);
    return i !== -1 ? (args[i + 1] ?? fallback) : fallback;
  };
  const phase = (get("--phase", "baseline") as Phase);
  if (phase !== "baseline" && phase !== "daily") {
    fatal(`--phase must be "baseline" or "daily", got: "${phase}"`);
  }
  return {
    filePath:   get("--file",       "./data/fifaclub.xlsx"),
    phase,
    matchDay:   parseInt(get("--match-day", "0"), 10),
    tournament: get("--tournament", "FIFA World Cup"),
    gender:     get("--gender",     "male"),
    dryRun:     args.includes("--dry-run"),
  };
}

// ─── Firebase ─────────────────────────────────────────────────────────────────
function initFirebase() {
  if (getApps().length > 0) return getFirestore();
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./serviceAccountKey.json";
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(saPath, "utf8"))) });
  return getFirestore();
}

// ─── Excel parser ─────────────────────────────────────────────────────────────
function parseExcel(filePath: string): ClubRow[] {
  if (!fs.existsSync(filePath)) fatal(`File not found: ${filePath}`);
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Row 5 in Excel (index 4) is the real header row — skip title rows above it
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: 4, defval: null });

  const clubs: ClubRow[] = [];
  for (const row of raw) {
    const country = row["Country"];
    if (!country || String(country).toLowerCase().includes("total")) continue;

    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = row[excelKey] ?? null;
    }

    // Coerce numerics
    for (const f of [
      "fifa_rank", "world_cup_apps", "matches_played",
      "wins", "draws", "losses", "goals_for", "goals_against", "goal_difference",
    ]) {
      mapped[f] = mapped[f] !== null ? Number(mapped[f]) : null;
    }

    const clubId = mapped.club_id as string;
    if (!clubId) { log("warn", `Skipping row with no club_id: ${country}`); continue; }

    clubs.push(mapped as unknown as ClubRow);
  }
  return clubs;
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateClub(c: ClubRow): string[] {
  const errs: string[] = [];
  if (!c.club_id)               errs.push("club_id is required");
  if (!c.country)               errs.push("country is required");
  if (isNaN(c.fifa_rank))       errs.push("fifa_rank must be a number");
  if (isNaN(c.matches_played))  errs.push("matches_played must be a number");
  if (isNaN(c.wins))            errs.push("wins must be a number");
  if (isNaN(c.draws))           errs.push("draws must be a number");
  if (isNaN(c.losses))          errs.push("losses must be a number");
  if (c.wins + c.draws + c.losses !== c.matches_played) {
    errs.push(`W+D+L (${c.wins + c.draws + c.losses}) ≠ matches_played (${c.matches_played})`);
  }
  if (c.goals_for - c.goals_against !== c.goal_difference) {
    errs.push(`GF-GA (${c.goals_for - c.goals_against}) ≠ goal_difference (${c.goal_difference})`);
  }
  return errs;
}

// ─── Delta computer ───────────────────────────────────────────────────────────
function computeDelta(
  incoming: ClubRow,
  existing: Record<string, unknown>
): FieldDelta[] {
  const changes: FieldDelta[] = [];

  for (const field of [...STAT_FIELDS, ...META_FIELDS]) {
    const newVal = (incoming as unknown as Record<string, unknown>)[field] ?? null;
    const oldVal = existing[field] ?? null;

    if (JSON.stringify(newVal) === JSON.stringify(oldVal)) continue;

    const delta: FieldDelta = { field, from: oldVal as number | string | null, to: newVal as number | string | null };
    if (typeof newVal === "number" && typeof oldVal === "number") {
      delta.diff = newVal - oldVal;
    }
    changes.push(delta);
  }

  return changes;
}

// ─── PHASE 1: Baseline upload ─────────────────────────────────────────────────
async function runBaseline(
  clubs: ClubRow[],
  tournament: string,
  gender: string,
  sourceFile: string,
  dryRun: boolean,
  summary: RunSummary
) {
  const db = initFirebase();
  log("info", `Running BASELINE upload for ${clubs.length} clubs`);

  const batches: ClubRow[][] = [];
  for (let i = 0; i < clubs.length; i += BATCH_SIZE) {
    batches.push(clubs.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of batches) {
    if (dryRun) {
      for (const club of chunk) {
        log("dry", `Would create ${club.club_id} (${club.country})`);
        summary.created++;
      }
      continue;
    }

    const batch = db.batch();
    const existingSnaps = await Promise.all(
      chunk.map((c) => db.collection(COLLECTION).doc(c.club_id).get())
    );

    chunk.forEach((club, i) => {
      const ref = db.collection(COLLECTION).doc(club.club_id);
      if (existingSnaps[i].exists) {
        log("warn", `Club ${club.club_id} already exists — skipping baseline write (use --phase daily to update)`);
        summary.skipped_no_change++;
        return;
      }
      batch.set(ref, {
        ...club,
        tournament,
        gender,
        format: "international",
        source_file: sourceFile,
        wc2026_match_day: 0,           // no matches played yet
        last_ingested_at: FieldValue.serverTimestamp(),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      summary.created++;
      log("info", `  ✓ Created ${club.club_id} — ${club.country}`);
    });

    await batch.commit();
  }
}

// ─── PHASE 2: Daily incremental ───────────────────────────────────────────────
async function runDaily(
  clubs: ClubRow[],
  matchDay: number,
  tournament: string,
  gender: string,
  sourceFile: string,
  dryRun: boolean,
  summary: RunSummary
) {
  const db = initFirebase();
  log("info", `Running DAILY update for match day ${matchDay} — ${clubs.length} clubs`);

  for (let i = 0; i < clubs.length; i += BATCH_SIZE) {
    const chunk = clubs.slice(i, i + BATCH_SIZE);

    // Load current Firestore state for each club in this chunk
    const existingSnaps = await Promise.all(
      chunk.map((c) => db.collection(COLLECTION).doc(c.club_id).get())
    );

    const mainBatch     = db.batch();
    const deltaBatch    = db.batch();
    let   batchHasWork  = false;

    for (let j = 0; j < chunk.length; j++) {
      const club    = chunk[j];
      const snap    = existingSnaps[j];
      const clubRef = db.collection(COLLECTION).doc(club.club_id);

      if (!snap.exists) {
        // Club not seeded yet — create it now (handles late additions)
        log("warn", `Club ${club.club_id} not found in Firestore — creating on first daily run`);
        if (!dryRun) {
          mainBatch.set(clubRef, {
            ...club,
            tournament,
            gender,
            format: "international",
            source_file: sourceFile,
            wc2026_match_day: matchDay,
            last_ingested_at: FieldValue.serverTimestamp(),
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
          batchHasWork = true;
        }
        summary.created++;
        continue;
      }

      const existing = snap.data() as Record<string, unknown>;
      const changes  = computeDelta(club, existing);

      if (changes.length === 0) {
        log("info", `  → ${club.club_id}: no changes (already up-to-date)`);
        summary.skipped_no_change++;
        continue;
      }

      // Log what changed
      const hadMatch = changes.some((c) => c.field === "matches_played" && (c.diff ?? 0) > 0);
      const changeDesc = changes
        .map((c) => `${c.field}: ${c.from} → ${c.to}${c.diff !== undefined ? ` (${c.diff > 0 ? "+" : ""}${c.diff})` : ""}`)
        .join(" | ");
      log("info", `  ✎ ${club.club_id} [day ${matchDay}]: ${changeDesc}`);

      if (!dryRun) {
        // Build update payload — only changed fields
        const updatePayload: Record<string, unknown> = {
          wc2026_match_day: matchDay,
          last_ingested_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
          source_file: sourceFile,
        };
        for (const change of changes) {
          updatePayload[change.field] = change.to;
        }
        mainBatch.update(clubRef, updatePayload);
        batchHasWork = true;

        // Write a delta log document: fifaClubDeltaLogs/{club_id}_day{matchDay}
        const deltaRef = db
          .collection(DELTA_LOG_COL)
          .doc(`${club.club_id}_day${String(matchDay).padStart(3, "0")}`);
        const deltaDoc: ClubDelta = {
          club_id:        club.club_id,
          country:        club.country,
          match_day:      matchDay,
          ingested_at:    FieldValue.serverTimestamp(),
          changes,
          had_match_today: hadMatch,
          source_file:    sourceFile,
        };
        deltaBatch.set(deltaRef, deltaDoc, { merge: true });
        summary.delta_docs_written++;
      }

      summary.updated++;
    }

    if (!dryRun && batchHasWork) {
      await mainBatch.commit();
      await deltaBatch.commit();
    }
  }
}

// ─── Ingest run log ───────────────────────────────────────────────────────────
async function writeRunLog(summary: RunSummary) {
  const db = initFirebase();
  const runId = `fifaClubs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.collection(INGEST_LOG_COL).doc(runId).set({
    ...summary,
    entity: "fifaClubs",
    timestamp: FieldValue.serverTimestamp(),
    status: summary.errors.length === 0 ? "success"
          : summary.updated + summary.created > 0 ? "partial"
          : "failed",
  });
  log("info", `Run log written → ${INGEST_LOG_COL}/${runId}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  const { filePath, phase, matchDay, tournament, gender, dryRun } = parseArgs();

  if (phase === "daily" && matchDay === 0) {
    fatal("--match-day is required for daily phase (e.g. --match-day 1)");
  }

  const sourceFile = path.basename(filePath);

  log("info", "═══════════════════════════════════════════════");
  log("info", `FIFA Club Campaign Ingestion`);
  log("info", `Phase      : ${phase.toUpperCase()}${phase === "daily" ? ` (match day ${matchDay})` : ""}`);
  log("info", `File       : ${filePath}`);
  log("info", `Tournament : ${tournament}`);
  log("info", `Dry run    : ${dryRun}`);
  log("info", "═══════════════════════════════════════════════");

  // 1. Parse Excel
  let clubs: ClubRow[];
  try {
    clubs = parseExcel(filePath);
  } catch (err) {
    fatal(`Excel parse error: ${err}`);
  }
  log("info", `Parsed ${clubs!.length} club rows from Excel`);

  // 2. Validate each row
  const summary: RunSummary = {
    phase,
    match_day:          matchDay,
    source_file:        sourceFile,
    total_clubs:        clubs!.length,
    created:            0,
    updated:            0,
    skipped_no_change:  0,
    errors:             [],
    delta_docs_written: 0,
    duration_ms:        0,
  };

  const validClubs: ClubRow[] = [];
  for (const club of clubs!) {
    const errs = validateClub(club);
    if (errs.length > 0) {
      log("warn", `✕ ${club.club_id}: ${errs.join(" | ")}`);
      summary.errors.push({ club_id: club.club_id, message: errs.join(" | ") });
    } else {
      validClubs.push(club);
    }
  }
  log("info", `Validation: ${validClubs.length} valid, ${summary.errors.length} invalid`);

  if (validClubs.length === 0) {
    log("error", "No valid clubs to process — aborting");
    process.exit(1);
  }

  // 3. Run phase
  if (phase === "baseline") {
    await runBaseline(validClubs, tournament, gender, sourceFile, dryRun, summary);
  } else {
    await runDaily(validClubs, matchDay, tournament, gender, sourceFile, dryRun, summary);
  }

  summary.duration_ms = Date.now() - start;

  // 4. Print summary
  printSummary(summary);

  // 5. Write run log (skip on dry run)
  if (!dryRun) {
    await writeRunLog(summary);
  }

  process.exit(summary.errors.length > 0 ? 1 : 0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error" | "dry", msg: string) {
  const icons = { info: "ℹ", warn: "⚠", error: "✕", dry: "○" };
  console.log(`[${new Date().toISOString()}] ${icons[level]} ${msg}`);
}

function fatal(msg: string): never {
  console.error(`[FATAL] ${msg}`);
  process.exit(1);
}

function printSummary(s: RunSummary) {
  console.log("\n── Run Summary ─────────────────────────────────────────");
  console.log(`  Phase              : ${s.phase.toUpperCase()}${s.phase === "daily" ? ` · Match Day ${s.match_day}` : ""}`);
  console.log(`  Source file        : ${s.source_file}`);
  console.log(`  Total clubs parsed : ${s.total_clubs}`);
  console.log(`  Created            : ${s.created}`);
  console.log(`  Updated            : ${s.updated}`);
  console.log(`  Skipped (no change): ${s.skipped_no_change}`);
  console.log(`  Delta logs written : ${s.delta_docs_written}`);
  console.log(`  Errors             : ${s.errors.length}`);
  if (s.errors.length > 0) {
    s.errors.forEach((e) => console.log(`    ✕ ${e.club_id}: ${e.message}`));
  }
  console.log(`  Duration           : ${s.duration_ms}ms`);
  console.log("────────────────────────────────────────────────────────\n");
}

main().catch((err) => { console.error("[FATAL]", err); process.exit(1); });