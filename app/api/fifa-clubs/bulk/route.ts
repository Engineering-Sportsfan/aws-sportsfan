// api/fifa-clubs/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import * as XLSX from "xlsx";
import {
  validateFifaClubCreate,
  type FifaClubCreateInput,
} from "@/lib/validations/fifaClubValidation";
import {
  validateFifaClubRecord,
  runFifaClubDQChecks,
} from "@/lib/ingestion/fifaClubRules";

// POST /api/fifa-clubs/bulk
// Body: multipart/form-data — file (.xlsx/.csv), tournament, dry_run, upsert
export async function POST(req: NextRequest) {
  const start = Date.now();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tournament = (formData.get("tournament") as string) ?? "FIFA World Cup";
  const dryRun = formData.get("dry_run") === "true";
  const upsert = formData.get("upsert") === "true";

  if (!file) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  // ── Parse file ─────────────────────────────────────────────────────────────
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // Data starts at row 5 (0-indexed row 4) — skip title/description/header rows
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: 4, // row index 4 = Excel row 5 = actual header row
      defval: null,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to parse file" }, { status: 422 });
  }

  // Column header mapping (Excel header → schema field)
  const FIELD_MAP: Record<string, string> = {
    Country: "country",
    "Club ID": "club_id",
    "FIFA Rank": "fifa_rank",
    "World Cup Apps": "world_cup_apps",
    "Matches Played": "matches_played",
    Wins: "wins",
    Draws: "draws",
    Losses: "losses",
    "Goals For (GF)": "goals_for",
    "Goals Against (GA)": "goals_against",
    "Goal Difference": "goal_difference",
    "2026 Head Coach": "head_coach_2026",
    "2026 Captain": "captain_2026",
    "All-Time Best Finish": "all_time_best_finish",
  };

  // ── Per-row validation ─────────────────────────────────────────────────────
  const validClubs: FifaClubCreateInput[] = [];
  const rowErrors: { row: number; club_id?: string; errors: { field: string; message: string }[] }[] = [];

  rows.forEach((raw, idx) => {
    const excelRow = idx + 6; // data starts at Excel row 6

    // Skip summary / blank rows
    const countryVal = raw["Country"] ?? raw["__EMPTY_1"];
    if (!countryVal || String(countryVal).toLowerCase().includes("total")) return;

    // Remap headers
    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = raw[excelKey] ?? null;
    }

    // Inject classification
    mapped.tournament = tournament;
    mapped.gender = "male";
    mapped.format = "international";
    mapped.source_file = file.name;

    // Coerce numerics
    for (const numField of [
      "fifa_rank", "world_cup_apps", "matches_played",
      "wins", "draws", "losses", "goals_for", "goals_against", "goal_difference",
    ]) {
      if (mapped[numField] !== null) mapped[numField] = Number(mapped[numField]);
    }

    // Injection guard
    const injection = validateFifaClubRecord(mapped);
    if (!injection.valid) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })),
      });
      return;
    }

    // Schema validation
    const schema = validateFifaClubCreate(mapped);
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

  // ── Batch DQ checks ────────────────────────────────────────────────────────
  const dqReport = runFifaClubDQChecks(validClubs);

  const summary = {
    total: rows.length,
    valid: validClubs.length,
    invalid: rowErrors.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    duration: 0,
  };

  if (dryRun) {
    return NextResponse.json({
      success: rowErrors.length === 0,
      dry_run: true,
      summary: { ...summary, duration: Date.now() - start },
      errors: rowErrors,
      dqWarnings: dqReport.warnings,
    });
  }

  // ── Write to Firestore ─────────────────────────────────────────────────────
  const BATCH_SIZE = 400;
  for (let i = 0; i < validClubs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = validClubs.slice(i, i + BATCH_SIZE);

    for (const club of chunk) {
      const ref = db.collection("fifaClubs").doc(club.club_id);
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
    success: true,
    dry_run: false,
    summary,
    errors: rowErrors,
    dqWarnings: dqReport.warnings,
  });
}