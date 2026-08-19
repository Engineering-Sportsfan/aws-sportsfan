// app/api/watch-along/matches/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserSessionAndRole } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches
   List all matches
───────────────────────────────────────────── */
export async function GET() {
  try {
    let matches: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "sk = :skMeta AND (begins_with(entityId, :matchPrefix) OR begins_with(entityId, :watchPrefix))",
          ExpressionAttributeValues: {
            ":skMeta": "MATCH#META",
            ":matchPrefix": "MATCH#",
            ":watchPrefix": "WATCHALONG_MATCH#",
          },
          Limit: 50,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        matches = (scanRes.Items as any[]).map((item) => ({
          id: (item.entityId as string)?.replace(/^(MATCH#|WATCHALONG_MATCH#)/, "") || item.id,
          ...item,
        }));
      }
    } catch (dynErr) {
      console.warn("[watch-along/matches GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (matches.length === 0) {
      const snapshot = await db
        .collection("watchAlongMatches")
        .orderBy("createdAt", "desc")
        .get();

      matches = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    matches.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    return NextResponse.json({ success: true, matches });
  } catch (error) {
    console.error("[watch-along/matches GET]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch matches: " + (error as Error).message },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches
   Creates a new match record.
───────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin", "host"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { matchNo, tournament, team1, team2, stadium, isLive } = body;

    if (!matchNo || !team1?.name || !team2?.name) {
      return NextResponse.json(
        { success: false, message: "matchNo, team1.name, team2.name are required" },
        { status: 400 }
      );
    }

    const matchId = uuidv4();
    const now = Date.now();
    const matchData = {
      id: matchId,
      matchNo: Number(matchNo),
      tournament: tournament || "",
      team1: {
        name: team1.name,
        score: team1.score || "",
        overs: team1.overs || "",
      },
      team2: {
        name: team2.name,
        score: team2.score || "",
        overs: team2.overs || "",
      },
      stadium: stadium || "",
      isLive: Boolean(isLive),
      createdAt: now,
      updatedAt: now,
    };

    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `MATCH#${matchId}`,
        sk: "MATCH#META",
        ...matchData,
      },
      firestoreRef: db.collection("watchAlongMatches").doc(matchId),
      firestoreData: matchData,
    });

    return NextResponse.json({
      success: true,
      match: matchData,
    });
  } catch (error) {
    console.error("[watch-along/matches POST]", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}