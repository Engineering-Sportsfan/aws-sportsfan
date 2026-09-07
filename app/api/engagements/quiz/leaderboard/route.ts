// app/api/engagements/quiz/leaderboard/route.ts — Live Quiz Leaderboard API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { ScanCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getUser } from "@/lib/getUser";
import type { QuizLeaderboardEntry } from "@/types/engagements";

export const dynamic = "force-dynamic";

// ─── GET /api/engagements/quiz/leaderboard ────────────────────────────────────
// Returns top quiz users ranked by total points, correct answers, and accuracy
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const quizId = searchParams.get("quizId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const authUser = await getUser(req);
    const requestingUserId = authUser?.userId || authUser?.email || searchParams.get("userId");

    const entriesMap = new Map<string, QuizLeaderboardEntry>();

    // 1. Fetch from DynamoDB SocialAndContent table
    try {
      const targetContentId = quizId ? `QUIZ_LEADERBOARD#${quizId}` : "QUIZ_LEADERBOARD#GLOBAL";
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "begins_with(contentId, :pfx)",
          ExpressionAttributeValues: {
            ":pfx": "QUIZ_LEADERBOARD#",
          },
          Limit: 300,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        for (const it of scanRes.Items) {
          const itemQuizMatch =
            !quizId ||
            it.contentId === targetContentId ||
            it.contentId === "QUIZ_LEADERBOARD#GLOBAL";
          if (!itemQuizMatch) continue;

          const uid = (it.sk as string)?.replace(/^USER#/, "") || it.userId;
          if (!uid) continue;

          const existing = entriesMap.get(uid);
          const points = Number(it.totalPoints || it.pointsEarned || 0);
          const correct = Number(it.correctCount || 0);
          const incorrect = Number(it.incorrectCount || 0);
          const answered = Number(it.totalAnswered || correct + incorrect || 0);

          if (!existing) {
            entriesMap.set(uid, {
              rank: 0,
              userId: uid,
              userName: it.userName || it.username || "Fan Quizzer",
              userAvatar: it.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
              userEmail: it.userEmail || "",
              totalPoints: points,
              correctCount: correct,
              incorrectCount: incorrect,
              totalAnswered: answered,
              lastAnsweredAt: it.lastAnsweredAt || it.updatedAt || Date.now(),
            });
          } else {
            existing.totalPoints = Math.max(existing.totalPoints, points);
            existing.correctCount = Math.max(existing.correctCount, correct);
            existing.incorrectCount = Math.max(existing.incorrectCount, incorrect);
            existing.totalAnswered = Math.max(existing.totalAnswered, answered);
          }
        }
      }
    } catch (dynErr) {
      console.warn("[Quiz Leaderboard] DynamoDB scan notice:", dynErr);
    }

    // 2. Fallback / Merge with Firestore quiz_leaderboard collection
    if (db) {
      try {
        const snap = await db
          .collection(getFirestoreCollection("quiz_leaderboard"))
          .limit(100)
          .get();
        for (const doc of snap.docs) {
          const it = doc.data();
          const uid = it.userId || doc.id.split("_")[0];
          if (!uid) continue;

          const points = Number(it.totalPoints || 0);
          const correct = Number(it.correctCount || 0);
          const incorrect = Number(it.incorrectCount || 0);
          const answered = Number(it.totalAnswered || correct + incorrect || 0);

          if (!entriesMap.has(uid)) {
            entriesMap.set(uid, {
              rank: 0,
              userId: uid,
              userName: it.userName || "Fan Quizzer",
              userAvatar: it.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
              userEmail: it.userEmail || "",
              totalPoints: points,
              correctCount: correct,
              incorrectCount: incorrect,
              totalAnswered: answered,
              lastAnsweredAt: it.lastAnsweredAt || Date.now(),
            });
          }
        }
      } catch (fbErr) {
        console.warn("[Quiz Leaderboard] Firestore fallback notice:", fbErr);
      }
    }

    // Sort entries by points (descending), then correct count (descending)
    let allEntries = Array.from(entriesMap.values());
    allEntries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.totalAnswered - b.totalAnswered;
    });

    allEntries = allEntries.map((e, idx) => {
      const accuracy =
        e.totalAnswered > 0 ? `${Math.round((e.correctCount / e.totalAnswered) * 100)}%` : "0%";
      return {
        ...e,
        rank: idx + 1,
        accuracy,
      };
    });

    const pagedLeaderboard = allEntries.slice(0, limit);
    let currentUser: QuizLeaderboardEntry | null = null;

    if (requestingUserId) {
      currentUser =
        allEntries.find(
          e => e.userId === requestingUserId || e.userEmail === requestingUserId
        ) || null;
    }

    return NextResponse.json({
      success: true,
      leaderboard: pagedLeaderboard,
      totalParticipants: allEntries.length,
      currentUser,
    });
  } catch (error: unknown) {
    console.error("GET /api/engagements/quiz/leaderboard error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch quiz leaderboard";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/engagements/quiz/leaderboard ───────────────────────────────────
// Updates or records user's quiz score, points, correct and incorrect answers
export async function POST(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    const body = await req.json();
    const {
      userId: inputUserId,
      userName,
      userAvatar,
      quizId,
      questionId,
      isCorrect,
      pointsEarned = 50,
    } = body;

    const userId =
      authUser?.userId ||
      authUser?.email ||
      inputUserId ||
      `anon_${req.headers.get("x-forwarded-for") || Date.now()}`;

    const displayName = userName || authUser?.name || "Fan Quizzer";
    const avatar =
      userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
    const pts = isCorrect ? Number(pointsEarned) : 0;
    const now = Date.now();

    // 1. Update / Get current stats in DynamoDB SocialAndContent table
    const globalKey = { contentId: "QUIZ_LEADERBOARD#GLOBAL", sk: `USER#${userId}` };
    let currentRecord: any = null;

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: globalKey,
        })
      );
      currentRecord = getRes.Item;
    } catch {}

    const totalPoints = (Number(currentRecord?.totalPoints) || 0) + pts;
    const correctCount = (Number(currentRecord?.correctCount) || 0) + (isCorrect ? 1 : 0);
    const incorrectCount = (Number(currentRecord?.incorrectCount) || 0) + (isCorrect ? 0 : 1);
    const totalAnswered = (Number(currentRecord?.totalAnswered) || 0) + 1;

    const updatedLeaderboardItem = {
      userId,
      userName: displayName,
      userAvatar: avatar,
      userEmail: authUser?.email || "",
      totalPoints,
      correctCount,
      incorrectCount,
      totalAnswered,
      lastAnsweredAt: now,
      updatedAt: now,
    };

    // Save to DynamoDB SocialAndContent Table (Global + Quiz Specific)
    try {
      await Promise.all([
        docClient.send(
          new PutCommand({
            TableName: TABLES.SocialAndContent,
            Item: {
              contentId: "QUIZ_LEADERBOARD#GLOBAL",
              sk: `USER#${userId}`,
              entityId: "QUIZ_LEADERBOARD",
              ...updatedLeaderboardItem,
            },
          })
        ),
        quizId
          ? docClient.send(
              new PutCommand({
                TableName: TABLES.SocialAndContent,
                Item: {
                  contentId: `QUIZ_LEADERBOARD#${quizId}`,
                  sk: `USER#${userId}`,
                  entityId: "QUIZ_LEADERBOARD",
                  ...updatedLeaderboardItem,
                },
              })
            )
          : Promise.resolve(),
      ]);
    } catch (dynErr) {
      console.warn("[Quiz Leaderboard POST] DynamoDB write notice:", dynErr);
    }

    // Save to Firestore
    if (db) {
      try {
        await db.collection("quiz_leaderboard").doc(userId).set(updatedLeaderboardItem, { merge: true });
        if (quizId) {
          await db
            .collection("quiz_leaderboard")
            .doc(`${userId}_${quizId}`)
            .set(updatedLeaderboardItem, { merge: true });
        }
      } catch (fbErr) {
        console.warn("[Quiz Leaderboard POST] Firestore write notice:", fbErr);
      }
    }

    const accuracy =
      totalAnswered > 0 ? `${Math.round((correctCount / totalAnswered) * 100)}%` : "0%";

    return NextResponse.json({
      success: true,
      stats: {
        userId,
        userName: displayName,
        userAvatar: avatar,
        totalPoints,
        correctCount,
        incorrectCount,
        totalAnswered,
        accuracy,
        pointsAwarded: pts,
        isCorrect: Boolean(isCorrect),
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/quiz/leaderboard error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record quiz answer";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
