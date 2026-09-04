// app/api/engagements/[id]/vote/route.ts — Interactive Voting, Quiz Validation & Prediction Staking with Single-Vote Enforcement
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id]/vote — Check if user has already voted ─────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const authUser = await getUser(req);
    const userId = authUser?.userId || authUser?.email || searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ hasVoted: false });
    }

    let voteItem: any = null;

    // 1. Check standardized DynamoDB key shape: contentId = ENGAGEMENT#{id}, sk = VOTE#{userId}
    try {
      const getVote = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${userId}` },
        })
      );
      if (getVote.Item) voteItem = getVote.Item;
    } catch (dynErr) {
      console.warn("DynamoDB vote status check notice:", dynErr);
    }

    // 2. Fallback: Check legacy DynamoDB key shape: contentId = USER_VOTE#{userId}, sk = ENGAGEMENT#{id}
    if (!voteItem) {
      try {
        const legacyVote = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `USER_VOTE#${userId}`, sk: `ENGAGEMENT#${id}` },
          })
        );
        if (legacyVote.Item) voteItem = legacyVote.Item;
      } catch {}
    }

    // 3. Fallback: Check Firestore user_engagements collection
    if (!voteItem && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${userId}_${id}`).get();
        if (snap.exists) voteItem = snap.data();
      } catch {}
    }

    return NextResponse.json({
      hasVoted: !!voteItem,
      selectedOptionId: voteItem?.selectedOptionId || null,
      vote: voteItem,
    });
  } catch (error: unknown) {
    console.error("GET /api/engagements/[id]/vote error:", error);
    return NextResponse.json({ hasVoted: false });
  }
}

// ─── POST /api/engagements/[id]/vote — Cast Vote (Enforces 1 vote per user) ───
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { selectedOptionId, userId: inputUserId } = body;

    if (!selectedOptionId) {
      return NextResponse.json({ error: "selectedOptionId is required" }, { status: 400 });
    }

    // Try to get authenticated user or fallback to input ID / client identifier
    const authUser = await getUser(req);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      inputUserId ||
      req.headers.get("x-user-id") ||
      `anon_${req.headers.get("x-forwarded-for") || "client"}`;

    // ─── Step 1: Enforce Single-Vote Pre-check ────────────────────────────────
    let existingVote: any = null;

    if (userId) {
      // Check standardized DynamoDB key: contentId = ENGAGEMENT#{id}, sk = VOTE#{userId}
      try {
        const voteRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${userId}` },
          })
        );
        if (voteRes.Item) {
          existingVote = voteRes.Item;
        }
      } catch (dynCheckErr) {
        console.warn("DynamoDB existing vote check notice:", dynCheckErr);
      }

      // Check legacy DynamoDB key format: contentId = USER_VOTE#{userId}, sk = ENGAGEMENT#{id}
      if (!existingVote) {
        try {
          const legacyVoteRes = await docClient.send(
            new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `USER_VOTE#${userId}`, sk: `ENGAGEMENT#${id}` },
            })
          );
          if (legacyVoteRes.Item) {
            existingVote = legacyVoteRes.Item;
          }
        } catch {}
      }

      // Firestore fallback check
      if (!existingVote && db) {
        try {
          const snap = await db.collection("user_engagements").doc(`${userId}_${id}`).get();
          if (snap.exists) {
            existingVote = snap.data();
          }
        } catch {}
      }
    }

    if (existingVote) {
      return NextResponse.json(
        {
          success: false,
          alreadyVoted: true,
          error: "You have already voted on this engagement",
          selectedOptionId: existingVote.selectedOptionId,
          previousVote: existingVote,
        },
        { status: 400 }
      );
    }

    // ─── Step 2: Fetch Current Engagement Item ───────────────────────────────
    let item: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) item = getRes.Item;
    } catch {}

    if (!item && db) {
      const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
      if (snap.exists) item = { id: snap.id, ...snap.data() };
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    let responseData: Record<string, any> = { success: true };
    const now = Date.now();

    // ─── Step 3: Vote Calculation by Type ─────────────────────────────────────
    // 3.1 Fan Battle Vote Handling
    if (item.type === "fan_battle" && item.fanBattleData) {
      const left = { ...item.fanBattleData.leftCompetitor };
      const right = { ...item.fanBattleData.rightCompetitor };

      if (selectedOptionId === "left" || selectedOptionId === left.name || selectedOptionId === left.code) {
        left.votes = (Number(left.votes) || 0) + 1;
      } else {
        right.votes = (Number(right.votes) || 0) + 1;
      }

      const total = (left.votes || 0) + (right.votes || 0);
      const leftPct = total > 0 ? Math.round((left.votes / total) * 100) : 50;
      const rightPct = 100 - leftPct;

      item.fanBattleData.leftCompetitor = left;
      item.fanBattleData.rightCompetitor = right;
      item.fanBattleData.totalVotes = total;
      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;

      responseData = {
        success: true,
        type: "fan_battle",
        selectedOptionId,
        leftPercentage: leftPct,
        rightPercentage: rightPct,
        leftVotes: left.votes,
        rightVotes: right.votes,
        totalVotes: total,
      };
    }

    // 3.2 Quiz Answer Handling
    else if (item.type === "quiz" && item.quizData) {
      const isCorrect = String(selectedOptionId).trim().toUpperCase() === String(item.quizData.correctOptionId).trim().toUpperCase();
      const pointsAwarded = isCorrect ? Number(item.quizData.pointsReward || 50) : 0;

      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;

      // Award points if user is authenticated and answer is correct
      if (isCorrect && authUser?.email) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.IdentityAndAccess,
              Key: { entityId: `USER#${authUser.email}`, sk: "USER#META" },
              UpdateExpression: "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, totalXP = if_not_exists(totalXP, :zero) + :pts",
              ExpressionAttributeValues: {
                ":zero": 0,
                ":pts": pointsAwarded,
              },
            })
          );
        } catch (pointErr) {
          console.warn("Could not award quiz points:", pointErr);
        }
      }

      responseData = {
        success: true,
        type: "quiz",
        isCorrect,
        correctOptionId: item.quizData.correctOptionId,
        pointsAwarded,
        explanation: item.quizData.explanation || `Correct: ${item.quizData.correctOptionId}`,
      };
    }

    // 3.3 Poll Vote Handling
    else if (item.type === "poll" && item.pollData) {
      const options = (item.pollData.options || []).map((opt: any) => {
        if (opt.id === selectedOptionId || opt.text === selectedOptionId) {
          return { ...opt, votes: (Number(opt.votes) || 0) + 1 };
        }
        return { ...opt, votes: Number(opt.votes) || 0 };
      });

      const totalVotes = options.reduce((sum: number, o: any) => sum + (o.votes || 0), 0);
      const optionsWithPercentages = options.map((opt: any) => ({
        ...opt,
        percentage: totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0,
      }));

      item.pollData.options = options;
      item.pollData.totalVotes = totalVotes;
      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;

      responseData = {
        success: true,
        type: "poll",
        selectedOptionId,
        options: optionsWithPercentages,
        totalVotes,
      };
    }

    // 3.4 Prediction Stake Handling
    else if (item.type === "prediction" && item.predictionData) {
      const left = { ...item.predictionData.leftChoice };
      const right = { ...item.predictionData.rightChoice };

      if (selectedOptionId === "left" || selectedOptionId === left.text || selectedOptionId === left.code) {
        left.votes = (Number(left.votes) || 0) + 1;
      } else {
        right.votes = (Number(right.votes) || 0) + 1;
      }

      const total = (left.votes || 0) + (right.votes || 0);
      const leftPct = total > 0 ? Math.round((left.votes / total) * 100) : 50;
      const rightPct = 100 - leftPct;

      item.predictionData.leftChoice = left;
      item.predictionData.rightChoice = right;
      item.predictionData.totalVotes = total;
      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;

      responseData = {
        success: true,
        type: "prediction",
        selectedOptionId,
        leftPercentage: leftPct,
        rightPercentage: rightPct,
        coinsLocked: item.predictionData.coinStake || 25,
        totalVotes: total,
      };
    }

    // ─── Step 4: Update Parent Engagement Item ────────────────────────────────
    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${String(item.type).toUpperCase()}`,
      ...item,
      updatedAt: now,
    };

    await dualWrite("engagements", id, TABLES.SocialAndContent, dynamoItem);

    // ─── Step 5: Save User Vote Record ────────────────────────────────────────
    const userRecord = {
      userId,
      engagementId: id,
      type: item.type,
      selectedOptionId,
      votedAt: now,
      timestamp: now,
      ...responseData,
    };

    // A. Standardized DynamoDB Key: contentId = ENGAGEMENT#{id}, sk = VOTE#{userId} (Matches api/roar pattern)
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${id}`,
            sk: `VOTE#${userId}`,
            entityId: `VOTE#${String(item.type).toUpperCase()}`,
            ...userRecord,
          },
        })
      );
    } catch (dynVoteErr) {
      console.warn("DynamoDB standard vote record notice:", dynVoteErr);
    }

    // B. Legacy DynamoDB Key: contentId = USER_VOTE#{userId}, sk = ENGAGEMENT#{id} (Backwards compatibility)
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `USER_VOTE#${userId}`,
            sk: `ENGAGEMENT#${id}`,
            entityId: `VOTE#${String(item.type).toUpperCase()}`,
            ...userRecord,
          },
        })
      );
    } catch {}

    // C. Save user vote record to Firestore
    if (db) {
      try {
        await db.collection("user_engagements").doc(`${userId}_${id}`).set(userRecord);
      } catch (fbVoteErr) {
        console.warn("Firestore user vote record notice:", fbVoteErr);
      }
    }

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/vote error:", error);
    const msg = error instanceof Error ? error.message : "Voting failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
