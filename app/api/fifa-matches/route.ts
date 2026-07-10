// api/fifa-matches/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaMatchCreate } from "@/lib/validations/fifaMatchValidation";
import { validateFifaMatchRecord } from "@/lib/ingestion/fifaMatchRules";

// GET /api/fifa-matches
// Query params: tournament, gender, stage, season, team, limit, after
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament = searchParams.get("tournament");
  const gender = searchParams.get("gender");
  const stage = searchParams.get("stage");
  const season = searchParams.get("season");
  const team = searchParams.get("team");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after = searchParams.get("after");

  try {
    let query: FirebaseFirestore.Query = db.collection("fifaMatches").orderBy("date", "desc");

    if (tournament) query = query.where("tournament", "==", tournament);
    if (gender) query = query.where("gender", "==", gender);
    if (stage) query = query.where("stage", "==", stage);
    if (season) query = query.where("season", "==", parseInt(season, 10));
    // team filter checks either team1 or team2 — needs two queries; simplified to team1 here
    if (team) query = query.where("team1", "==", team);

    if (after) {
      const cursorDoc = await db.collection("fifaMatches").doc(after).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    query = query.limit(limit);
    const snap = await query.get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    return NextResponse.json({ success: true, data, nextCursor, count: data.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
//POST
//api
//apis
// POST /api/fifa-matches — single manual entry
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateFifaMatchRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateFifaMatchCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const match = schema.data!;
  const existing = await db.collection("fifaMatches").doc(match.match_id).get();
  if (existing.exists) {
    return NextResponse.json({ success: false, error: `Match ${match.match_id} already exists` }, { status: 409 });
  }

  await db.collection("fifaMatches").doc(match.match_id).set({
    ...match,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, match_id: match.match_id }, { status: 201 });
}
