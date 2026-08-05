// app/api/fifa-matches/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaMatchCreate } from "@/lib/validations/fifaMatchValidation";
import { validateFifaMatchRecord } from "@/lib/ingestion/fifaMatchRules";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET /api/fifa-matches
// Query params: tournament, gender, stage, season, team, limit, after
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournament = searchParams.get("tournament");
  const gender = searchParams.get("gender");
  const stage = searchParams.get("stage");
  const season = searchParams.get("season");
  const team = searchParams.get("team");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after = searchParams.get("after");

  try {
    let matches: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      let filterExpr = "begins_with(entityId, :fPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":fPrefix": "FIFA_MATCH#",
        ":metaSk": "FIFA#META",
      };

      if (tournament) {
        filterExpr += " AND tournament = :t";
        exprVals[":t"] = tournament;
      }
      if (gender) {
        filterExpr += " AND gender = :g";
        exprVals[":g"] = gender;
      }
      if (stage) {
        filterExpr += " AND stage = :stg";
        exprVals[":stg"] = stage;
      }
      if (season) {
        filterExpr += " AND season = :s";
        exprVals[":s"] = parseInt(season, 10);
      }
      if (team) {
        filterExpr += " AND (team1 = :tm OR team2 = :tm)";
        exprVals[":tm"] = team;
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
        matches = (scanRes.Items as any[]).map((item) => ({
          id: item.match_id || (item.entityId as string)?.replace(/^FIFA_MATCH#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[fifa-matches GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (matches.length === 0) {
      let query: FirebaseFirestore.Query = db.collection("fifaMatches").orderBy("date", "desc");

      if (tournament) query = query.where("tournament", "==", tournament);
      if (gender) query = query.where("gender", "==", gender);
      if (stage) query = query.where("stage", "==", stage);
      if (season) query = query.where("season", "==", parseInt(season, 10));
      if (team) query = query.where("team1", "==", team);

      if (after) {
        const cursorDoc = await db.collection("fifaMatches").doc(after).get();
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

// POST /api/fifa-matches — single manual entry
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateFifaMatchRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateFifaMatchCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const match = schema.data!;

  // Check for existing
  let exists = false;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: {
          entityId: `FIFA_MATCH#${match.match_id}`,
          sk: "FIFA#META",
        },
      })
    );
    if (getRes.Item) exists = true;
  } catch (e) {
    // fallback
  }

  if (!exists) {
    const existing = await db.collection("fifaMatches").doc(match.match_id).get();
    if (existing.exists) exists = true;
  }

  if (exists) {
    return NextResponse.json({ success: false, error: `Match ${match.match_id} already exists` }, { status: 409 });
  }

  const now = Date.now();
  const matchData = {
    ...match,
    createdAt: now,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `FIFA_MATCH#${match.match_id}`,
      sk: "FIFA#META",
      ...matchData,
    },
    firestoreRef: db.collection("fifaMatches").doc(match.match_id),
    firestoreData: {
      ...matchData,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, match_id: match.match_id }, { status: 201 });
}
