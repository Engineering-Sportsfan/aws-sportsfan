// app/api/matches/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchCreate } from "@/lib/validations/matchValidation";
import { validateMatchRecord } from "@/lib/ingestion/matchRules";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET /api/matches  
// Query params: tournament, gender, format, season, limit (default 50), after (cursor)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament = searchParams.get("tournament");
  const gender = searchParams.get("gender");
  const format = searchParams.get("format");
  const season = searchParams.get("season");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after = searchParams.get("after");

  try {
    let matches: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      let filterExpr = "begins_with(entityId, :mPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":mPrefix": "MATCH#",
        ":metaSk": "MATCH#META",
      };
      const exprNames: Record<string, string> = {};

      if (tournament) {
        filterExpr += " AND tournament = :t";
        exprVals[":t"] = tournament;
      }
      if (gender) {
        filterExpr += " AND gender = :g";
        exprVals[":g"] = gender;
      }
      if (format) {
        filterExpr += " AND #fmt = :f";
        exprNames["#fmt"] = "format";
        exprVals[":f"] = format;
      }
      if (season) {
        filterExpr += " AND season = :s";
        exprVals[":s"] = parseInt(season, 10);
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: 200,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        matches = (scanRes.Items as any[]).map((item) => ({
          id: item.match_id || (item.entityId as string)?.replace(/^MATCH#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[matches GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (matches.length === 0) {
      let query: FirebaseFirestore.Query = db.collection("matches").orderBy("date", "desc");

      if (tournament) query = query.where("tournament", "==", tournament);
      if (gender) query = query.where("gender", "==", gender);
      if (format) query = query.where("format", "==", format);
      if (season) query = query.where("season", "==", parseInt(season, 10));

      if (after) {
        const cursorDoc = await db.collection("matches").doc(after).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      query = query.limit(limit);
      const snap = await query.get();

      matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    matches.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const paginated = matches.slice(0, limit);
    const nextCursor = paginated.length === limit ? paginated[paginated.length - 1].id : null;

    return NextResponse.json({ success: true, data: paginated, nextCursor, count: paginated.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST /api/matches ───
// Single match create (admin manual entry)
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateMatchRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateMatchCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const match = schema.data!;

  // Check for existing in DynamoDB
  let exists = false;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: {
          entityId: `MATCH#${match.match_id}`,
          sk: "MATCH#META",
        },
      })
    );
    if (getRes.Item) exists = true;
  } catch (e) {
    // fallback
  }

  if (!exists) {
    const existing = await db.collection("matches").doc(match.match_id).get();
    if (existing.exists) exists = true;
  }

  if (exists) {
    return NextResponse.json(
      { success: false, error: `Match ${match.match_id} already exists` },
      { status: 409 }
    );
  }

  const now = Date.now();
  const matchPayload = {
    ...match,
    createdAt: now,
    updatedAt: now,
  };

  // Primary DynamoDB write + Firestore dual-write
  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `MATCH#${match.match_id}`,
      sk: "MATCH#META",
      ...matchPayload,
    },
    firestoreRef: db.collection("matches").doc(match.match_id),
    firestoreData: {
      ...matchPayload,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, match_id: match.match_id }, { status: 201 });
}