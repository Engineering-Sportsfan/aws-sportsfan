// app/api/wt20-clubs/daily/route.ts — Migrated to AWS DynamoDB (SportsData Table)
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
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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
  const matchDay = parseInt(String(formData.get("match_day") ?? "0"), 10);
  const dryRun   = formData.get("dry_run") === "true";

  if (!file) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }
  if (!matchDay || isNaN(matchDay) || matchDay < 1) {
    return NextResponse.json(
      { success: false, error: "Valid match_day (positive integer) is required" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      range: 4,
      defval: null,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to parse file" }, { status: 422 });
  }

  const dataRows = rows.filter((r) => {
    const c = r["Country"];
    return c && !String(c).toLowerCase().includes("total");
  });

  if (dataRows.length !== 2) {
    return NextResponse.json({
      success: false,
      error: `Daily sheet must contain exactly 2 club rows (found ${dataRows.length})`,
      found_rows: dataRows.length,
    }, { status: 422 });
  }

  const parsedPatches: {
    mapped: Record<string, unknown>;
    updateInput: WT20ClubUpdateInput;
    raw: Record<string, unknown>;
  }[] = [];

  const rowErrors: {
    row: number;
    club_id?: string;
    errors: { field: string; message: string }[];
  }[] = [];

  dataRows.forEach((raw, idx) => {
    const excelRow = idx + 6;

    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = raw[excelKey] ?? null;
    }

    mapped.source_file = file.name;

    for (const numField of [
      "icc_ranking", "rating_points", "apps", "matches",
      "won", "lost", "tied_so", "no_result",
    ]) {
      if (mapped[numField] !== null) mapped[numField] = Number(mapped[numField]);
    }

    if (mapped.win_pct !== null) {
      const wp = Number(mapped.win_pct);
      mapped.win_pct = wp > 1 ? Math.round(wp * 10) / 10 : Math.round(wp * 1000) / 10;
    }

    const injection = validateWT20ClubRecord(mapped);
    if (!injection.valid) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })),
      });
      return;
    }

    const schema = validateWT20ClubUpdate(mapped);
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

  // Fetch current state for both clubs
  const clubIds = parsedPatches.map((p) => String(p.mapped.club_id).toUpperCase());
  const existingMap = new Map<string, Record<string, unknown>>();
  const missingClubs: string[] = [];

  for (const id of clubIds) {
    let existingData: Record<string, unknown> | null = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `WT20_CLUB#${id}`, sk: "CLUB#META" },
        })
      );
      if (getRes.Item) existingData = getRes.Item as Record<string, unknown>;
    } catch {}

    if (!existingData && db) {
      const doc = await db.collection("wt20Clubs").doc(id).get();
      if (doc.exists) existingData = doc.data() as Record<string, unknown>;
    }

    if (existingData) {
      existingMap.set(id, existingData);
    } else {
      missingClubs.push(id);
    }
  }

  if (missingClubs.length > 0) {
    return NextResponse.json({
      success: false,
      error:   `Clubs not found (run baseline upload first): ${missingClubs.join(", ")}`,
    }, { status: 404 });
  }

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

  const deltas: ClubDelta[] = parsedPatches.map((p) => {
    const clubId   = String(p.mapped.club_id).toUpperCase();
    const existing = existingMap.get(clubId)!;
    const changes  = computeChanges(existing, p.updateInput);
    return {
      club_id:         clubId,
      country:         String(p.mapped.country ?? ""),
      had_match_today: true,
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

  const now = Date.now();

  for (const p of parsedPatches) {
    const clubId = String(p.mapped.club_id).toUpperCase();
    const existing = existingMap.get(clubId) || {};
    const updatedClub = {
      ...existing,
      ...p.updateInput,
      updatedAt: now,
      source_file: file.name,
    };

    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `WT20_CLUB#${clubId}`,
        sk: "CLUB#META",
        ...updatedClub,
      },
      firestoreRef: db.collection("wt20Clubs").doc(clubId),
      firestoreData: {
        ...p.updateInput,
        updated_at: FieldValue.serverTimestamp(),
        source_file: file.name,
      },
    });
    summary.updated++;
  }

  // Write delta log documents
  for (const delta of deltas) {
    if (delta.changes.length === 0) continue;
    const deltaLogId = `delta_${now}_${delta.club_id}_${matchDay}`;
    const logData = {
      id: deltaLogId,
      club_id: delta.club_id,
      country: delta.country,
      match_day: matchDay,
      had_match_today: delta.had_match_today,
      source_file: file.name,
      changes: delta.changes,
      ingested_at: now,
    };

    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `WT20_DELTA#${delta.club_id}`,
        sk: `DELTA#${matchDay}#${now}`,
        ...logData,
      },
      firestoreRef: db.collection("wt20DeltaLogs").doc(deltaLogId),
      firestoreData: {
        ...logData,
        ingested_at: FieldValue.serverTimestamp(),
      },
    });
    summary.delta_docs_written++;
  }

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