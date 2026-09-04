// app/api/engagements/route.ts — Main CRUD API for Fan Battles, Quizzes, Polls & Predictions
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem, EngagementType } from "@/types/engagements";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

// ─── GET /api/engagements — Fetch list with filtering ────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as EngagementType | null; // fan_battle | quiz | poll | prediction
    const status = searchParams.get("status"); // active | inactive | all
    const sport = searchParams.get("sport"); // cricket | football | etc
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const itemsMap = new Map<string, EngagementItem>();

    // 1. Fetch from DynamoDB SocialAndContent table
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "begins_with(contentId, :prefix)",
          ExpressionAttributeValues: {
            ":prefix": "ENGAGEMENT#",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items) {
        for (const it of scanRes.Items) {
          const id = it.id || String(it.contentId || "").replace(/^ENGAGEMENT#/, "");
          itemsMap.set(id, {
            id,
            type: it.type,
            title: it.title,
            subtitle: it.subtitle,
            tags: it.tags || [],
            sport: (it.sport || "cricket").toLowerCase(),
            status: it.status || "active",
            fanBattleData: it.fanBattleData,
            quizData: it.quizData,
            pollData: it.pollData,
            predictionData: it.predictionData,
            likes: Number(it.likes) || 0,
            shares: Number(it.shares) || 0,
            totalEngaged: Number(it.totalEngaged) || 0,
            createdAt: it.createdAt || Date.now(),
            updatedAt: it.updatedAt || Date.now(),
            expiresAt: it.expiresAt || null,
          });
        }
      }
    } catch (dynErr: any) {
      console.warn("DynamoDB engagements scan notice:", dynErr?.message || dynErr);
    }

    // 2. Fetch from Firestore 'engagements' collection and merge
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).get();
        for (const doc of snap.docs) {
          const it = doc.data();
          const id = doc.id;
          if (!itemsMap.has(id)) {
            itemsMap.set(id, {
              id,
              type: it.type,
              title: it.title,
              subtitle: it.subtitle,
              tags: it.tags || [],
              sport: (it.sport || "cricket").toLowerCase(),
              status: it.status || "active",
              fanBattleData: it.fanBattleData,
              quizData: it.quizData,
              pollData: it.pollData,
              predictionData: it.predictionData,
              likes: Number(it.likes) || 0,
              shares: Number(it.shares) || 0,
              totalEngaged: Number(it.totalEngaged) || 0,
              createdAt: it.createdAt || Date.now(),
              updatedAt: it.updatedAt || Date.now(),
              expiresAt: it.expiresAt || null,
            });
          }
        }
      } catch (fbErr: any) {
        console.warn("Firestore engagements fallback notice:", fbErr?.message || fbErr);
      }
    }

    let items = Array.from(itemsMap.values());

    // Apply Filters
    if (type && type !== ("all" as any)) {
      items = items.filter(i => (i.type || "").toLowerCase() === type.toLowerCase());
    }
    if (status && status !== "all") {
      items = items.filter(i => (i.status || "active").toLowerCase() === status.toLowerCase());
    }
    if (sport && sport !== "all") {
      items = items.filter(i => (i.sport || "cricket").toLowerCase() === sport.toLowerCase());
    }

    if (limit > 0) {
      items = items.slice(0, limit);
    }

    // 3. Hydrate user interactions (userLiked, userVoted, userVote) matching api/roar pattern
    const authUser = await getUser(req);
    const resolvedUserId = authUser?.userId || authUser?.email || searchParams.get("userId");

    if (resolvedUserId && items.length > 0) {
      try {
        const [likeResults, voteResults] = await Promise.all([
          Promise.all(
            items.map(it =>
              docClient
                .send(
                  new GetCommand({
                    TableName: TABLES.SocialAndContent,
                    Key: { contentId: `ENGAGEMENT#${it.id}`, sk: `LIKE#${resolvedUserId}` },
                  })
                )
                .catch(() => ({ Item: null }))
            )
          ),
          Promise.all(
            items.map(it =>
              docClient
                .send(
                  new GetCommand({
                    TableName: TABLES.SocialAndContent,
                    Key: { contentId: `ENGAGEMENT#${it.id}`, sk: `VOTE#${resolvedUserId}` },
                  })
                )
                .catch(() => ({ Item: null }))
            )
          ),
        ]);

        items = items.map((it, idx) => ({
          ...it,
          userLiked: !!likeResults[idx]?.Item,
          userVoted: !!voteResults[idx]?.Item,
          userVote: voteResults[idx]?.Item?.selectedOptionId ?? null,
        }));
      } catch (hydrationErr) {
        console.warn("Engagements user interaction hydration notice:", hydrationErr);
      }
    }

    return NextResponse.json({
      success: true,
      engagements: items,
      total: items.length,
    });
  } catch (error: unknown) {
    console.error("GET /api/engagements error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch engagements";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/engagements — Create new Fan Battle, Quiz, Poll, or Prediction ─
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      type,
      title,
      subtitle,
      tags,
      sport,
      status,
      fanBattleData,
      quizData,
      pollData,
      predictionData,
      likes,
      shares,
      totalEngaged,
      expiresAt,
    } = body;

    if (!type || !title) {
      return NextResponse.json({ error: "Type and Title are required" }, { status: 400 });
    }

    const now = Date.now();
    const id = `eng_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Set default tags based on type if omitted
    let computedTags = tags;
    if (!computedTags || computedTags.length === 0) {
      if (type === "fan_battle") computedTags = ["⚔️ FAN BATTLE", "🔥 TRENDING"];
      else if (type === "quiz") computedTags = ["🧠 QUIZ", `⭐ ${quizData?.pointsReward || 50} PTS`];
      else if (type === "poll") computedTags = ["📊 POLL"];
      else if (type === "prediction") computedTags = ["🎯 PREDICTION", "💎 POINTS"];
    }

    const newEngagement: EngagementItem = {
      id,
      type,
      title,
      subtitle: subtitle || "",
      tags: computedTags,
      sport: (sport || "cricket").toLowerCase(),
      status: status || "active",
      fanBattleData: type === "fan_battle" ? fanBattleData : undefined,
      quizData: type === "quiz" ? quizData : undefined,
      pollData: type === "poll" ? pollData : undefined,
      predictionData: type === "prediction" ? predictionData : undefined,
      likes: Number(likes) || 0,
      shares: Number(shares) || 0,
      totalEngaged: Number(totalEngaged) || 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt || null,
    };

    // DynamoDB Item for SocialAndContent table
    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${type.toUpperCase()}`,
      ...newEngagement,
    };

    // Dual Write to DynamoDB + Firestore
    await dualWrite("engagements", id, TABLES.SocialAndContent, dynamoItem);

    return NextResponse.json({
      success: true,
      message: "Engagement created successfully",
      engagement: newEngagement,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
