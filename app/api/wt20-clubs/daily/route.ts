// api/wt20-clubs/daily/route.ts
//
// POST /api/wt20-clubs/daily
// Body: multipart/form-data
//   file      — .xlsx with exactly 2 rows (the two clubs that played today)
//   match_day — integer, e.g. "3"
//   dry_run   — "true" | "false"
//
// Daily sheet column layout (same as master, subset of fields):
//   Country | Club ID | ICC Ranking | Rating Points | Apps | Matches | Won | Lost |
//   Tied (SO) | NR | Win % | Recent Form | Current Captain | Head Coach |
//   Featured Player | Best Tournament Finish
//
// What this route does:
//   1. Parses the 2-club sheet
//   2. Validates each row (injection guard + schema)
//   3. Fetches current Firestore state for both clubs
//   4. Runs DDQ checks (match delta = +1, outcome validity, win_pct)
//   5. Computes field-level diffs (the "delta")
//   6. On live run: writes updated stats to wt20Clubs + delta log to wt20DeltaLogs

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import * as XLSX from "xlsx";
import {
  validateWT20ClubUpdate,
  type WT20ClubUpdateInput,
} from "../../../../lib/validations/wt20ClubValidation";
import {
  validateWT20ClubRecord,
  runDailyDQChecks,
  type DailyClubPatch,
} from "../../../../lib/ingestion/wt20ClubRules";

// Mutable stat fields updated after each match
const DAILY_STAT_FIELDS = [
  "icc_ranking", "rating_points", "matches", "won", "lost",
  "tied_so", "no_result", "win_pct", "recent_form",
  "current_captain", "head_coach", "featured_player",
  "best_tournament_finish",
] as const;

const FIELD_MAP: Record<string, string> = {
  Country:                  "country",
  "Club ID":                "club_id",
  "ICC Ranking":            "icc_ranking",
  "Rating Points":          "rating_points",
  Apps:                     "apps",
  Matches:                  "matches",
  Won:                      "won",
  Lost:                     "lost",
  "Tied (SO)":              "tied_so",
  NR:                       "no_result",
  "Win %":                  "win_pct",
  "Recent Form":            "recent_form",
  "Current Captain":        "current_captain",
  "Head Coach":             "head_coach",
  "Featured Player":        "featured_player",
  "Best Tournament Finish": "best_tournament_finish",
};

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
  diff?: number;
}

interface ClubDelta {
  club_id: string;
  country: string;
  had_match_today: boolean;
  changes: FieldChange[];
}

