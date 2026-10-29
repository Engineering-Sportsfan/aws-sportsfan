// app/api/match-moments/route.ts — Match Moments Dual-Write API
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET /api/match-moments ──────────────────────────────────────────────────
// Query params: matchId (optional, filters by match)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  try {
    let moments: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      if (matchId) {
        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: "SportsData",
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${matchId}`,
              ":skPrefix": "MOMENT#",
            },
          })
        );
        if (queryRes.Items && queryRes.Items.length > 0) {
          moments = queryRes.Items.map((item) => ({
            id: item.momentId || item.sk?.replace(/^MOMENT#/, ""),
            ...item,
          }));
        }
      } else {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "SportsData",
            FilterExpression: "begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":skPrefix": "MOMENT#",
            },
            Limit: 200,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          moments = scanRes.Items.map((item) => ({
            id: item.momentId || item.sk?.replace(/^MOMENT#/, ""),
            ...item,
          }));
        }
      }
    } catch (dynErr) {
      console.warn("[match-moments GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore if empty
    if (moments.length === 0 && db) {
      try {
        let q: FirebaseFirestore.Query = db.collection("match_moments");
        if (matchId) {
          q = q.where("matchId", "==", matchId);
        }
        const snap = await q.get();
        moments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (fbErr) {
        console.warn("[match-moments GET] Firestore fallback notice:", fbErr);
      }
    }

    // Sort by createdAt / over if available
    moments.sort((a, b) => {
      if (a.innings !== b.innings) return (a.innings || 1) - (b.innings || 1);
      const ovA = parseFloat(a.overs || "0");
      const ovB = parseFloat(b.overs || "0");
      if (ovA !== ovB) return ovA - ovB;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return NextResponse.json({
      success: true,
      data: moments,
      count: moments.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch match moments" },
      { status: 500 }
    );
  }
}

// ─── POST /api/match-moments ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      momentId,
      matchId,
      innings = 1,
      overs = "0.1",
      score = "",
      matchOverTimestamp = "",
      event = "Moment",
      matchMoment = "",
      description = "",
      status = "active",
    } = body;

    if (!momentId || !matchId) {
      return NextResponse.json(
        { success: false, error: "momentId and matchId are required fields" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const cleanMomentId = String(momentId).trim();
    const cleanMatchId = String(matchId).trim();

    const payload = {
      momentId: cleanMomentId,
      matchId: cleanMatchId,
      innings: Number(innings) || 1,
      overs: String(overs).trim(),
      score: String(score).trim(),
      matchOverTimestamp: String(matchOverTimestamp).trim(),
      event: String(event).trim(),
      matchMoment: String(matchMoment).trim(),
      description: String(description).trim(),
      status: status || "active",
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write to DynamoDB SportsData + Firestore match_moments
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `MATCH#${cleanMatchId}`,
        sk: `MOMENT#${cleanMomentId}`,
        ...payload,
      },
      collectionName: "match_moments",
      docId: `${cleanMatchId}_${cleanMomentId}`,
      firestoreData: payload,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Match Moment ${cleanMomentId} created successfully`,
        data: payload,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[match-moments POST] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create match moment" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/match-moments ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const momentId = searchParams.get("momentId");
  const matchId = searchParams.get("matchId");

  if (!momentId || !matchId) {
    return NextResponse.json(
      { success: false, error: "momentId and matchId are required for deletion" },
      { status: 400 }
    );
  }

  try {
    await dualDelete({
      tableName: "SportsData",
      key: {
        entityId: `MATCH#${matchId}`,
        sk: `MOMENT#${momentId}`,
      },
      collectionName: "match_moments",
      docId: `${matchId}_${momentId}`,
    });

    return NextResponse.json({ success: true, message: `Moment ${momentId} deleted` });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete match moment" },
      { status: 500 }
    );
  }
}
