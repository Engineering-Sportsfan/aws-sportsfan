// app/api/matches/[id]/route.ts — Match Details, Edit & Delete API (MatchMoments Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchUpdate } from "@/lib/validations/matchValidation";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { TABLES } from "@/lib/tableNames";
import { GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/matches/[id] ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    let matchData: any = null;
    let innings: any[] = [];

    // 1. Check DynamoDB MatchMoments (with SportsData fallback)
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
              entityId: `MATCH#${id}`,
              sk: "MATCH#META",
            },
          })
        );
        if (getRes.Item) {
          matchData = getRes.Item;

          // Fetch innings from DynamoDB
          try {
            const qRes = await docClient.send(
              new QueryCommand({
                TableName: table,
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
          } catch {}

          break;
        }
      } catch (tableErr) {
        // Continue to next candidate table
      }
    }

    // 2. Fallback to Firestore
    if (!matchData) {
      const doc = await db.collection("matches").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ success: false, error: `Match ${id} not found` }, { status: 404 });
      }
      matchData = doc.data();

      // Fetch innings subcollection
      try {
        const inningsSnap = await db.collection("matches").doc(id).collection("innings").orderBy("innings_no").get();
        innings = inningsSnap.docs.map((d) => d.data());
      } catch {}
    }

    const team1 = matchData.team1 || matchData.home_team || "";
    const team2 = matchData.team2 || matchData.away_team || "";
    const date = matchData.date || matchData.start_date || "";

    const normalizedData = {
      ...matchData,
      id: String(matchData.match_id || matchData.id || id),
      match_id: String(matchData.match_id || matchData.id || id),
      team1,
      team2,
      home_team: team1,
      away_team: team2,
      team1_short: matchData.team1_short || team1.slice(0, 3).toUpperCase(),
      team2_short: matchData.team2_short || team2.slice(0, 3).toUpperCase(),
      date,
      start_date: date,
      city: matchData.city || "",
      venue: matchData.venue || "",
      tournament: matchData.tournament || "",
      format: matchData.format || "T20",
      stage: matchData.stage || "",
      season: matchData.season || new Date().getFullYear(),
      total_overs: Number(matchData.total_overs) || 20,
      status: matchData.status || "live",
      target: matchData.target != null ? String(matchData.target) : "",
      innings,
    };

    return NextResponse.json({ success: true, data: normalizedData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PATCH /api/matches/[id] ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateMatchUpdate(body);
  if (!validation.success) {
    return NextResponse.json({ success: false, errors: validation.errors }, { status: 422 });
  }

  let existingData: any = null;
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
          Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item;
        break;
      }
    } catch (e) {}
  }

  if (!existingData) {
    try {
      const snap = await db.collection("matches").doc(id).get();
      if (snap.exists) existingData = snap.data();
    } catch {}
  }

  const now = Date.now();
  const updatedMatch = {
    ...(existingData || {}),
    ...validation.data,
    match_id: id,
    updatedAt: now,
  };

  // Primary write to MatchMoments table + Firestore dual-write
  await dualWrite({
    tableName: TABLES.MatchMoments,
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

  return NextResponse.json({ success: true, match_id: id, data: updatedMatch });
}

// ─── DELETE /api/matches/[id] ─────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  // 1. Delete from DynamoDB MatchMoments & SportsData
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
          ExpressionAttributeValues: { ":eId": `MATCH#${id}` },
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
      console.warn(`[matches DELETE] Notice for table ${table}:`, e);
    }
  }

  // 2. Delete from Firestore matches collection
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

  return NextResponse.json({ success: true, deleted: id, message: `Match ${id} deleted successfully` });
}
