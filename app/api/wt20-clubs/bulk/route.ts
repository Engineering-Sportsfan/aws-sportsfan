// api/wt20-clubs/bulk/route.ts
// POST /api/wt20-clubs/bulk
// Body: multipart/form-data — file (.xlsx/.csv), dry_run, upsert

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import * as XLSX from "xlsx";
import {
  validateWT20ClubCreate,
  type WT20ClubCreateInput,
} from "../../../../lib/validations/wt20ClubValidation";
import {
  validateWT20ClubRecord,
  runWT20ClubDQChecks,
} from "../../../../lib/ingestion/wt20ClubRules";

// Excel column header → Firestore schema field
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

export async function POST(req: NextRequest) {
  const start = Date.now();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file    = formData.get("file") as File | null;
  const dryRun  = formData.get("dry_run") === "true";
  const upsert  = formData.get("upsert") === "true";

  if (!file) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  // ── Parse file ──────────────────────────────────────────────────────────────
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Row 1 = title, Row 2 = description, Row 3 = blank, Row 4 = blank, Row 5 = headers
    // XLSX range index 4 = Excel row 5 (0-indexed)
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: 4,
      defval: null,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to parse file" }, { status: 422 });
  }

  // ── Per-row validation ──────────────────────────────────────────────────────
  const validClubs: WT20ClubCreateInput[] = [];
  const rowErrors: {
    row: number;
    club_id?: string;
    errors: { field: string; message: string }[];
  }[] = [];

  rows.forEach((raw, idx) => {
    const excelRow = idx + 6; // data starts at Excel row 6

    // Skip summary / blank rows
    const countryVal = raw["Country"];
    if (!countryVal || String(countryVal).toLowerCase().includes("total")) return;

    // Remap headers
    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = raw[excelKey] ?? null;
    }

    // Inject classification
    mapped.tournament = "ICC Women's T20 World Cup";
    mapped.gender     = "female";
    mapped.format     = "international";
    mapped.source_file = file.name;

    // Coerce numerics
    for (const numField of [
      "icc_ranking", "rating_points", "apps", "matches",
      "won", "lost", "tied_so", "no_result",
    ]) {
      if (mapped[numField] !== null) mapped[numField] = Number(mapped[numField]);
    }

    // win_pct: keep as decimal (0–1); Excel may store as 0.8061 or 80.61
    if (mapped.win_pct !== null) {
      const wp = Number(mapped.win_pct);
      // If stored as percentage (>1), convert to decimal
      mapped.win_pct = wp > 1 ? wp / 100 : wp;
    }

    // Injection guard
    const injection = validateWT20ClubRecord(mapped);
    if (!injection.valid) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })),
      });
      return;
    }

    // Schema validation
    const schema = validateWT20ClubCreate(mapped);
    if (!schema.success) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: schema.errors ?? [],
      });
      return;
    }

    validClubs.push(schema.data!);
  });

  // ── Batch DQ checks ─────────────────────────────────────────────────────────
  const dqReport = runWT20ClubDQChecks(validClubs);

  const summary = {
    total:     rows.length,
    valid:     validClubs.length,
    invalid:   rowErrors.length,
    processed: 0,
    updated:   0,
    skipped:   0,
    duration:  0,
  };

  if (dryRun) {
    return NextResponse.json({
      success:    rowErrors.length === 0,
      dry_run:    true,
      summary:    { ...summary, duration: Date.now() - start },
      errors:     rowErrors,
      dqWarnings: dqReport.warnings,
    });
  }

  // ── Write to Firestore ──────────────────────────────────────────────────────
  const BATCH_SIZE = 400;
  for (let i = 0; i < validClubs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = validClubs.slice(i, i + BATCH_SIZE);

    for (const club of chunk) {
      const ref      = db.collection("wt20Clubs").doc(club.club_id);
      const existing = await ref.get();

      if (existing.exists && !upsert) {
        summary.skipped++;
        continue;
      }

      if (existing.exists && upsert) {
        batch.update(ref, { ...club, updated_at: FieldValue.serverTimestamp() });
        summary.updated++;
      } else {
        batch.set(ref, {
          ...club,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        summary.processed++;
      }
    }

    await batch.commit();
  }

  summary.duration = Date.now() - start;

  return NextResponse.json({
    success:    true,
    dry_run:    false,
    summary,
    errors:     rowErrors,
    dqWarnings: dqReport.warnings,
  });
}