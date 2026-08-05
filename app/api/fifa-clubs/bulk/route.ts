// app/api/fifa-clubs/bulk/route.ts — Migrated to AWS DynamoDB (SportsData Table)
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
import { docClient } from "@/lib/dynamodb";
import { BatchWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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

  const validClubs: FifaClubCreateInput[] = [];
  const rowErrors: { row: number; club_id?: string; errors: { field: string; message: string }[] }[] = [];

  rows.forEach((raw, idx) => {
    const excelRow = idx + 6;

    const countryVal = raw["Country"] ?? raw["__EMPTY_1"];
    if (!countryVal || String(countryVal).toLowerCase().includes("total")) return;

    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = raw[excelKey] ?? null;
    }

    mapped.tournament = tournament;
    mapped.gender = "male";
    mapped.format = "international";
    mapped.source_file = file.name;

    for (const numField of [
      "fifa_rank", "world_cup_apps", "matches_played",
      "wins", "draws", "losses", "goals_for", "goals_against", "goal_difference",
    ]) {
      if (mapped[numField] !== null) mapped[numField] = Number(mapped[numField]);
    }

    const injection = validateFifaClubRecord(mapped);
    if (!injection.valid) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })),
      });
      return;
    }

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

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      summary: { total_parsed: rows.length, valid: validClubs.length, errors: rowErrors.length },
      row_errors: rowErrors.length > 0 ? rowErrors : undefined,
    });
  }

  // Pre-fetch existing IDs
  const clubIds = validClubs.map((c) => c.club_id);
  const existingIds = new Set<string>();

  for (const cId of clubIds) {
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `FIFA_CLUB#${cId}`, sk: "CLUB#META" },
        })
      );
      if (getRes.Item) existingIds.add(cId);
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < clubIds.length; i += 30) {
    const chunk = clubIds.slice(i, i + 30);
    const snap = await db.collection("fifaClubs").where("club_id", "in", chunk).select("club_id").get();
    snap.docs.forEach((d) => existingIds.add(d.data().club_id));
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const writtenClubs: FifaClubCreateInput[] = [];
  const dynamoItemsToWrite: any[] = [];

  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let opsInBatch = 0;

  const flushBatch = async () => {
    if (opsInBatch > 0) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  const now = Date.now();

  for (const club of validClubs) {
    const isExisting = existingIds.has(club.club_id);

    if (isExisting && !upsert) {
      skipped++;
      continue;
    }

    const docRef = db.collection("fifaClubs").doc(club.club_id);

    if (isExisting && upsert) {
      dynamoItemsToWrite.push({
        PutRequest: {
          Item: {
            entityId: `FIFA_CLUB#${club.club_id}`,
            sk: "CLUB#META",
            ...club,
            updatedAt: now,
          },
        },
      });
      batch.set(docRef, { ...club, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      updated++;
    } else {
      dynamoItemsToWrite.push({
        PutRequest: {
          Item: {
            entityId: `FIFA_CLUB#${club.club_id}`,
            sk: "CLUB#META",
            ...club,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
      batch.set(docRef, {
        ...club,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      created++;
      writtenClubs.push(club);
    }

    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) await flushBatch();
  }

  // Write DynamoDB in batches of 25
  for (let i = 0; i < dynamoItemsToWrite.length; i += 25) {
    const chunk = dynamoItemsToWrite.slice(i, i + 25);
    try {
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            SportsData: chunk,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[FIFA-CLUBS/BULK] DynamoDB batch write notice:", dynErr);
    }
  }

  try {
    await flushBatch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Batch commit failed: ${msg}` }, { status: 500 });
  }

  const dq = runFifaClubDQChecks(writtenClubs);
  const duration = Date.now() - start;

  return NextResponse.json({
    success: true,
    summary: { total: validClubs.length, created, updated, skipped, duration_ms: duration },
    row_errors: rowErrors.length > 0 ? rowErrors : undefined,
    dq_warnings: dq.warnings,
  });
}