// api/fifa-matches/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaMatchUpdate } from "@/lib/validations/fifaMatchValidation";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const doc = await db.collection("fifaMatches").doc(params.id).get();
  if (!doc.exists) return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: { id: doc.id, ...doc.data() } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateFifaMatchUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  const docRef = db.collection("fifaMatches").doc(params.id);
  const existing = await docRef.get();
  if (!existing.exists) return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });

  await docRef.update({ ...validation.data, updated_at: FieldValue.serverTimestamp() });
  return NextResponse.json({ success: true, match_id: params.id });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const docRef = db.collection("fifaMatches").doc(params.id);
  const existing = await docRef.get();
  if (!existing.exists) return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });

  await docRef.delete();
  return NextResponse.json({ success: true, deleted: params.id });
}