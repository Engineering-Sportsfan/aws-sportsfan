// app/api/battle/battle-session/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET /api/battle/battle-session ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const battleId = searchParams.get("battleId");
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // 1. If battleId is provided, fetch single session from DynamoDB
    if (battleId) {
      let sessionData: Record<string, unknown> | null = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: {
              userId: `USER#${userId}`,
              sk: `BATTLE_SESSION#${battleId}`,
            },
          })
        );
        if (getRes.Item) {
          sessionData = getRes.Item;
        }
      } catch (err) {
        console.warn("DynamoDB get battle session notice:", err);
      }

      if (!sessionData) {
        try {
          const snapshot = await db
            .collection("battleSessions")
            .where("battleId", "==", battleId)
            .where("userId", "==", userId)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            sessionData = { id: doc.id, ...doc.data() };
          }
        } catch (fbErr) {
          console.warn("Firebase battle session fallback notice:", fbErr);
        }
      }

      if (!sessionData) {
        return NextResponse.json({ success: true, data: null, message: "No session found" });
      }

      return NextResponse.json({
        success: true,
        data: {
          id: (sessionData.sk as string)?.replace(/^BATTLE_SESSION#/, "") || sessionData.id,
          ...sessionData,
        },
      });
    }

    // 2. Fetch all sessions for user
    let sessions: Array<Record<string, unknown>> = [];
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :u AND begins_with(sk, :bsPrefix)",
          ExpressionAttributeValues: {
            ":u": `USER#${userId}`,
            ":bsPrefix": "BATTLE_SESSION#",
          },
          Limit: 50,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        sessions = qRes.Items.map((item) => ({
          id: (item.sk as string)?.replace(/^BATTLE_SESSION#/, "") || item.id,
          ...item,
        }));
      }
    } catch (err) {
      console.warn("DynamoDB query battle sessions notice:", err);
    }

    if (sessions.length === 0) {
      try {
        const snapshot = await db
          .collection("battleSessions")
          .where("userId", "==", userId)
          .orderBy("completedAt", "desc")
          .get();

        sessions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      } catch (fbErr) {
        console.warn("Firebase battle sessions query fallback notice:", fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: sessions,
      total: sessions.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battle/battle-session error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/battle/battle-session ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { battleId, userId, userName, userEmail } = body;

    if (!battleId || !userId) {
      return NextResponse.json(
        { error: "battleId and userId are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const sessionId = `bs_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const sessionPayload = {
      sessionId,
      battleId,
      userId,
      userName: userName || "",
      userEmail: userEmail || "",
      status: "completed",
      totalVotes: 0,
      totalPointsEarned: 0,
      startedAt: now,
      completedAt: now,
      updatedAt: now,
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      ...sessionPayload,
      userId: `USER#${userId}`,
      sk: `BATTLE_SESSION#${battleId}`,
    };

    await dualWrite("battleSessions", sessionId, "GamificationAndWallet", dynamoItem);

    return NextResponse.json({
      success: true,
      data: { id: sessionId, ...sessionPayload },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/battle/battle-session error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}