// api/fifa-matches/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaMatchCreate } from "@/lib/validations/fifaMatchValidation";
import { validateFifaMatchRecord, runFifaMatchDQChecks } from "@/lib/ingestion/fifaMatchRules";
import { parseFifaExcelBuffer } from "@/lib/ingestion/fifaExcelParser";
import type { FifaMatchCreateInput } from "@/lib/validations/fifaMatchValidation";

const CHUNK_SIZE = 30;

async function fetchExistingMatchIds(matchIds: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < matchIds.length; i += CHUNK_SIZE) {
    const chunk = matchIds.slice(i, i + CHUNK_SIZE);
    const snap = await db.collection("fifaMatches").where("match_id", "in", chunk).select("match_id").get();
    snap.docs.forEach((d) => existing.add(d.data().match_id));
  }
  return existing;
}

export async function POST(req: NextRequest) {
  console.log("[FIFA-MATCHES/BULK] POST called");

  let matches: Record<string, unknown>[] = [];
  let sourceFile = "manual";
  let dryRun = false;
  let upsert = false;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });

    sourceFile = file.name;
    dryRun = formData.get("dry_run") === "true";
    upsert = formData.get("upsert") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseFifaExcelBuffer(buffer, file.name);
    matches = parsed.rows;
  } else {
    let body: { matches?: unknown; source_file?: string; dry_run?: boolean; upsert?: boolean };
    try { body = await req.json(); } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    matches = Array.isArray(body.matches) ? (body.matches as Record<string, unknown>[]) : [];
    sourceFile = body.source_file ?? "api";
    dryRun = body.dry_run ?? false;
    upsert = body.upsert ?? false;
  }

  if (matches.length === 0) {
    return NextResponse.json({ success: false, error: "No match records found" }, { status: 400 });
  }

  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  let updated = 0;
  const errors: Array<{ row: number; match_id?: string; errors: { field: string; message: string }[] }> = [];
  const validMatches: FifaMatchCreateInput[] = [];

  // Pre-validation
  for (let i = 0; i < matches.length; i++) {
    const record = { ...matches[i], source_file: sourceFile } as Record<string, unknown>;
    const injection = validateFifaMatchRecord(record);
    if (!injection.valid) {
      errors.push({ row: i + 1, match_id: String((record as Record<string, unknown>)['match_id'] ?? ""), errors: injection.errors.map((e) => ({ field: e.name, message: e.errorMessage })) });
      skipped++;
      continue;
    }
    const schema = validateFifaMatchCreate(record);
    if (!schema.success) {
      errors.push({ row: i + 1, match_id: String((record as Record<string, unknown>)['match_id'] ?? ""), errors: schema.errors ?? [] });
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

  // Dedup check
  let existingIds: Set<string>;
  try {
    existingIds = await fetchExistingMatchIds(validMatches.map((m) => m.match_id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Dedup check failed: ${msg}` }, { status: 500 });
  }

  const processedInBatch = new Set<string>();
  const writtenMatches: FifaMatchCreateInput[] = [];

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

  for (let i = 0; i < validMatches.length; i++) {
    const match = validMatches[i];

    if (processedInBatch.has(match.match_id)) {
      errors.push({ row: i + 1, match_id: match.match_id, errors: [{ field: "match_id", message: "Duplicate in batch" }] });
      skipped++;
      continue;
    }

    const docRef = db.collection("fifaMatches").doc(match.match_id);

    if (existingIds.has(match.match_id)) {
      if (upsert) {
        // Update existing
        batch.set(docRef, { ...match, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        updated++;
      } else {
        // Skip
        console.log(`[ROW ${i + 1}] SKIP (exists): ${match.match_id}`);
        skipped++;
        continue;
      }
    } else {
      // New record
      batch.set(docRef, {
        ...match,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      processed++;
      writtenMatches.push(match);
    }

    processedInBatch.add(match.match_id);
    opsInBatch++;
    if (opsInBatch >= BATCH_LIMIT) await flushBatch();
  }

  try {
    await flushBatch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: `Batch write failed: ${msg}` }, { status: 500 });
  }

  const dq = runFifaMatchDQChecks(writtenMatches);
  const duration = Date.now() - startTime;

  console.log(`[FIFA-MATCHES/BULK] Done in ${duration}ms — created: ${processed}, updated: ${updated}, skipped: ${skipped}`);

  return NextResponse.json({
    success: true,
    summary: { total: matches.length, processed, updated, skipped, duration },
    errors: errors.length > 0 ? errors : undefined,
    dqWarnings: dq.warnings,
  });
}