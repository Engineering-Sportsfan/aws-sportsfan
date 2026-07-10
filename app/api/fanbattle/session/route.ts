// api/fanbattle/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

interface FanBattleResponse {
  id: string;
  quizId: string;
  questionNumber: number;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  selectedAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
  answeredAt: number;
  correctAnswer: string;
}

// ─── GET /api/fanbattle/session ──────────────────────────────────────────────
// Query params:
//   quizId + userId → returns session for that user/quiz combo
//   sessionId       → returns single session by ID

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const quizId = searchParams.get("quizId");
    const userId = searchParams.get("userId");

    // ── Single session lookup by ID ──────────────────────────────────────────
    if (sessionId) {
      const doc = await db.collection("fanBattleSessions").doc(sessionId).get();

      if (!doc.exists) {
        return NextResponse.json(
          { error: `Session "${sessionId}" not found` },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: true, data: { id: doc.id, ...doc.data() } },
        { status: 200 }
      );
    }

    // ── Find session by quizId and userId ────────────────────────────────────
    if (!quizId || !userId) {
      return NextResponse.json(
        { error: "Both quizId and userId are required when sessionId is not provided" },
        { status: 400 }
      );
    }

    const sessionsRef = db.collection("fanBattleSessions");
    const query = sessionsRef
      .where("quizId", "==", quizId)
      .where("userId", "==", userId)
      .limit(1);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return NextResponse.json(
        { success: true, data: null, message: "No session found" },
        { status: 200 }
      );
    }

    const sessionDoc = snapshot.docs[0];
    const sessionData = sessionDoc.data();

    // Fetch all responses for this session to get detailed answer info
    const responseIds = (sessionData.responseIds as string[]) || [];
    const responses: FanBattleResponse[] = [];

    for (const responseId of responseIds) {
      const responseDoc = await db.collection("fanBattleResponses").doc(responseId).get();
      if (responseDoc.exists) {
        responses.push({ id: responseDoc.id, ...responseDoc.data() } as FanBattleResponse);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: sessionDoc.id,
          ...sessionData,
          responses, // Include detailed responses
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching session:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/fanbattle/session ──────────────────────────────────────────────
// Create a new session (if needed)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { quizId, userId, userName, userEmail, userAvatar } = body;

    if (!quizId || !userId) {
      return NextResponse.json(
        { error: "quizId and userId are required" },
        { status: 400 }
      );
    }

    // Check if session already exists
    const existingQuery = await db
      .collection("fanBattleSessions")
      .where("quizId", "==", quizId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existingSession = existingQuery.docs[0];
      return NextResponse.json(
        {
          success: true,
          data: { id: existingSession.id, ...existingSession.data() },
          message: "Existing session found",
        },
        { status: 200 }
      );
    }

    // Fetch quiz to get total questions
    const quizDoc = await db.collection("fanBattleQuizzes").doc(quizId).get();
    const quizData = quizDoc.data();
    const totalQuestions = quizData?.totalQuestions || 0;

    // Create new session
    const newSession = {
      quizId,
      userId,
      userName: userName || "",
      userEmail: userEmail || "",
      userAvatar: userAvatar || "",
      totalPointsEarned: 0,
      correctCount: 0,
      incorrectCount: 0,
      answeredCount: 0,
      totalQuestions,
      responseIds: [],
      status: "in_progress",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    };

    const sessionRef = await db.collection("fanBattleSessions").add(newSession);

    return NextResponse.json(
      {
        success: true,
        data: { id: sessionRef.id, ...newSession },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating session:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}