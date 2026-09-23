// app/api/engagements/[id]/vote/route.ts — Interactive Voting, Quiz Validation & Prediction Staking with Single-Vote Enforcement
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, UpdateCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { awardEngagementPoints } from "@/lib/engagementPoints";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id]/vote — Check if user has already voted ─────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const authUser = await getUser(req);
    const userId = authUser?.userId || searchParams.get("userId") || authUser?.email;
    const userEmail = authUser?.email || searchParams.get("userEmail");

    if (!userId && !userEmail) {
      return NextResponse.json({ hasVoted: false });
    }

    let voteItem: any = null;
    const candidateIds = Array.from(new Set([userId, userEmail, searchParams.get("userId")].filter(Boolean))) as string[];

    // 1. Check standardized DynamoDB key shape for each candidate ID
    for (const uid of candidateIds) {
      if (voteItem) break;
      try {
        // Query any vote starting with VOTE#{uid}
        const queryVote = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":cid": `ENGAGEMENT#${id}`,
              ":skpfx": `VOTE#${uid}`,
            },
            Limit: 1,
          })
        );
        if (queryVote.Items && queryVote.Items.length > 0) {
          voteItem = queryVote.Items[0];
          break;
        }

        // Also direct GetCommand for exact match
        const getVote = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}` },
          })
        );
        if (getVote.Item) {
          voteItem = getVote.Item;
          break;
        }
      } catch (dynErr) {
        console.warn("DynamoDB vote status check notice:", dynErr);
      }
    }

    // 2. Fallback: Check legacy DynamoDB key shape: contentId = USER_VOTE#{userId}, sk begins_with ENGAGEMENT#{id}
    if (!voteItem) {
      for (const uid of candidateIds) {
        if (voteItem) break;
        try {
          const legacyQuery = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `USER_VOTE#${uid}`,
                ":skpfx": `ENGAGEMENT#${id}`,
              },
              Limit: 1,
            })
          );
          if (legacyQuery.Items && legacyQuery.Items.length > 0) {
            voteItem = legacyQuery.Items[0];
            break;
          }
        } catch { }
      }
    }

    // 3. Fallback: Check Firestore user_engagements collection
    if (!voteItem && db) {
      for (const uid of candidateIds) {
        if (voteItem) break;
        try {
          const snap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}`).get();
          if (snap.exists) {
            voteItem = snap.data();
            break;
          }
          // Also check doc ID query
          const qSnap = await db
            .collection(getFirestoreCollection("user_engagements"))
            .where("userId", "==", uid)
            .where("engagementId", "==", id)
            .limit(1)
            .get();
          if (!qSnap.empty) {
            voteItem = qSnap.docs[0].data();
            break;
          }
        } catch { }
      }
    }

    // 4. Fetch Engagement Metadata for Timer Expiry & Correct Answer Check
    let engagementItem: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) engagementItem = getRes.Item;
    } catch { }

    if (!engagementItem && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
        if (snap.exists) engagementItem = { id: snap.id, ...snap.data() };
      } catch { }
    }

    const now = Date.now();
    const expiresAt = engagementItem?.expiresAt || engagementItem?.pollData?.expiresAt || engagementItem?.predictionData?.expiresAt;
    const isExpired = Boolean(expiresAt && now >= Number(expiresAt));

    let correctAnswer = "";
    let winningChoiceId = "";
    if (engagementItem?.type === "poll") {
      correctAnswer = engagementItem.pollData?.correctAnswer || engagementItem.pollData?.answer || "";
    } else if (engagementItem?.type === "prediction") {
      correctAnswer = engagementItem.predictionData?.correctAnswer || engagementItem.predictionData?.answer || "";
      winningChoiceId = engagementItem.predictionData?.winningChoiceId || "";
    }

    let isCorrect: boolean | null = null;
    let wonBonusPoints = 0;

    if (voteItem && (engagementItem?.type === "poll" || engagementItem?.type === "prediction")) {
      const userChoice = String(voteItem.selectedOptionId || "").trim().toLowerCase();
      const leftText = String(engagementItem.predictionData?.leftChoice?.text || "").trim().toLowerCase();
      const rightText = String(engagementItem.predictionData?.rightChoice?.text || "").trim().toLowerCase();
      const winTarget = String(winningChoiceId || correctAnswer).trim().toLowerCase();

      if (engagementItem.type === "prediction") {
        if (winTarget) {
          isCorrect = Boolean(
            (winTarget === "left" && (userChoice === "left" || userChoice === leftText)) ||
            (winTarget === "right" && (userChoice === "right" || userChoice === rightText)) ||
            (userChoice === winTarget) ||
            (!!leftText && winTarget === leftText && (userChoice === "left" || userChoice === leftText)) ||
            (!!rightText && winTarget === rightText && (userChoice === "right" || userChoice === rightText))
          );
        }
      } else if (engagementItem.type === "poll") {
        if (correctAnswer) {
          const correctLower = String(correctAnswer).trim().toLowerCase();
          isCorrect = userChoice === correctLower;
          if (!isCorrect && engagementItem.pollData?.options) {
            const chosenOpt = engagementItem.pollData.options.find(
              (o: any) => String(o.id).toLowerCase() === userChoice || String(o.text).trim().toLowerCase() === userChoice
            );
            const targetOpt = engagementItem.pollData.options.find(
              (o: any) => String(o.id).toLowerCase() === correctLower || String(o.text).trim().toLowerCase() === correctLower
            );
            if (chosenOpt && targetOpt && chosenOpt.id === targetOpt.id) {
              isCorrect = true;
            }
          }
        }
      }

      // If timer is expired and prediction was correct, award +10 points if not already awarded
      if (isExpired && isCorrect && !voteItem.accuracyBonusAwarded) {
        try {
          const awardUid = voteItem.userId || userId;
          await awardEngagementPoints({
            userId: awardUid,
            userEmail: authUser?.email,
            userName: authUser?.name,
            action: "participate",
            engagementId: id,
            engagementType: engagementItem.type,
            engagementTitle: engagementItem.title,
            quizPointsBonus: 10,
            metadata: {
              reason: "CORRECT_PREDICTION_BONUS",
              bonusPoints: 10,
            },
          });

          // Mark accuracyBonusAwarded = true in DynamoDB
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk: voteItem.sk || `VOTE#${awardUid}` },
              UpdateExpression: "SET accuracyBonusAwarded = :t, isCorrect = :t, wonBonusPoints = :pts",
              ExpressionAttributeValues: {
                ":t": true,
                ":pts": 10,
              },
            })
          );

          // Mark in Firestore
          if (db) {
            await db.collection(getFirestoreCollection("user_engagements")).doc(`${awardUid}_${id}`).set({
              accuracyBonusAwarded: true,
              isCorrect: true,
              wonBonusPoints: 10,
              resolvedAt: now,
            }, { merge: true });
          }

          voteItem.accuracyBonusAwarded = true;
          voteItem.isCorrect = true;
          voteItem.wonBonusPoints = 10;
          wonBonusPoints = 10;
        } catch (awardErr) {
          console.warn("Failed to award accuracy bonus points:", awardErr);
        }
      } else if (voteItem.accuracyBonusAwarded) {
        wonBonusPoints = voteItem.wonBonusPoints || 10;
      }
    }

    return NextResponse.json({
      hasVoted: !!voteItem,
      selectedOptionId: voteItem?.selectedOptionId || null,
      vote: voteItem,
      isExpired,
      expiresAt: expiresAt || null,
      isCorrect,
      wonBonusPoints,
      correctAnswer: correctAnswer || winningChoiceId || null,
      winningChoiceId: winningChoiceId || null,
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
    const { selectedOptionId, questionId, userId: inputUserId, userName, userAvatar } = body;

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

    const voteSk = questionId ? `VOTE#${userId}#${questionId}` : `VOTE#${userId}`;
    const firestoreVoteDocId = questionId ? `${userId}_${id}_${questionId}` : `${userId}_${id}`;

    // ─── Step 1: Enforce Single-Vote Pre-check ────────────────────────────────
    let existingVote: any = null;
    const candidateIds = Array.from(
      new Set([userId, inputUserId, authUser?.userId, authUser?.email].filter(Boolean))
    ) as string[];

    for (const uid of candidateIds) {
      if (existingVote) break;
      // 1. Check standardized DynamoDB key shape with begins_with VOTE#
      try {
        const queryVote = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":cid": `ENGAGEMENT#${id}`,
              ":skpfx": `VOTE#${uid}`,
            },
            Limit: 1,
          })
        );
        if (queryVote.Items && queryVote.Items.length > 0) {
          existingVote = queryVote.Items[0];
          break;
        }

        // Direct key check
        const voteRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}` },
          })
        );
        if (voteRes.Item) {
          existingVote = voteRes.Item;
          break;
        }
      } catch (dynCheckErr) {
        console.warn("DynamoDB existing vote check notice:", dynCheckErr);
      }

      // 2. Check legacy DynamoDB key format: contentId = USER_VOTE#{uid}, sk begins_with ENGAGEMENT#{id}
      if (!existingVote) {
        try {
          const legacyVoteRes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `USER_VOTE#${uid}`,
                ":skpfx": `ENGAGEMENT#${id}`,
              },
              Limit: 1,
            })
          );
          if (legacyVoteRes.Items && legacyVoteRes.Items.length > 0) {
            existingVote = legacyVoteRes.Items[0];
            break;
          }
        } catch { }
      }

      // 3. Firestore fallback check
      if (!existingVote && db) {
        try {
          const snap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}`).get();
          if (snap.exists) {
            existingVote = snap.data();
            break;
          }
          if (questionId) {
            const qSnap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}_${questionId}`).get();
            if (qSnap.exists) {
              existingVote = qSnap.data();
              break;
            }
          }
        } catch { }
      }
    }

    if (existingVote) {
      return NextResponse.json(
        {
          success: false,
          alreadyVoted: true,
          error: "You have already voted on this question",
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
    } catch { }

    if (!item && db) {
      const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
      if (snap.exists) item = { id: snap.id, ...snap.data() };
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (item.expiresAt && Date.now() >= Number(item.expiresAt)) {
      return NextResponse.json(
        {
          success: false,
          error: "Voting is closed. This event's timer has expired.",
          isExpired: true,
        },
        { status: 400 }
      );
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
        participationPointsAwarded: 2,
        pointsAwarded: 2,
      };
    }

    // 3.2 Quiz Answer Handling
    else if (item.type === "quiz" && item.quizData) {
      // Find matching question if questions array is present
      const targetQ =
        item.quizData.questions?.find((q: any) => q.id === questionId) ||
        item.quizData.questions?.[0] ||
        item.quizData;

      const correctOptId = targetQ.correctOptionId || "B";
      const ptsReward = Number(targetQ.pointsReward || item.quizData.pointsReward || 50);
      const isCorrect = String(selectedOptionId).trim().toUpperCase() === String(correctOptId).trim().toUpperCase();
      const pointsAwarded = isCorrect ? ptsReward : 0;
      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;

      responseData = {
        success: true,
        type: "quiz",
        questionId: targetQ.id || questionId,
        isCorrect,
        correctOptionId: correctOptId,
        quizPointsAwarded: pointsAwarded,
        participationPointsAwarded: 2,
        pointsAwarded: pointsAwarded + 2,
        explanation: targetQ.explanation || item.quizData.explanation || `Correct: ${correctOptId}`,
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
        participationPointsAwarded: 2,
        pointsAwarded: 2,
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
        participationPointsAwarded: 2,
        pointsAwarded: 2,
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

    // ─── Step 4.5: Award Participation Points (+2 points for quiz, polls, predictions, battles) ─
    const quizBonus = item.type === "quiz" && responseData?.isCorrect ? Number(responseData.quizPointsAwarded || 0) : 0;
    try {
      const awardRes = await awardEngagementPoints({
        userId,
        userEmail: authUser?.email || body.userEmail || "",
        userName: userName || authUser?.name || "",
        action: "participate",
        engagementId: id,
        engagementType: item.type,
        engagementTitle: item.title,
        questionId: questionId || undefined,
        quizPointsBonus: quizBonus,
      });
      if (awardRes.success) {
        responseData.pointsAwarded = awardRes.pointsAwarded;
      }
    } catch (ptsErr) {
      console.warn("[POST /api/engagements/[id]/vote] Failed to award participation points:", ptsErr);
    }

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

    // A. Standardized DynamoDB Key: contentId = ENGAGEMENT#{id}, sk = voteSk
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${id}`,
            sk: voteSk,
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
            sk: questionId ? `ENGAGEMENT#${id}#${questionId}` : `ENGAGEMENT#${id}`,
            entityId: `VOTE#${String(item.type).toUpperCase()}`,
            ...userRecord,
          },
        })
      );
    } catch { }

    // C. Save user vote record to Firestore
    if (db) {
      try {
        await db.collection("user_engagements").doc(firestoreVoteDocId).set(userRecord);
      } catch (fbVoteErr) {
        console.warn("Firestore user vote record notice:", fbVoteErr);
      }
    }

    // ─── Step 6: Update FlipARENA Leaderboard (Quizzes, Polls, Predictions, Battles) ─
    const isQuiz = item.type === "quiz";
    const isCorrect = isQuiz ? Boolean(responseData?.isCorrect) : false;
    const earnedPts = Number(responseData?.pointsAwarded ?? (isQuiz && isCorrect ? 52 : 2));
    const displayName = userName || authUser?.name || "Fan Quizzer";
    const avatar =
      userAvatar ||
      (authUser as any)?.picture ||
      (authUser as any)?.photoURL ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;

    const userEmailVal = (authUser?.email || body.userEmail || "").trim() || `${userId}@sportsfan360.com`;

    // 1. DynamoDB: Update QUIZ_LEADERBOARD#GLOBAL and QUIZ_LEADERBOARD#{id}
    try {
      const updateGlobal = docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: "QUIZ_LEADERBOARD#GLOBAL", sk: `USER#${userId}` },
          UpdateExpression:
            "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
            "correctCount = if_not_exists(correctCount, :zero) + :corr, " +
            "incorrectCount = if_not_exists(incorrectCount, :zero) + :incorr, " +
            "totalAnswered = if_not_exists(totalAnswered, :zero) + :one, " +
            "userName = :uname, userAvatar = :uavatar, userEmail = :uemail, " +
            "lastAnsweredAt = :now, updatedAt = :now, entityId = :entity, userId = :uid",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":pts": earnedPts,
            ":corr": isCorrect ? 1 : 0,
            ":incorr": isQuiz && !isCorrect ? 1 : 0,
            ":one": 1,
            ":uname": displayName,
            ":uavatar": avatar,
            ":uemail": userEmailVal,
            ":now": now,
            ":entity": "QUIZ_LEADERBOARD",
            ":uid": userId,
          },
        })
      );

      const updateQuiz = docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `QUIZ_LEADERBOARD#${id}`, sk: `USER#${userId}` },
          UpdateExpression:
            "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
            "correctCount = if_not_exists(correctCount, :zero) + :corr, " +
            "incorrectCount = if_not_exists(incorrectCount, :zero) + :incorr, " +
            "totalAnswered = if_not_exists(totalAnswered, :zero) + :one, " +
            "userName = :uname, userAvatar = :uavatar, userEmail = :uemail, " +
            "lastAnsweredAt = :now, updatedAt = :now, entityId = :entity, userId = :uid, quizId = :qid",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":pts": earnedPts,
            ":corr": isCorrect ? 1 : 0,
            ":incorr": isQuiz && !isCorrect ? 1 : 0,
            ":one": 1,
            ":uname": displayName,
            ":uavatar": avatar,
            ":uemail": userEmailVal,
            ":now": now,
            ":entity": "QUIZ_LEADERBOARD",
            ":uid": userId,
            ":qid": id,
          },
        })
      );

      await Promise.all([updateGlobal, updateQuiz]);
    } catch (lbDynErr) {
      console.warn("DynamoDB quiz leaderboard update notice:", lbDynErr);
    }

    // 2. Firestore: Update quiz_leaderboard collection
    if (db) {
      try {
        const colName = getFirestoreCollection("quiz_leaderboard");
        const incData = {
          userId,
          userName: displayName,
          userAvatar: avatar,
          userEmail: authUser?.email || "",
          totalPoints: FieldValue.increment(earnedPts),
          correctCount: FieldValue.increment(isCorrect ? 1 : 0),
          incorrectCount: FieldValue.increment(isQuiz && !isCorrect ? 1 : 0),
          totalAnswered: FieldValue.increment(1),
          lastAnsweredAt: now,
          updatedAt: now,
        };
        await Promise.all([
          db.collection(colName).doc(userId).set(incData, { merge: true }),
          db.collection(colName).doc(`${userId}_${id}`).set({ ...incData, quizId: id }, { merge: true }),
          colName !== "quiz_leaderboard"
            ? db.collection("quiz_leaderboard").doc(userId).set(incData, { merge: true })
            : Promise.resolve(),
        ]);
      } catch (lbFbErr) {
        console.warn("Firestore quiz leaderboard update notice:", lbFbErr);
      }
    }

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/vote error:", error);
    const msg = error instanceof Error ? error.message : "Voting failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
