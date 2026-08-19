// api/player-stats/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validatePlayerStatsUpdate } from "../../../../lib/validations/playerStatsValidation";
import { validatePlayerStatsRecord } from "../../../../lib/ingestion/playerStatsRules";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  let data: any = null;

  // 1. Try DynamoDB
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `PLAYER_STAT#${id}`, sk: "PLAYER_STAT#META" },
      })
    );
    if (getRes.Item) data = { id, ...getRes.Item };
  } catch (e) {
    console.warn("[player-stats [id] GET] DynamoDB notice:", e);
  }

  // 2. Fallback to Firestore
  if (!data && db) {
    const doc = await db.collection("playerStats").doc(id).get();
    if (doc.exists) data = { id: doc.id, ...doc.data() };
  }

  if (!data) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validatePlayerStatsRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const validation = validatePlayerStatsUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  let existing: any = null;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `PLAYER_STAT#${id}`, sk: "PLAYER_STAT#META" },
      })
    );
    if (getRes.Item) existing = getRes.Item;
  } catch {}

  if (!existing && db) {
    const doc = await db.collection("playerStats").doc(id).get();
    if (doc.exists) existing = doc.data();
  }

  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const now = Date.now();
  const updatedDoc = {
    ...existing,
    ...validation.data,
    updated_at: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `PLAYER_STAT#${id}`,
      sk: "PLAYER_STAT#META",
      ...updatedDoc,
      id,
    },
    firestoreRef: db.collection("playerStats").doc(id),
    firestoreData: {
      ...validation.data,
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, id });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: "SportsData",
        Key: { entityId: `PLAYER_STAT#${id}`, sk: "PLAYER_STAT#META" },
      })
    );
  } catch (e) {
    console.warn("[player-stats [id] DELETE] DynamoDB notice:", e);
  }

  if (db) {
    const docRef = db.collection("playerStats").doc(id);
    const existing = await docRef.get();
    if (existing.exists) {
      await docRef.delete();
    }
  }

  return new NextResponse(null, { status: 204 });
}