// app/api/matches/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchUpdate } from "@/lib/validations/matchValidation";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/matches/[id] ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    let matchData: any = null;
    let innings: any[] = [];

    // 1. Check DynamoDB SportsData
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `MATCH#${id}`,
            sk: "MATCH#META",
          },
        })
      );
      if (getRes.Item) {
        matchData = getRes.Item;

        // Fetch innings from DynamoDB
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "SportsData",
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${id}`,
              ":skPrefix": "INNINGS#",
            },
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          innings = (qRes.Items as any[]).sort((a, b) => Number(a.innings_no || 0) - Number(b.innings_no || 0));
        }
      }
    } catch (e) {
      console.warn("[matches [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!matchData) {
      const doc = await db.collection("matches").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
      }
      matchData = doc.data();

      // Fetch innings subcollection
      const inningsSnap = await db.collection("matches").doc(id).collection("innings").orderBy("innings_no").get();
      innings = inningsSnap.docs.map((d) => d.data());
    }

    return NextResponse.json({ success: true, data: { ...matchData, innings } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PATCH /api/matches/[id] ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
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

  let existingData: any = null;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" },
      })
    );
    if (getRes.Item) existingData = getRes.Item;
  } catch (e) {
    // fallback
  }

  if (!existingData) {
    const docRef = db.collection("matches").doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ success: false, error: "Match not found" }, { status: 404 });
    }
    existingData = existing.data();
  }

  const now = Date.now();
  const updatedMatch = {
    ...existingData,
    ...validation.data,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `MATCH#${id}`,
      sk: "MATCH#META",
      ...updatedMatch,
    },
    firestoreRef: db.collection("matches").doc(id),
    firestoreData: {
      ...validation.data,
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, match_id: id });
}

// ─── DELETE /api/matches/[id] ─────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  // 1. Delete from DynamoDB
  try {
    const qRes = await docClient.send(
      new QueryCommand({
        TableName: "SportsData",
        KeyConditionExpression: "entityId = :eId",
        ExpressionAttributeValues: { ":eId": `MATCH#${id}` },
      })
    );
    if (qRes.Items) {
      for (const item of qRes.Items) {
        await docClient.send(
          new DeleteCommand({
            TableName: "SportsData",
            Key: { entityId: item.entityId, sk: item.sk },
          })
        );
      }
    }
  } catch (e) {
    console.warn("[matches DELETE] DynamoDB notice:", e);
  }

  // 2. Delete from Firestore
  try {
    const docRef = db.collection("matches").doc(id);
    const inningsSnap = await docRef.collection("innings").get();
    const batch = db.batch();
    inningsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(docRef);
    await batch.commit();
  } catch (e) {
    console.warn("[matches DELETE] Firestore notice:", e);
  }

  return NextResponse.json({ success: true, deleted: id });
}