function computeChanges(
  existing: Record<string, unknown>,
  incoming: WT20ClubUpdateInput
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of DAILY_STAT_FIELDS) {
    const from = existing[field];
    const to   = (incoming as Record<string, unknown>)[field];
    if (to === undefined) continue;
    if (from === to) continue;
    const change: FieldChange = { field, from, to };
    if (typeof from === "number" && typeof to === "number") {
      change.diff = to - from;
    }
    changes.push(change);
  }
  return changes;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file     = formData.get("file") as File | null;
  const matchDay = parseInt(formData.get("match_day") as string ?? "0", 10);
  const dryRun   = formData.get("dry_run") === "true";

  if (!file) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }
  if (!matchDay || matchDay < 1) {
    return NextResponse.json({ success: false, error: "match_day is required and must be ≥ 1" }, { status: 400 });
  }

  // ── Parse file ──────────────────────────────────────────────────────────────
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: 4,   // row index 4 = Excel row 5 = header row
      defval: null,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to parse file" }, { status: 422 });
  }

  // Filter out blank / summary rows
  const dataRows = rows.filter((raw) => {
    const country = raw["Country"];
    return country && !String(country).toLowerCase().includes("total");
  });

  if (dataRows.length !== 2) {
    return NextResponse.json({
      success: false,
      error: `Daily sheet must contain exactly 2 club rows (found ${dataRows.length}). Each match day sheet should have only the two teams that played.`,
    }, { status: 422 });
  }

  // ── Per-row validation ──────────────────────────────────────────────────────
  const rowErrors: { row: number; club_id?: string; errors: { field: string; message: string }[] }[] = [];
  const parsedPatches: Array<{ mapped: Record<string, unknown>; updateInput: WT20ClubUpdateInput; raw: Record<string, unknown> }> = [];

  dataRows.forEach((raw, idx) => {
    const excelRow = idx + 6;

    // Remap headers
    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = raw[excelKey] ?? null;
    }

    mapped.source_file = file.name;

    // Coerce numerics
    for (const numField of [
      "icc_ranking", "rating_points", "apps", "matches",
      "won", "lost", "tied_so", "no_result",
    ]) {
      if (mapped[numField] !== null) mapped[numField] = Number(mapped[numField]);
    }
    if (mapped.win_pct !== null) {
      const wp = Number(mapped.win_pct);
      mapped.win_pct = wp > 1 ? wp / 100 : wp;
    }

    // Injection guard (only check string fields present)
    const injection = validateWT20ClubRecord({
      ...mapped,
      // Inject required classification fields for the guard check
      tournament: "ICC Women's T20 World Cup",
      gender: "female",
      format: "international",
    });
    if (!injection.valid) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })),
      });
      return;
    }

    // Validate only the update-allowed fields
    const updatePayload: Record<string, unknown> = {};
    for (const field of DAILY_STAT_FIELDS) {
      if (mapped[field] !== null && mapped[field] !== undefined) {
        updatePayload[field] = mapped[field];
      }
    }

    const schema = validateWT20ClubUpdate(updatePayload);
    if (!schema.success) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: schema.errors ?? [],
      });
      return;
    }

    parsedPatches.push({ mapped, updateInput: schema.data!, raw });
  });

  if (rowErrors.length > 0) {
    return NextResponse.json({
      success:  false,
      dry_run:  dryRun,
      match_day: matchDay,
      errors:   rowErrors,
      summary:  { total: dataRows.length, valid: 0, invalid: rowErrors.length, duration: Date.now() - start },
    }, { status: 422 });
  }

  // ── Fetch current Firestore state for both clubs ────────────────────────────
  const clubIds = parsedPatches.map((p) => String(p.mapped.club_id).toUpperCase());
  const existingDocs = await Promise.all(
    clubIds.map((id) => db.collection("wt20Clubs").doc(id).get())
  );

  const existingMap = new Map<string, Record<string, unknown>>();
  const missingClubs: string[] = [];
  existingDocs.forEach((doc, i) => {
    if (!doc.exists) {
      missingClubs.push(clubIds[i]);
    } else {
      existingMap.set(clubIds[i], doc.data() as Record<string, unknown>);
    }
  });

  if (missingClubs.length > 0) {
    return NextResponse.json({
      success: false,
      error:   `Clubs not found in Firestore (run baseline upload first): ${missingClubs.join(", ")}`,
    }, { status: 404 });
  }

  // ── Build DDQ input & run daily DQ checks ───────────────────────────────────
  const dqPatches: DailyClubPatch[] = parsedPatches.map((p) => ({
    club_id:    String(p.mapped.club_id).toUpperCase(),
    matches:    Number(p.mapped.matches   ?? 0),
    won:        Number(p.mapped.won       ?? 0),
    lost:       Number(p.mapped.lost      ?? 0),
    tied_so:    Number(p.mapped.tied_so   ?? 0),
    no_result:  Number(p.mapped.no_result ?? 0),
    win_pct:    Number(p.mapped.win_pct   ?? 0),
    recent_form: p.mapped.recent_form as string | null,
    match_day:  matchDay,
  }));

  const existingStatsMap = new Map(
    Array.from(existingMap.entries()).map(([id, data]) => [
      id,
      {
        matches:   Number(data.matches   ?? 0),
        won:       Number(data.won       ?? 0),
        lost:      Number(data.lost      ?? 0),
        tied_so:   Number(data.tied_so   ?? 0),
        no_result: Number(data.no_result ?? 0),
      },
    ])
  );

  const dqReport = runDailyDQChecks(dqPatches, existingStatsMap);

  // ── Compute field-level deltas ──────────────────────────────────────────────
  const deltas: ClubDelta[] = parsedPatches.map((p) => {
    const clubId   = String(p.mapped.club_id).toUpperCase();
    const existing = existingMap.get(clubId)!;
    const changes  = computeChanges(existing, p.updateInput);
    return {
      club_id:         clubId,
      country:         String(p.mapped.country ?? ""),
      had_match_today: true, // both clubs in this sheet played today
      changes,
    };
  });

  const summary = {
    total:               dataRows.length,
    valid:               parsedPatches.length,
    invalid:             rowErrors.length,
    updated:             0,
    delta_docs_written:  0,
    duration:            0,
  };

  if (dryRun) {
    return NextResponse.json({
      success:    dqReport.passedAll,
      dry_run:    true,
      match_day:  matchDay,
      summary:    { ...summary, duration: Date.now() - start },
      deltas,
      errors:     rowErrors,
      dqWarnings: dqReport.warnings,
    });
  }

  // ── Write to Firestore ──────────────────────────────────────────────────────
  const batch = db.batch();

  for (const p of parsedPatches) {
    const clubId = String(p.mapped.club_id).toUpperCase();
    const ref    = db.collection("wt20Clubs").doc(clubId);
    batch.update(ref, {
      ...p.updateInput,
      updated_at:  FieldValue.serverTimestamp(),
      source_file: file.name,
    });
    summary.updated++;
  }

  // Write delta log documents
  for (const delta of deltas) {
    if (delta.changes.length === 0) continue;
    const logRef = db.collection("wt20DeltaLogs").doc();
    batch.set(logRef, {
      club_id:         delta.club_id,
      country:         delta.country,
      match_day:       matchDay,
      had_match_today: delta.had_match_today,
      source_file:     file.name,
      changes:         delta.changes,
      ingested_at:     FieldValue.serverTimestamp(),
    });
    summary.delta_docs_written++;
  }

  // Write ingest log
  const ingestRef = db.collection("wt20IngestLogs").doc();
  batch.set(ingestRef, {
    type:        "daily",
    match_day:   matchDay,
    clubs:       clubIds,
    source_file: file.name,
    summary,
    dq_passed:   dqReport.passedAll,
    dq_warnings: dqReport.warnings,
    ingested_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  summary.duration = Date.now() - start;

  return NextResponse.json({
    success:    true,
    dry_run:    false,
    match_day:  matchDay,
    summary,
    deltas,
    errors:     rowErrors,
    dqWarnings: dqReport.warnings,
  });
}