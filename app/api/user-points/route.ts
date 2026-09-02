// app/api/user-points/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet & IdentityAndAccess Tables)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { awardUserPoints, getUserInfo } from "@/lib/userPoints";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── POST — Award points to a user ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      actualUserId,
      userId: requestedUserId,
      userEmail,
      userName,
      reason,
      transactionId,
      points,
      metadata,
    } = body;
    const userId = requestedUserId || actualUserId;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!reason || typeof reason !== "string") {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }
    if (!transactionId || typeof transactionId !== "string") {
      return NextResponse.json(
        { error: "transactionId is required — supply a deterministic ID to ensure idempotency" },
        { status: 400 }
      );
    }
    if (!points || typeof points !== "number" || points <= 0) {
      return NextResponse.json(
        { error: "points must be a positive number" },
        { status: 400 }
      );
    }

    const {
      userName: resolvedName,
      userEmail: resolvedEmail,
      exists: userExists,
    } = await getUserInfo(userId, userName, userEmail);

    const awarded = await awardUserPoints({
      actualUserId: actualUserId || userId,
      userName: resolvedName,
      userEmail: resolvedEmail,
      userExists,
      points,
      reason,
      transactionId,
      metadata,
    });

    if (!awarded) {
      return NextResponse.json(
        { error: "Transaction already recorded", alreadyAwarded: true },
        { status: 409 }
      );
    }

    // Fetch updated total points from DynamoDB IdentityAndAccess
    let totalPointsAfter = points;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: { entityId: `USER#${actualUserId || userId}`, sk: "USER#META" },
        })
      );
      if (getRes.Item?.totalPoints) {
        totalPointsAfter = getRes.Item.totalPoints as number;
      }
    } catch (err) {
      console.warn("DynamoDB user points read notice:", err);
    }

    // Fallback to Firebase if not found in DynamoDB
    if (totalPointsAfter === points) {
      try {
        const userSnap = await db.collection("users").doc(actualUserId || userId).get();
        if (userSnap.exists) {
          totalPointsAfter = userSnap.data()?.totalPoints ?? points;
        }
      } catch (fbErr) {
        console.warn("Firebase user points fallback notice:", fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      pointsAwarded: points,
      totalPointsAfter,
      reason,
      message: `+${points} points awarded!`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/user-points error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET — Fetch leaderboard ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    let leaderboard: Array<Record<string, unknown>> = [];

    // 1. Query DynamoDB GamificationAndWallet table for leaderboard
    try {
      const queryRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          IndexName: "leaderboardType-points-index",
          KeyConditionExpression: "leaderboardType = :g",
          ExpressionAttributeValues: { ":g": "GLOBAL" },
          ScanIndexForward: false, // Descending order
          Limit: limit,
        })
      );

      if (queryRes.Items && queryRes.Items.length > 0) {
        leaderboard = queryRes.Items.map((item, idx) => ({
          rank: idx + 1,
          userId: item.userId?.toString().replace(/^USER#/, "") || item.id,
          userName: item.userName || "Fan",
          userEmail: item.userEmail || "",
          totalPoints: item.points ?? item.totalPoints ?? 0,
          ...item,
        }));
      }
    } catch (err) {
      console.warn("DynamoDB leaderboard query notice:", err);
    }

    // Fallback to Firebase
    if (leaderboard.length === 0) {
      try {
        const leaderboardSnap = await db
          .collection("globalLeaderboard")
          .orderBy("totalPoints", "desc")
          .limit(limit)
          .get();

        leaderboard = leaderboardSnap.docs.map((doc, idx) => ({
          rank: idx + 1,
          userId: doc.id,
          ...doc.data(),
        }));
      } catch (fbErr) {
        console.warn("Firebase leaderboard fallback notice:", fbErr);
      }
    }

    let currentUser: Record<string, unknown> | null = null;

    if (userId && userId !== "null" && userId !== "undefined") {
      const decodedUserId = decodeURIComponent(userId);

      // Check current user in leaderboard array first
      const foundInLeaderboard = leaderboard.find(
        (u) => u.userId === decodedUserId || (u.userId as string)?.replace(/^USER#/, "") === decodedUserId
      );

      if (foundInLeaderboard) {
        currentUser = foundInLeaderboard;
      } else {
        // Query user from DynamoDB IdentityAndAccess
        try {
          const userGet = await docClient.send(
            new GetCommand({
              TableName: TABLES.IdentityAndAccess,
              Key: { entityId: `USER#${decodedUserId}`, sk: "USER#META" },
            })
          );
          if (userGet.Item) {
            currentUser = {
              userId: decodedUserId,
              userName: `${(userGet.Item.firstName as string) || ""} ${(userGet.Item.lastName as string) || ""}`.trim() || userGet.Item.name || "Fan",
              totalPoints: userGet.Item.totalPoints || userGet.Item.totalXP || 0,
              ...userGet.Item,
            };
          }
        } catch (err) {
          console.warn("DynamoDB current user get notice:", err);
        }

        if (!currentUser) {
          try {
            const userDoc = await db.collection("globalLeaderboard").doc(decodedUserId).get();
            if (userDoc.exists) {
              currentUser = { userId: userDoc.id, ...userDoc.data() };
            }
          } catch (fbErr) {
            console.warn("Firebase current user fallback notice:", fbErr);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      leaderboard,
      currentUser,
      total: leaderboard.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/user-points error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
