// app/api/fifa-clubs/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaClubUpdate } from "@/lib/validations/fifaClubValidation";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    let club: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `FIFA_CLUB#${id}`,
            sk: "CLUB#META",
          },
        })
      );
      if (getRes.Item) {
        club = { id, ...getRes.Item };
      }
    } catch (e) {
      console.warn("[fifa-clubs [id] GET] DynamoDB notice:", e);
    }

    if (!club) {
      const doc = await db.collection("fifaClubs").doc(id).get();
      if (!doc.exists)
        return NextResponse.json({ success: false, error: "Club not found" }, { status: 404 });
      club = { id: doc.id, ...doc.data() };
    }

    return NextResponse.json({ success: true, data: club });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateFifaClubUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  let existingData: any = null;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `FIFA_CLUB#${id}`, sk: "CLUB#META" },
      })
    );
    if (getRes.Item) existingData = getRes.Item;
  } catch (e) {
    // fallback
  }

  if (!existingData) {
    const docRef = db.collection("fifaClubs").doc(id);
    const existing = await docRef.get();
    if (!existing.exists)
      return NextResponse.json({ success: false, error: "Club not found" }, { status: 404 });
    existingData = existing.data();
  }

  const now = Date.now();
  const updatedClub = {
    ...existingData,
    ...validation.data,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `FIFA_CLUB#${id}`,
      sk: "CLUB#META",
      ...updatedClub,
    },
    firestoreRef: db.collection("fifaClubs").doc(id),
    firestoreData: { ...validation.data, updated_at: FieldValue.serverTimestamp() },
  });

  return NextResponse.json({ success: true, club_id: id });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: "SportsData",
        Key: {
          entityId: `FIFA_CLUB#${id}`,
          sk: "CLUB#META",
        },
      })
    );
  } catch (e) {
    console.warn("[fifa-clubs DELETE] DynamoDB notice:", e);
  }

  try {
    const docRef = db.collection("fifaClubs").doc(id);
    await docRef.delete();
  } catch (e) {
    console.warn("[fifa-clubs DELETE] Firestore notice:", e);
  }

  return NextResponse.json({ success: true, deleted: id });
}