// app/api/matches/route.ts — Matches CRUD API (MatchMoments Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchCreate } from "@/lib/validations/matchValidation";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { TABLES } from "@/lib/tableNames";
import { ScanCommand, GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

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

    // 1. Query DynamoDB MatchMoments (with SportsData fallback)
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

      const candidateTables = Array.from(
        new Set([
          ...getCandidateTableNames(TABLES.MatchMoments),
          ...getCandidateTableNames(TABLES.SportsData),
        ])
      );

      for (const table of candidateTables) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: table,
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
            break;
          }
        } catch (tableErr) {
          // Continue to next candidate table
        }
      }
    } catch (e) {
      console.warn("[matches GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (matches.length === 0) {
      let q: FirebaseFirestore.Query = db.collection("matches");

      if (tournament) q = q.where("tournament", "==", tournament);
      if (gender) q = q.where("gender", "==", gender);
      if (format) q = q.where("format", "==", format);
      if (season) q = q.where("season", "==", parseInt(season, 10));

      q = q.orderBy("match_id").limit(limit);

      if (after) {
        const afterDoc = await db.collection("matches").doc(after).get();
        if (afterDoc.exists) {
          q = q.startAfter(afterDoc);
        }
      }

      const snapshot = await q.get();
      matches = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    // 3. Transform & Normalize to complete API Contract
    const data = matches.map((raw) => {
      const match = raw as any;
      const parsedSeason = parseInt(String(match.season ?? ""), 10);
      const matchId = String(match.match_id || match.id || (match.entityId as string)?.replace(/^MATCH#/, "") || "");
      const team1 = match.team1 || match.home_team || "";
      const team2 = match.team2 || match.away_team || "";
      const date = match.date || match.start_date || "";

      return {
        ...match,
        id: matchId,
        match_id: matchId,
        team1,
        team2,
        home_team: team1,
        away_team: team2,
        team1_short: match.team1_short || (team1 ? team1.slice(0, 3).toUpperCase() : ""),
        team2_short: match.team2_short || (team2 ? team2.slice(0, 3).toUpperCase() : ""),
        tournament: String(match.tournament ?? ""),
        season: isNaN(parsedSeason) ? match.season ?? new Date().getFullYear() : parsedSeason,
        gender: String(match.gender ?? "male"),
        format: String(match.format ?? "T20"),
        stage: String(match.stage ?? ""),
        venue: String(match.venue ?? ""),
        city: String(match.city ?? ""),
        date,
        start_date: date,
        time: String(match.time ?? ""),
        total_overs: Number(match.total_overs) || 20,
        status: String(match.status ?? "live"),
        target: match.target != null ? String(match.target) : "",
        winner: String(match.winner ?? "TBD"),
        result_margin: match.result_margin != null ? String(match.result_margin) : undefined,
        current_state: match.current_state,
        broadcast_channels: Array.isArray(match.broadcast_channels) ? match.broadcast_channels : [],
        created_at: match.created_at ?? match.createdAt ?? null,
        updated_at: match.updated_at ?? match.updatedAt ?? null,
      };
    });

    const nextCursor = matches.length === limit ? matches[matches.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
      next_cursor: nextCursor,
    });
  } catch (err: any) {
    console.error("[matches GET] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch matches" },
      { status: 500 }
    );
  }
}

// ─── POST /api/matches
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const schema = validateMatchCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const match = schema.data!;

  // Check for existing in DynamoDB MatchMoments / SportsData
  let exists = false;
  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const table of candidateTables) {
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: {
            entityId: `MATCH#${match.match_id}`,
            sk: "MATCH#META",
          },
        })
      );
      if (getRes.Item) {
        exists = true;
        break;
      }
    } catch (e) {
      // Continue checking next candidate table
    }
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

  // Primary DynamoDB write to MatchMoments table + Firestore dual-write
  await dualWrite({
    tableName: TABLES.MatchMoments,
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

  return NextResponse.json({ success: true, match_id: match.match_id, data: matchPayload }, { status: 201 });
}

// ─── DELETE /api/matches (Fallback by query params: ?match_id=... or ?id=...)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("match_id") || searchParams.get("id");

  if (!matchId) {
    return NextResponse.json({ success: false, error: "match_id query parameter is required" }, { status: 400 });
  }

  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const table of candidateTables) {
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "entityId = :eId",
          ExpressionAttributeValues: { ":eId": `MATCH#${matchId}` },
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        for (const item of qRes.Items) {
          await docClient.send(
            new DeleteCommand({
              TableName: table,
              Key: { entityId: item.entityId, sk: item.sk },
            })
          );
        }
      }
    } catch (e) {
      console.warn(`[matches DELETE] Notice on table ${table}:`, e);
    }
  }

  try {
    const docRef = db.collection("matches").doc(matchId);
    const inningsSnap = await docRef.collection("innings").get();
    const batch = db.batch();
    inningsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(docRef);
    await batch.commit();
  } catch (e) {
    console.warn("[matches DELETE] Firestore notice:", e);
  }

  return NextResponse.json({ success: true, deleted: matchId, message: `Match ${matchId} deleted successfully` });
}
