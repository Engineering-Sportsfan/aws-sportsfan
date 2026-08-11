// app/api/fanbattle/response/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserInfo, awardUserPoints } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface QuizQuestion {
  questionNumber: number;
  correctAnswer: string;
  points: number;
}

interface QuizDoc {
  questions: QuizQuestion[];
  totalQuestions: number;
}

// ─── GET /api/fanbattle/response ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const userId = searchParams.get("userId");
    const quizId = searchParams.get("quizId");

    if (sessionId) {
      let sessionData: any = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "SportsData",
            Key: { entityId: `QUIZ_SESSION#${sessionId}`, sk: "SESSION#META" },
          })
        );
        if (getRes.Item) sessionData = { id: sessionId, ...getRes.Item };
      } catch (e) {
        console.warn("[fanbattle response GET session] DynamoDB notice:", e);
      }

      if (!sessionData && db) {
        const doc = await db.collection("fanBattleSessions").doc(sessionId).get();
        if (doc.exists) sessionData = { id: doc.id, ...doc.data() };
      }

      if (!sessionData) {
        return NextResponse.json({ error: `Session "${sessionId}" not found` }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: sessionData }, { status: 200 });
    }

    let responses: any[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :rPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":rPrefix": "QUIZ_RESPONSE#",
        ":metaSk": "RESPONSE#META",
      };

      if (userId) {
        filterExpr += " AND userId = :uId";
        exprVals[":uId"] = userId;
      }
      if (quizId) {
        filterExpr += " AND quizId = :qId";
        exprVals[":qId"] = quizId;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        responses = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^QUIZ_RESPONSE#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[fanbattle response GET responses] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (responses.length === 0 && db) {
      let query = db
        .collection("fanBattleResponses")
        .orderBy("answeredAt", "desc") as FirebaseFirestore.Query;

      if (userId) query = query.where("userId", "==", userId);
      if (quizId) query = query.where("quizId", "==", quizId);

      const snapshot = await query.get();
      responses = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    responses.sort((a, b) => Number(b.answeredAt || 0) - Number(a.answeredAt || 0));

    return NextResponse.json({ success: true, count: responses.length, data: responses }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching responses:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/fanbattle/response ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const required = ["quizId", "questionNumber", "selectedAnswer", "userId", "userName", "userEmail"];
    const missing = required.filter((f) => !body[f]);
    if (missing.length) {
      return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
    }

    let quiz: QuizDoc | null = null;

    // Fetch quiz from DynamoDB / Firestore
    try {
      const qRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `QUIZ#${body.quizId}`, sk: "QUIZ#META" },
        })
      );
      if (qRes.Item) quiz = qRes.Item as QuizDoc;
    } catch (e) {
      // ignore
    }

    if (!quiz && db) {
      const quizDoc = await db.collection("fanBattleQuizzes").doc(body.quizId).get();
      if (quizDoc.exists) quiz = quizDoc.data() as QuizDoc;
    }

    if (!quiz) {
      return NextResponse.json({ error: `Quiz "${body.quizId}" not found` }, { status: 404 });
    }

    const quizQuestion = quiz.questions.find((q) => q.questionNumber === Number(body.questionNumber));
    if (!quizQuestion) {
      return NextResponse.json(
        { error: `Question ${body.questionNumber} not found in quiz "${body.quizId}"` },
        { status: 404 }
      );
    }

    const isCorrect = body.selectedAnswer.trim() === quizQuestion.correctAnswer.trim();
    const pointsEarned = isCorrect ? quizQuestion.points : 0;
    const now = Date.now();

    const authUserId = body.userId as string;

    const { userName: resolvedName, userEmail: resolvedEmail, exists: userExists, actualUserId } =
      await getUserInfo(body.userId, body.userName, body.userEmail);

    const responseId = `resp_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const responsePayload = {
      id: responseId,
      quizId: body.quizId,
      questionNumber: Number(body.questionNumber),
      userId: authUserId,
      userName: resolvedName,
      userEmail: resolvedEmail,
      userAvatar: body?.userAvatar,
      selectedAnswer: body.selectedAnswer,
      isCorrect,
      pointsEarned,
      answeredAt: now,
      correctAnswer: quizQuestion.correctAnswer,
    };

    // Dual-write Response
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `QUIZ_RESPONSE#${responseId}`,
        sk: "RESPONSE#META",
        ...responsePayload,
      },
      firestoreRef: db.collection("fanBattleResponses").doc(responseId),
      firestoreData: responsePayload,
    });

    let sessionId: string;
    let sessionData: any;

    if (body.sessionId) {
      let existing: any = null;
      try {
        const sRes = await docClient.send(
          new GetCommand({
            TableName: "SportsData",
            Key: { entityId: `QUIZ_SESSION#${body.sessionId}`, sk: "SESSION#META" },
          })
        );
        if (sRes.Item) existing = sRes.Item;
      } catch (e) {
        // fallback
      }

      if (!existing && db) {
        const sDoc = await db.collection("fanBattleSessions").doc(body.sessionId).get();
        if (sDoc.exists) existing = sDoc.data();
      }

      if (!existing) {
        return NextResponse.json({ error: `Session "${body.sessionId}" not found` }, { status: 404 });
      }

      const responseIds = (existing.responseIds as string[]) || [];

      // Check if already answered
      let alreadyAnswered = false;
      for (const rId of responseIds) {
        try {
          const rGet = await docClient.send(
            new GetCommand({
              TableName: "SportsData",
              Key: { entityId: `QUIZ_RESPONSE#${rId}`, sk: "RESPONSE#META" },
            })
          );
          if (rGet.Item && rGet.Item.questionNumber === Number(body.questionNumber)) {
            alreadyAnswered = true;
            break;
          }
        } catch {
          // fallback
        }
      }

      if (!alreadyAnswered && db) {
        for (const respId of responseIds) {
          const respDoc = await db.collection("fanBattleResponses").doc(respId).get();
          const respData = respDoc.data();
          if (respData?.questionNumber === Number(body.questionNumber)) {
            alreadyAnswered = true;
            break;
          }
        }
      }

      if (alreadyAnswered) {
        return NextResponse.json(
          { error: `Question ${body.questionNumber} already answered in this session`, alreadyAnswered: true },
          { status: 409 }
        );
      }

      const newAnsweredCount = (existing.answeredCount as number || 0) + 1;
      const isComplete = newAnsweredCount >= quiz.totalQuestions;

      const updates = {
        totalPointsEarned: (existing.totalPointsEarned as number || 0) + pointsEarned,
        correctCount: (existing.correctCount as number || 0) + (isCorrect ? 1 : 0),
        incorrectCount: (existing.incorrectCount as number || 0) + (isCorrect ? 0 : 1),
        answeredCount: newAnsweredCount,
        responseIds: [...responseIds, responseId],
        status: isComplete ? "completed" : "in_progress",
        completedAt: isComplete ? now : null,
        updatedAt: now,
      };

      sessionId = body.sessionId;
      sessionData = { ...existing, ...updates, id: sessionId };

      await dualWrite({
        tableName: "SportsData",
        dynamoItem: {
          entityId: `QUIZ_SESSION#${sessionId}`,
          sk: "SESSION#META",
          ...sessionData,
        },
        firestoreRef: db.collection("fanBattleSessions").doc(sessionId),
        firestoreData: updates,
      });
    } else {
      const isComplete = quiz.totalQuestions === 1;
      sessionId = `sess_${now}_${Math.random().toString(36).substring(2, 9)}`;

      const newSession = {
        id: sessionId,
        quizId: body.quizId,
        userId: authUserId,
        userName: resolvedName,
        userEmail: resolvedEmail,
        userAvatar: body?.userAvatar,
        totalPointsEarned: pointsEarned,
        correctCount: isCorrect ? 1 : 0,
        incorrectCount: isCorrect ? 0 : 1,
        answeredCount: 1,
        totalQuestions: quiz.totalQuestions,
        responseIds: [responseId],
        status: isComplete ? "completed" : "in_progress",
        startedAt: now,
        completedAt: isComplete ? now : null,
        updatedAt: now,
      };

      sessionId = newSession.id;
      sessionData = newSession;

      await dualWrite({
        tableName: "SportsData",
        dynamoItem: {
          entityId: `QUIZ_SESSION#${sessionId}`,
          sk: "SESSION#META",
          ...newSession,
        },
        firestoreRef: db.collection("fanBattleSessions").doc(sessionId),
        firestoreData: newSession,
      });
    }

    // Award points
    if (pointsEarned > 0) {
      await awardUserPoints({
        actualUserId,
        authUserId,
        userName: resolvedName,
        userEmail: resolvedEmail,
        userExists,
        points: pointsEarned,
        reason: "TRIVIA_CORRECT",
        transactionId: `${authUserId}_${body.quizId}_Q${body.questionNumber}_TRIVIA_CORRECT`,
        metadata: {
          quizId: body.quizId,
          questionNumber: Number(body.questionNumber),
          selectedAnswer: body.selectedAnswer,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          response: responsePayload,
          session: {
            id: sessionId,
            status: sessionData.status,
            totalPointsEarned: sessionData.totalPointsEarned,
            correctCount: sessionData.correctCount,
            incorrectCount: sessionData.incorrectCount,
            answeredCount: sessionData.answeredCount,
            totalQuestions: quiz.totalQuestions,
            completedAt: sessionData.completedAt,
          },
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error submitting response:", error);
    return NextResponse.json(
      { error: msg, details: error instanceof Error ? error.stack : undefined },
      { status: 500 }
    );
  }
}