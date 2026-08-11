// app/api/user-activity/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet & IdentityAndAccess Tables)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  if (!userId) {
    return NextResponse.json({ success: false, error: "userId required" }, { status: 400 });
  }

  try {
    let activities: Array<Record<string, unknown>> = [];
    let userData: Record<string, unknown> = {};

    // 1. Fetch user activities from DynamoDB GamificationAndWallet
    try {
      const actRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :u AND begins_with(sk, :actPrefix)",
          ExpressionAttributeValues: {
            ":u": `USER#${userId}`,
            ":actPrefix": "ACT#",
          },
          ScanIndexForward: false,
          Limit: limit,
        })
      );
      if (actRes.Items && actRes.Items.length > 0) {
        activities = actRes.Items.map((item) => ({
          id: (item.sk as string)?.replace(/^ACT#/, "") || item.transactionId,
          ...item,
        }));
      }
    } catch (err) {
      console.warn("DynamoDB user activity query notice:", err);
    }

    // 2. Fetch user profile from DynamoDB IdentityAndAccess
    try {
      const userRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${userId}`, sk: "USER#META" },
        })
      );
      if (userRes.Item) {
        userData = userRes.Item;
      }
    } catch (err) {
      console.warn("DynamoDB user stats get notice:", err);
    }

    // 3. Fallback to Firebase if needed
    if (activities.length === 0 || Object.keys(userData).length === 0) {
      try {
        const userRef = db.collection("users").doc(userId);
        const [activitySnap, userSnap] = await Promise.all([
          activities.length === 0
            ? userRef.collection("activityLog").orderBy("createdAt", "desc").limit(limit).get()
            : Promise.resolve(null),
          Object.keys(userData).length === 0
            ? userRef.get()
            : Promise.resolve(null),
        ]);

        if (activitySnap) {
          activities = activitySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        if (userSnap && userSnap.exists) {
          userData = userSnap.data() ?? {};
        }
      } catch (fbErr) {
        console.warn("Firebase user-activity fallback notice:", fbErr);
      }
    }

    const liveFeatureStats = (userData.featureStats as Record<string, number>) ?? {};
    const legacyActivityCounts = (userData.activityCounts as Record<string, number>) ?? {};

    const counts: Record<string, number> = {
      ROAR_POST: liveFeatureStats.post ?? legacyActivityCounts.ROAR_POST ?? 0,
      ROAR_DEBATE: liveFeatureStats.debate ?? legacyActivityCounts.ROAR_DEBATE ?? 0,
      ROAR_PREDICTION: liveFeatureStats.predictions ?? legacyActivityCounts.ROAR_PREDICTION ?? 0,
      ROAR_DEBATE_PARTICIPATE: liveFeatureStats.debate_participate ?? legacyActivityCounts.ROAR_DEBATE_PARTICIPATE ?? 0,
      ROAR_PREDICTION_PARTICIPATE: liveFeatureStats.prediction_participate ?? legacyActivityCounts.ROAR_PREDICTION_PARTICIPATE ?? 0,
      ROAR_QUIZ: liveFeatureStats.trivia ?? legacyActivityCounts.ROAR_QUIZ ?? 0,
      ROAR_TRIVIA_CORRECT: liveFeatureStats.trivia ?? legacyActivityCounts.ROAR_TRIVIA_CORRECT ?? 0,
      ROAR_BATTLE_PARTICIPATE: liveFeatureStats.battles ?? legacyActivityCounts.ROAR_BATTLE_PARTICIPATE ?? 0,
      ROAR_HOT_TAKE: legacyActivityCounts.ROAR_HOT_TAKE ?? 0,
      FLASH_QUIZ: legacyActivityCounts.FLASH_QUIZ ?? 0,
      ROAR_MEMORY: liveFeatureStats.post ?? legacyActivityCounts.ROAR_MEMORY ?? 0,
      ROAR_RAW_REACTIONS: liveFeatureStats.post ?? legacyActivityCounts.ROAR_RAW_REACTIONS ?? 0,
    };

    return NextResponse.json({
      success: true,
      activities,
      counts,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/user-activity error:", err);
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}