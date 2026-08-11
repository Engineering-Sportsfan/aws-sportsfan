// app/api/matches/bulk/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchCreate } from "../../../../lib/validations/matchValidation";
import { validateMatchRecord, validateInningsRecord, runMatchDQChecks } from "../../../../lib/ingestion/matchRules";
import { parseExcelBuffer, parseInningsSheet } from "../../../../lib/ingestion/excelParser";
import type { MatchCreateInput, InningsCreateInput } from "../../../../lib/validations/matchValidation";
import { docClient } from "@/lib/dynamodb";
import { BatchWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const CHUNK_SIZE = 30;

async function fetchExistingMatchIds(matchIds: string[]): Promise<Set<string>> {
  const existing = new Set<string>();

  // 1. Check DynamoDB first
  for (const mId of matchIds) {
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `MATCH#${mId}`, sk: "MATCH#META" },
        })
      );
      if (getRes.Item) existing.add(mId);
    } catch {
      // ignore
    }
  }

  // 2. Fallback check Firestore
  for (let i = 0; i < matchIds.length; i += CHUNK_SIZE) {
    const chunk = matchIds.slice(i, i + CHUNK_SIZE);
    try {
      const snap = await db.collection("matches").where("match_id", "in", chunk).select("match_id").get();
      snap.docs.forEach((d) => existing.add(d.data().match_id));
    } catch (err) {
      console.error("[DEDUP] Matches chunk query failed:", err);
    }
  }
  return existing;
}

export async function POST(req: NextRequest) {
  console.log("[MATCHES/BULK] POST called");

  let matches: Record<string, unknown>[] = [];
  let inningsRows: Record<string, unknown>[] = [];
  let sourceFile = "manual";
  let dryRun = false;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });

    sourceFile = file.name;
    dryRun = formData.get("dry_run") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExcelBuffer(buffer, file.name);
    matches = parsed.rows as Record<string, unknown>[];

    try {
      const inningsParsed = parseInningsSheet(buffer);
      inningsRows = inningsParsed.rows;
    } catch {
      console.log("[MATCHES/BULK] No innings sheet found — skipping");
    }
  } else {
    let body: { matches?: unknown; innings?: unknown; source_file?: string; dry_run?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    matches = Array.isArray(body.matches) ? (body.matches as Record<string, unknown>[]) : [];
    inningsRows = Array.isArray(body.innings) ? (body.innings as Record<string, unknown>[]) : [];
    sourceFile = body.source_file ?? "api";
    dryRun = body.dry_run ?? false;
  }

  if (matches.length === 0) {
    return NextResponse.json({ success: false, error: "No match records found" }, { status: 400 });
  }

  console.log(`[MATCHES/BULK] ${matches.length} matches, ${inningsRows.length} innings rows, dry_run=${dryRun}`);

  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  const errors: Array<{ row: number; match_id?: string; errors: { field: string; message: string }[] }> = [];
  const validMatches: MatchCreateInput[] = [];

  for (let i = 0; i < matches.length; i++) {
    const record = { ...matches[i], source_file: sourceFile } as Record<string, unknown>;
    const rowNum = i + 1;

    const injection = validateMatchRecord(record);
    if (!injection.valid) {
      errors.push({ row: rowNum, match_id: String((record as Record<string, unknown>)['match_id'] ?? ""), errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })) });
      skipped++;
      continue;
    }

    const schema = validateMatchCreate(record);
    if (!schema.success) {
      errors.push({ row: rowNum, match_id: String((record as Record<string, unknown>)['match_id'] ?? ""), errors: schema.errors ?? [] });
      skipped++;
      continue;
    }

    validMatches.push(schema.data!);
  }

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      summary: { total: matches.length, valid: validMatches.length, invalid: skipped },
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  let existingIds: Set<string>;
  try {
    existingIds = await fetchExistingMatchIds(validMatches.map((m) => m.match_id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Dedup check failed: ${msg}` }, { status: 500 });
  }

  const processedInBatch = new Set<string>();
  const writtenMatches: MatchCreateInput[] = [];
  const writtenInnings: InningsCreateInput[] = [];
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

  for (let i = 0; i < validMatches.length; i++) {
    const match = validMatches[i];

    if (existingIds.has(match.match_id)) {
      console.log(`[ROW] Duplicate in DB: ${match.match_id}`);
      errors.push({ row: i + 1, match_id: match.match_id, errors: [{ field: "match_id", message: `Match already exists: ${match.match_id}` }] });
      skipped++;
      continue;
    }
    if (processedInBatch.has(match.match_id)) {
      errors.push({ row: i + 1, match_id: match.match_id, errors: [{ field: "match_id", message: `Duplicate in batch: ${match.match_id}` }] });
      skipped++;
      continue;
    }

    // 1. Prepare DynamoDB Match Item
    dynamoItemsToWrite.push({
      PutRequest: {
        Item: {
          entityId: `MATCH#${match.match_id}`,
          sk: "MATCH#META",
          ...match,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    // 2. Prepare Firestore Match Doc
    const docRef = db.collection("matches").doc(match.match_id);
    batch.set(docRef, {
      ...match,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    processedInBatch.add(match.match_id);
    opsInBatch++;
    processed++;
    writtenMatches.push(match);

    // Write innings for this match
    const matchInnings = inningsRows.filter((r) => r.match_id === match.match_id);
    for (const inningsRow of matchInnings) {
      const inningsValidation = validateInningsRecord(inningsRow);
      if (!inningsValidation.valid) continue;

      dynamoItemsToWrite.push({
        PutRequest: {
          Item: {
            entityId: `MATCH#${match.match_id}`,
            sk: `INNINGS#${inningsRow.innings_no}`,
            ...inningsRow,
            createdAt: now,
          },
        },
      });

      const inningsRef = docRef.collection("innings").doc(String(inningsRow.innings_no));
      batch.set(inningsRef, inningsRow);
      writtenInnings.push(inningsRow as unknown as InningsCreateInput);
      opsInBatch++;
    }

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
      console.warn("[MATCHES/BULK] DynamoDB batch write notice:", dynErr);
    }
  }

  try {
    await flushBatch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[MATCHES/BULK] Batch commit failed:", err);
    return NextResponse.json({ success: false, error: `Batch write failed: ${msg}` }, { status: 500 });
  }

  const dq = runMatchDQChecks(writtenMatches, writtenInnings);
  const dqWarnings = dq.warnings;

  const duration = Date.now() - startTime;
  console.log(`[MATCHES/BULK] Done in ${duration}ms — processed: ${processed}, skipped: ${skipped}`);

  return NextResponse.json({
    success: true,
    summary: { total: matches.length, processed, skipped, innings_written: writtenInnings.length, duration },
    errors: errors.length > 0 ? errors : undefined,
    dqWarnings,
  });
}