// app/api/fifa-clubs/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaClubCreate } from "@/lib/validations/fifaClubValidation";
import { validateFifaClubRecord } from "@/lib/ingestion/fifaClubRules";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET /api/fifa-clubs
// Query params: tournament, gender, limit, after
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament = searchParams.get("tournament");
  const gender = searchParams.get("gender");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after = searchParams.get("after");

  try {
    let clubs: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      let filterExpr = "begins_with(entityId, :cPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":cPrefix": "FIFA_CLUB#",
        ":metaSk": "CLUB#META",
      };

      if (tournament) {
        filterExpr += " AND tournament = :t";
        exprVals[":t"] = tournament;
      }
      if (gender) {
        filterExpr += " AND gender = :g";
        exprVals[":g"] = gender;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 200,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        clubs = (scanRes.Items as any[]).map((item) => ({
          id: item.club_id || (item.entityId as string)?.replace(/^FIFA_CLUB#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[fifa-clubs GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (clubs.length === 0) {
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
      clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    clubs.sort((a, b) => Number(a.fifa_rank || 999) - Number(b.fifa_rank || 999));
    const paginated = clubs.slice(0, limit);
    const nextCursor = paginated.length === limit ? paginated[paginated.length - 1].id : null;

    return NextResponse.json({ success: true, data: paginated, nextCursor, count: paginated.length });
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

  // Check for existing
  let exists = false;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: {
          entityId: `FIFA_CLUB#${club.club_id}`,
          sk: "CLUB#META",
        },
      })
    );
    if (getRes.Item) exists = true;
  } catch (e) {
    // fallback
  }

  if (!exists) {
    const existing = await db.collection("fifaClubs").doc(club.club_id).get();
    if (existing.exists) exists = true;
  }

  if (exists) {
    return NextResponse.json(
      { success: false, error: `Club ${club.club_id} already exists` },
      { status: 409 }
    );
  }

  const now = Date.now();
  const clubData = {
    ...club,
    createdAt: now,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `FIFA_CLUB#${club.club_id}`,
      sk: "CLUB#META",
      ...clubData,
    },
    firestoreRef: db.collection("fifaClubs").doc(club.club_id),
    firestoreData: {
      ...clubData,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, club_id: club.club_id }, { status: 201 });
}