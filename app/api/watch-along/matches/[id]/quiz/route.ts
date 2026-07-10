import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

/* ─────────────────────────────────────────────
   Firestore structure:
   watchAlongMatches/{id}/quizQuestions/{questionId}
   {
     question:      string
     options:       string[]
     correctAnswer: string          // never sent to client in GET
     timerSeconds:  number
     points:        number
     isActive:      boolean
     opensAt:       number | null
     closesAt:      number | null
     competing:     number
     createdAt:     number
     updatedAt:     number
   }

   watchAlongMatches/{id}/quizQuestions/{questionId}/answers/{userId}
   { option: string, isCorrect: boolean, points: number, answeredAt: number }

   watchAlongMatches/{id}/quizLeaderboard/{userId}
   { displayName: string, totalPoints: number, updatedAt: number }
   ───────────────────────────────────────────── */

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
      const lbSnap = await matchRef
        .collection("quizLeaderboard")
        .orderBy("totalPoints", "desc")
        .limit(20)
        .get();
      const entries = lbSnap.docs.map((doc) => ({ userId: doc.id, ...doc.data() }));
      return NextResponse.json({ success: true, leaderboard: entries });
    }

    let query: FirebaseFirestore.Query = matchRef
      .collection("quizQuestions")
      .orderBy("createdAt", "desc");

    if (activeOnly) query = query.where("isActive", "==", true).limit(1);

    const snapshot = await query.get();

    // Strip correctAnswer — never expose to client before submission
    const questions = snapshot.docs.map((doc) => {
      const { correctAnswer, ...safe } = doc.data() as Record<string, unknown>;
      void correctAnswer;
      return { id: doc.id, ...safe };
    });

    return NextResponse.json({ success: true, questions });
  } catch (error) {
    console.error("[quiz GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}


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

      const questionData = {
        question: question.trim(),
        options,
        correctAnswer,
        timerSeconds,
        points,
        isActive: true, // ✅ Set to true for demo mode
        opensAt: Date.now(),
        closesAt: Date.now() + timerSeconds * 1000,
        competing: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const docRef = await matchRef.collection("quizQuestions").add(questionData);
      const { correctAnswer: _ca, ...safeData } = questionData;
      return NextResponse.json({ success: true, question: { id: docRef.id, ...safeData } });
    }

    // ── ANSWER ── (Demo mode - no activation checks)
    if (action === "answer") {
      const { questionId, option, userId, displayName } = body;

      if (!questionId || !option || !userId) {
        return NextResponse.json(
          { success: false, message: "questionId, option, and userId are required" },
          { status: 400 }
        );
      }

      const qRef = matchRef.collection("quizQuestions").doc(questionId);
      const qDoc = await qRef.get();

      if (!qDoc.exists) {
        return NextResponse.json({ success: false, message: "Question not found" }, { status: 404 });
      }

      const q = qDoc.data()!;

   
      
      if (!q.options.includes(option)) {
        return NextResponse.json({ success: false, message: "Invalid option" }, { status: 400 });
      }

      // Prevent duplicate answers
      const answerRef = qRef.collection("answers").doc(userId);
      const answerDoc = await answerRef.get();
      if (answerDoc.exists) {
        return NextResponse.json({ success: false, message: "Already answered" }, { status: 409 });
      }

      const isCorrect = option === q.correctAnswer;
      const earnedPoints = isCorrect ? q.points : 0;

      await answerRef.set({ option, isCorrect, points: earnedPoints, answeredAt: Date.now() });
      await qRef.update({ competing: FieldValue.increment(1), updatedAt: Date.now() });

      if (isCorrect) {
        const lbRef = matchRef.collection("quizLeaderboard").doc(userId);
        await lbRef.set(
          { displayName: displayName || userId, totalPoints: FieldValue.increment(earnedPoints), updatedAt: Date.now() },
          { merge: true }
        );
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

// Simplified API - just activate/deactivate
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

    const matchRef = db.collection("watchAlongMatches").doc(id);
    const qRef = matchRef.collection("quizQuestions").doc(questionId);
    const qDoc = await qRef.get();

    if (!qDoc.exists) {
      return NextResponse.json({ success: false, message: "Question not found" }, { status: 404 });
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { isActive, updatedAt: now };

    if (isActive) {
      const timerSeconds = qDoc.data()!.timerSeconds || 15;
      updates.opensAt = now;
      updates.closesAt = now + timerSeconds * 1000;
    }

    await qRef.update(updates);

    return NextResponse.json({
      success: true,
      message: `Question ${isActive ? "activated" : "deactivated"}`,
    });
  } catch (error) {
    console.error("[quiz PATCH]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}