// app/api/innings/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { InningsCreateSchema } from "@/lib/validations/matchValidation";
import { validateInningsRecord } from "@/lib/ingestion/matchRules";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET /api/innings?match_id=xxx
export async function GET(req: NextRequest) {
  const matchId = new URL(req.url).searchParams.get("match_id");
  if (!matchId) {
    return NextResponse.json({ success: false, error: "match_id query param required" }, { status: 400 });
  }

  try {
    let innings: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SportsData",
          KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":eId": `MATCH#${matchId}`,
            ":skPrefix": "INNINGS#",
          },
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        innings = (qRes.Items as any[]).sort((a, b) => Number(a.innings_no || 0) - Number(b.innings_no || 0));
      }
    } catch (e) {
      console.warn("[innings GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (innings.length === 0) {
      const snap = await db
        .collection("matches")
        .doc(matchId)
        .collection("innings")
        .orderBy("innings_no")
        .get();

      innings = snap.docs.map((d) => d.data());
    }

    return NextResponse.json({
      success: true,
      match_id: matchId,
      innings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/innings — add / overwrite an innings document
// Body: { match_id, innings_no, runs, ... }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { match_id, ...inningsData } = body;
  if (!match_id || typeof match_id !== "string") {
    return NextResponse.json({ success: false, error: "match_id is required" }, { status: 400 });
  }

  // Verify parent match exists in DynamoDB or Firestore
  let matchExists = false;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `MATCH#${match_id}`, sk: "MATCH#META" },
      })
    );
    if (getRes.Item) matchExists = true;
  } catch (e) {
    // fallback
  }

  if (!matchExists) {
    const matchDoc = await db.collection("matches").doc(match_id).get();
    if (matchDoc.exists) matchExists = true;
  }

  if (!matchExists) {
    return NextResponse.json({ success: false, error: `Match ${match_id} not found` }, { status: 404 });
  }

  const injection = validateInningsRecord(inningsData);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const parsed = InningsCreateSchema.safeParse(inningsData);
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    }, { status: 422 });
  }

  const now = Date.now();
  const inningsItem = {
    ...parsed.data,
    match_id,
    createdAt: now,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `MATCH#${match_id}`,
      sk: `INNINGS#${parsed.data.innings_no}`,
      ...inningsItem,
    },
    firestoreRef: db.collection("matches").doc(match_id).collection("innings").doc(String(parsed.data.innings_no)),
    firestoreData: parsed.data,
  });

  return NextResponse.json({ success: true, match_id, innings_no: parsed.data.innings_no }, { status: 201 });
}