// app/api/watch-along/matches/[id]/quiz/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches/[id]/quiz
   Query: ?active=true       → only the active question
          ?leaderboard=true  → top 20 scorers
───────────────────────────────────────────── */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const leaderboard = searchParams.get("leaderboard") === "true";

    const matchRef = db.collection("watchAlongMatches").doc(id);

    if (leaderboard) {
      let entries: any[] = [];
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "GamificationAndWallet",
            KeyConditionExpression: "userId = :uId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":uId": `MATCH#${id}`,
              ":skPrefix": "QUIZ_LEADERBOARD#",
            },
            Limit: 50,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          entries = (qRes.Items as any[]).map((item) => ({
            userId: (item.sk as string).replace(/^QUIZ_LEADERBOARD#/, ""),
            ...item,
          }));
          entries.sort((a, b) => Number(b.totalPoints || 0) - Number(a.totalPoints || 0));
          entries = entries.slice(0, 20);
        }
      } catch (e) {
        console.warn("[quiz leaderboard GET] DynamoDB notice:", e);
      }

      if (entries.length === 0) {
        const lbSnap = await matchRef
          .collection("quizLeaderboard")
          .orderBy("totalPoints", "desc")
          .limit(20)
          .get();
        entries = lbSnap.docs.map((doc) => ({ userId: doc.id, ...doc.data() }));
      }
      return NextResponse.json({ success: true, leaderboard: entries });
    }

    let questions: any[] = [];
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :uId AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":uId": `MATCH#${id}`,
            ":skPrefix": "QUIZ#",
          },
          Limit: 50,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        let items = (qRes.Items as any[]).map((item) => {
          const { correctAnswer, ...safe } = item;
          void correctAnswer;
          return {
            id: (item.sk as string).replace(/^QUIZ#/, "") || item.id,
            ...safe,
          };
        });
        if (activeOnly) {
          items = items.filter((q) => q.isActive === true);
        }
        items.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        questions = activeOnly ? items.slice(0, 1) : items;
      }
    } catch (e) {
      console.warn("[quiz questions GET] DynamoDB notice:", e);
    }

    if (questions.length === 0) {
      let query: FirebaseFirestore.Query = matchRef
        .collection("quizQuestions")
        .orderBy("createdAt", "desc");

      if (activeOnly) query = query.where("isActive", "==", true).limit(1);

      const snapshot = await query.get();
      questions = snapshot.docs.map((doc) => {
        const { correctAnswer, ...safe } = doc.data() as Record<string, unknown>;
        void correctAnswer;
        return { id: doc.id, ...safe };
      });
    }

    return NextResponse.json({ success: true, questions });
  } catch (error) {
    console.error("[quiz GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/quiz
───────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const matchRef = db.collection("watchAlongMatches").doc(id);

    // ── CREATE ──
    if (action === "create") {
      const user = await getUserSessionAndRole(req);
      if (!user) {
        return NextResponse.json(
          { success: false, message: "Unauthorized - Authentication required" },
          { status: 401 }
        );
      }

      const isAuth = await isAuthorizedForMatch(user, id);
      if (!isAuth) {
        return NextResponse.json(
          { success: false, message: "Forbidden - Insufficient permissions" },
          { status: 403 }
        );
      }

      const { question, options, correctAnswer, timerSeconds = 15, points = 10 } = body;

      if (!question?.trim() || !Array.isArray(options) || options.length < 2 || !correctAnswer) {
        return NextResponse.json(
          { success: false, message: "question, options (≥2), and correctAnswer are required" },
          { status: 400 }
        );
      }
      if (!options.includes(correctAnswer)) {
        return NextResponse.json(
          { success: false, message: "correctAnswer must be one of the options" },
          { status: 400 }
        );
      }

      const questionId = uuidv4();
      const now = Date.now();
      const questionData = {
        id: questionId,
        question: question.trim(),
        options,
        correctAnswer,
        timerSeconds,
        points,
        isActive: true,
        opensAt: now,
        closesAt: now + timerSeconds * 1000,
        competing: 0,
        createdAt: now,
        updatedAt: now,
      };

      await dualWrite({
        tableName: "GamificationAndWallet",
        dynamoItem: {
          userId: `MATCH#${id}`,
          sk: `QUIZ#${questionId}`,
          ...questionData,
        },
        firestoreRef: matchRef.collection("quizQuestions").doc(questionId),
        firestoreData: questionData,
      });

      const { correctAnswer: _ca, ...safeData } = questionData;
      return NextResponse.json({ success: true, question: { ...safeData, id: questionId } });
    }

    // ── ANSWER ──
    if (action === "answer") {
      const { questionId, option, userId, displayName } = body;

      if (!questionId || !option || !userId) {
        return NextResponse.json(
          { success: false, message: "questionId, option, and userId are required" },
          { status: 400 }
        );
      }

      let q: any = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: { userId: `MATCH#${id}`, sk: `QUIZ#${questionId}` },
          })
        );
        if (getRes.Item) q = getRes.Item;
      } catch (e) {
        // fallback
      }

      if (!q) {
        const qRef = matchRef.collection("quizQuestions").doc(questionId);
        const qDoc = await qRef.get();
        if (!qDoc.exists) {
          return NextResponse.json({ success: false, message: "Question not found" }, { status: 404 });
        }
        q = qDoc.data();
      }

      if (!q.options.includes(option)) {
        return NextResponse.json({ success: false, message: "Invalid option" }, { status: 400 });
      }

      // Check if already answered
      let alreadyAnswered = false;
      try {
        const ansCheck = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: { userId: `MATCH#${id}`, sk: `QUIZ_ANSWER#${questionId}#${userId}` },
          })
        );
        if (ansCheck.Item) alreadyAnswered = true;
      } catch (e) {
        // ignore
      }

      if (alreadyAnswered) {
        return NextResponse.json({ success: false, message: "Already answered" }, { status: 409 });
      }

      const isCorrect = option === q.correctAnswer;
      const earnedPoints = isCorrect ? q.points : 0;
      const now = Date.now();

      const answerData = {
        option,
        isCorrect,
        points: earnedPoints,
        answeredAt: now,
      };

      // Write answer
      await dualWrite({
        tableName: "GamificationAndWallet",
        dynamoItem: {
          userId: `MATCH#${id}`,
          sk: `QUIZ_ANSWER#${questionId}#${userId}`,
          questionId,
          userTargetId: userId,
          ...answerData,
        },
        firestoreRef: matchRef.collection("quizQuestions").doc(questionId).collection("answers").doc(userId),
        firestoreData: answerData,
      });

      // Update question competing count in DynamoDB
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "GamificationAndWallet",
            Key: { userId: `MATCH#${id}`, sk: `QUIZ#${questionId}` },
            UpdateExpression: "ADD competing :inc SET updatedAt = :now",
            ExpressionAttributeValues: { ":inc": 1, ":now": now },
          })
        );
      } catch (e) {
        // ignore
      }

      // Update in Firestore
      try {
        await matchRef.collection("quizQuestions").doc(questionId).update({
          competing: FieldValue.increment(1),
          updatedAt: now,
        });
      } catch (e) {
        // ignore
      }

      if (isCorrect) {
        // Update Leaderboard in DynamoDB
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: "GamificationAndWallet",
              Key: { userId: `MATCH#${id}`, sk: `QUIZ_LEADERBOARD#${userId}` },
              UpdateExpression: "ADD totalPoints :pts SET displayName = :dn, updatedAt = :now",
              ExpressionAttributeValues: {
                ":pts": earnedPoints,
                ":dn": displayName || userId,
                ":now": now,
              },
            })
          );
        } catch (e) {
          // ignore
        }

        // Update in Firestore
        try {
          const lbRef = matchRef.collection("quizLeaderboard").doc(userId);
          await lbRef.set(
            { displayName: displayName || userId, totalPoints: FieldValue.increment(earnedPoints), updatedAt: now },
            { merge: true }
          );
        } catch (e) {
          // ignore
        }
      }

      return NextResponse.json({
        success: true,
        isCorrect,
        correctAnswer: q.correctAnswer,
        pointsEarned: earnedPoints,
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action. Use 'create' or 'answer'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[quiz POST]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   PATCH  /api/watch-along/matches/[id]/quiz
───────────────────────────────────────────── */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const isAuth = await isAuthorizedForMatch(user, id);
    if (!isAuth) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { questionId, isActive } = await req.json();

    if (!questionId || typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "questionId and isActive (boolean) are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { isActive, updatedAt: now };

    if (isActive) {
      updates.opensAt = now;
      updates.closesAt = now + 15 * 1000;
    }

    // Update DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "GamificationAndWallet",
          Key: { userId: `MATCH#${id}`, sk: `QUIZ#${questionId}` },
          UpdateExpression: "SET isActive = :act, updatedAt = :now" + (isActive ? ", opensAt = :op, closesAt = :cl" : ""),
          ExpressionAttributeValues: {
            ":act": isActive,
            ":now": now,
            ...(isActive ? { ":op": now, ":cl": now + 15000 } : {}),
          },
        })
      );
    } catch (e) {
      console.warn("[quiz PATCH] DynamoDB update notice:", e);
    }

    // Update Firestore
    try {
      const matchRef = db.collection("watchAlongMatches").doc(id);
      await matchRef.collection("quizQuestions").doc(questionId).update(updates);
    } catch (e) {
      console.warn("[quiz PATCH] Firestore update notice:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Question ${isActive ? "activated" : "deactivated"}`,
    });
  } catch (error) {
    console.error("[quiz PATCH]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}