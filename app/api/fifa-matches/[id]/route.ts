// app/api/fifa-matches/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaMatchUpdate } from "@/lib/validations/fifaMatchValidation";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    let match: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `FIFA_MATCH#${id}`,
            sk: "FIFA#META",
          },
        })
      );
      if (getRes.Item) {
        match = { id, ...getRes.Item };
      }
    } catch (e) {
      console.warn("[fifa-matches [id] GET] DynamoDB notice:", e);
    }

    if (!match) {
      const doc = await db.collection("fifaMatches").doc(id).get();
      if (!doc.exists) return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
      match = { id: doc.id, ...doc.data() };
    }

    return NextResponse.json({ success: true, data: match });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateFifaMatchUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  let existingData: any = null;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `FIFA_MATCH#${id}`, sk: "FIFA#META" },
      })
    );
    if (getRes.Item) existingData = getRes.Item;
  } catch (e) {
    // fallback
  }

  if (!existingData) {
    const docRef = db.collection("fifaMatches").doc(id);
    const existing = await docRef.get();
    if (!existing.exists) return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    existingData = existing.data();
  }

  const now = Date.now();
  const updatedData = {
    ...existingData,
    ...validation.data,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `FIFA_MATCH#${id}`,
      sk: "FIFA#META",
      ...updatedData,
    },
    firestoreRef: db.collection("fifaMatches").doc(id),
    firestoreData: { ...validation.data, updated_at: FieldValue.serverTimestamp() },
  });

  return NextResponse.json({ success: true, match_id: id });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: "SportsData",
        Key: {
          entityId: `FIFA_MATCH#${id}`,
          sk: "FIFA#META",
        },
      })
    );
  } catch (e) {
    console.warn("[fifa-matches DELETE] DynamoDB notice:", e);
  }

  try {
    const docRef = db.collection("fifaMatches").doc(id);
    await docRef.delete();
  } catch (e) {
    console.warn("[fifa-matches DELETE] Firestore notice:", e);
  }

  return NextResponse.json({ success: true, deleted: id });
}