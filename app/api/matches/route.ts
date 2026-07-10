// api/matches/route.ts — GET list + POST single match

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchCreate } from "../../../lib/validations/matchValidation";
import { validateMatchRecord } from "../../../lib/ingestion/matchRules";

// ─── GET /api/matches  
// Query params: tournament, gender, format, season, limit (default 50), after (cursor)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament = searchParams.get("tournament");
  const gender = searchParams.get("gender");
  const format = searchParams.get("format");
  const season = searchParams.get("season");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after = searchParams.get("after"); // last doc ID for cursor pagination

  try {
    let query: FirebaseFirestore.Query = db.collection("matches").orderBy("date", "desc");

    if (tournament) query = query.where("tournament", "==", tournament);
    if (gender) query = query.where("gender", "==", gender);
    if (format) query = query.where("format", "==", format);
    if (season) query = query.where("season", "==", parseInt(season, 10));

    if (after) {
      const cursorDoc = await db.collection("matches").doc(after).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    query = query.limit(limit);
    const snap = await query.get();

    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    return NextResponse.json({ success: true, data: matches, nextCursor, count: matches.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST /api/matches  ───────────────────────────────────────────────────────
// Single match create (admin manual entry)
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateMatchRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateMatchCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const match = schema.data!;

  // Check for existing
  const existing = await db.collection("matches").doc(match.match_id).get();
  if (existing.exists) {
    return NextResponse.json(
      { success: false, error: `Match ${match.match_id} already exists` },
      { status: 409 }
    );
  }

  await db.collection("matches").doc(match.match_id).set({
    ...match,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, match_id: match.match_id }, { status: 201 });
}