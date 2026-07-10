// api/innings/route.ts — list innings for a match + add innings

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { validateMatchCreate } from "@/lib/validations/matchValidation";
import { InningsCreateSchema } from "@/lib/validations/matchValidation";
import { validateInningsRecord } from "@/lib/ingestion/matchRules";

// GET /api/innings?match_id=xxx
export async function GET(req: NextRequest) {
  const matchId = new URL(req.url).searchParams.get("match_id");
  if (!matchId) {
    return NextResponse.json({ success: false, error: "match_id query param required" }, { status: 400 });
  }

  try {
    const snap = await db
      .collection("matches")
      .doc(matchId)
      .collection("innings")
      .orderBy("innings_no")
      .get();

    return NextResponse.json({
      success: true,
      match_id: matchId,
      innings: snap.docs.map((d) => d.data()),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/innings — add / overwrite an innings document
// Body: { match_id, innings_no, runs, ... }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { match_id, ...inningsData } = body;
  if (!match_id || typeof match_id !== "string") {
    return NextResponse.json({ success: false, error: "match_id is required" }, { status: 400 });
  }

  // Verify parent match exists
  const matchDoc = await db.collection("matches").doc(match_id).get();
  if (!matchDoc.exists) {
    return NextResponse.json({ success: false, error: `Match ${match_id} not found` }, { status: 404 });
  }

  const injection = validateInningsRecord(inningsData);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const parsed = InningsCreateSchema.safeParse(inningsData);
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    }, { status: 422 });
  }

  const inningsRef = db
    .collection("matches")
    .doc(match_id)
    .collection("innings")
    .doc(String(parsed.data.innings_no));

  await inningsRef.set(parsed.data);
  return NextResponse.json({ success: true, match_id, innings_no: parsed.data.innings_no }, { status: 201 });
}