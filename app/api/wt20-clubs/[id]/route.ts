// api/wt20-clubs/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateWT20ClubUpdate } from "../../../../lib/validations/wt20ClubValidation";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const doc = await db.collection("wt20Clubs").doc(params.id.toUpperCase()).get();
  if (!doc.exists)
    return NextResponse.json({ success: false, error: "Club not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: { id: doc.id, ...doc.data() } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateWT20ClubUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  const docRef = db.collection("wt20Clubs").doc(params.id.toUpperCase());
  const existing = await docRef.get();
  if (!existing.exists)
    return NextResponse.json({ success: false, error: "Club not found" }, { status: 404 });

  await docRef.update({ ...validation.data, updated_at: FieldValue.serverTimestamp() });
  return NextResponse.json({ success: true, club_id: params.id.toUpperCase() });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const docRef = db.collection("wt20Clubs").doc(params.id.toUpperCase());
  const existing = await docRef.get();
  if (!existing.exists)
    return NextResponse.json({ success: false, error: "Club not found" }, { status: 404 });

  await docRef.delete();
  return NextResponse.json({ success: true, deleted: params.id.toUpperCase() });
}