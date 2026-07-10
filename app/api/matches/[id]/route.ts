// api/matches/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchUpdate } from "../../../../lib/validations/matchValidation";

type Params = { params: { id: string } };

// ─── GET /api/matches/[id] ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = params;
  try {
    const doc = await db.collection("matches").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    }

    // Fetch innings subcollection
    const inningsSnap = await db.collection("matches").doc(id).collection("innings").orderBy("innings_no").get();
    const innings = inningsSnap.docs.map((d) => d.data());

    return NextResponse.json({ success: true, data: { ...doc.data(), innings } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PATCH /api/matches/[id] ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateMatchUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  const docRef = db.collection("matches").doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
  }

  await docRef.update({
    ...validation.data,
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, match_id: id });
}

// ─── DELETE /api/matches/[id] ─────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = params;
  const docRef = db.collection("matches").doc(id);

  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
  }

  // Delete innings subcollection first
  const inningsSnap = await docRef.collection("innings").get();
  const batch = db.batch();
  inningsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(docRef);
  await batch.commit();

  return NextResponse.json({ success: true, deleted: id });
}