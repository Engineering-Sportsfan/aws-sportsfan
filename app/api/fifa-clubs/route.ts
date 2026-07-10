// api/fifa-clubs/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaClubCreate } from "@/lib/validations/fifaClubValidation";
import { validateFifaClubRecord } from "@/lib/ingestion/fifaClubRules";

// GET /api/fifa-clubs
// Query params: tournament, gender, limit, after
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament = searchParams.get("tournament");
  const gender = searchParams.get("gender");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after = searchParams.get("after");

  try {
    let query: FirebaseFirestore.Query = db
      .collection("fifaClubs")
      .orderBy("fifa_rank", "asc");

    if (tournament) query = query.where("tournament", "==", tournament);
    if (gender) query = query.where("gender", "==", gender);

    if (after) {
      const cursorDoc = await db.collection("fifaClubs").doc(after).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    query = query.limit(limit);
    const snap = await query.get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor =
      snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    return NextResponse.json({ success: true, data, nextCursor, count: data.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/fifa-clubs — single manual entry
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateFifaClubRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateFifaClubCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const club = schema.data!;
  const existing = await db.collection("fifaClubs").doc(club.club_id).get();
  if (existing.exists) {
    return NextResponse.json(
      { success: false, error: `Club ${club.club_id} already exists` },
      { status: 409 }
    );
  }

  await db.collection("fifaClubs").doc(club.club_id).set({
    ...club,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, club_id: club.club_id }, { status: 201 });
}