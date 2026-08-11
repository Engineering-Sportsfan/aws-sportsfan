// app/api/wt20-clubs/bulk/route.ts — Migrated to AWS DynamoDB (SportsData Table)
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
import { docClient } from "@/lib/dynamodb";
import { BatchWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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

  const validClubs: WT20ClubCreateInput[] = [];
  const rowErrors: {
    row: number;
    club_id?: string;
    errors: { field: string; message: string }[];
  }[] = [];

  rows.forEach((raw, idx) => {
    const excelRow = idx + 6;

    const countryVal = raw["Country"];
    if (!countryVal || String(countryVal).toLowerCase().includes("total")) return;

    const mapped: Record<string, unknown> = {};
    for (const [excelKey, schemaKey] of Object.entries(FIELD_MAP)) {
      mapped[schemaKey] = raw[excelKey] ?? null;
    }

    mapped.tournament = "ICC Women's T20 World Cup";
    mapped.gender     = "female";
    mapped.format     = "international";
    mapped.source_file = file.name;

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

    const injection = validateWT20ClubRecord(mapped);
    if (!injection.valid) {
      rowErrors.push({
        row: excelRow,
        club_id: String(mapped.club_id ?? ""),
        errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })),
      });
      return;
    }

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

  // Pre-fetch existing IDs
  const clubIds = validClubs.map((c) => c.club_id);
  const existingIds = new Set<string>();

  for (const cId of clubIds) {
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `WT20_CLUB#${cId.toUpperCase()}`, sk: "CLUB#META" },
        })
      );
      if (getRes.Item) existingIds.add(cId.toUpperCase());
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < clubIds.length; i += 30) {
    const chunk = clubIds.slice(i, i + 30).map((id) => id.toUpperCase());
    const snap = await db.collection("wt20Clubs").where("club_id", "in", chunk).select("club_id").get();
    snap.docs.forEach((d) => existingIds.add(d.data().club_id.toUpperCase()));
  }

  const BATCH_SIZE = 400;
  const now = Date.now();
  const dynamoItemsToWrite: any[] = [];

  for (let i = 0; i < validClubs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = validClubs.slice(i, i + BATCH_SIZE);

    for (const club of chunk) {
      const cId = club.club_id.toUpperCase();
      const isExisting = existingIds.has(cId);

      if (isExisting && !upsert) {
        summary.skipped++;
        continue;
      }

      const ref = db.collection("wt20Clubs").doc(cId);

      if (isExisting && upsert) {
        dynamoItemsToWrite.push({
          PutRequest: {
            Item: {
              entityId: `WT20_CLUB#${cId}`,
              sk: "CLUB#META",
              ...club,
              club_id: cId,
              updatedAt: now,
            },
          },
        });
        batch.set(ref, { ...club, club_id: cId, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        summary.updated++;
      } else {
        dynamoItemsToWrite.push({
          PutRequest: {
            Item: {
              entityId: `WT20_CLUB#${cId}`,
              sk: "CLUB#META",
              ...club,
              club_id: cId,
              createdAt: now,
              updatedAt: now,
            },
          },
        });
        batch.set(ref, {
          ...club,
          club_id: cId,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        summary.processed++;
      }
    }

    await batch.commit();
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
      console.warn("[WT20-CLUBS/BULK] DynamoDB batch write notice:", dynErr);
    }
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