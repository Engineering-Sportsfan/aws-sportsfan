import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import type { Level, QuizQuestion } from "../route";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_LEVELS: Level[] = ["easy", "medium", "difficult"];

const VALID_CATEGORIES = [
  "Cricket",
  "Football",
  "Basketball",
  "Tennis",
  "Hockey",
  "Athletics",
  "General",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateQuestions(questions: QuizQuestion[]): string | null {
  if (!Array.isArray(questions) || questions.length === 0)
    return "questions must be a non-empty array";

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.question?.trim())
      return `Question ${i + 1}: question text is required`;
    if (!Array.isArray(q.options) || q.options.length < 2)
      return `Question ${i + 1}: at least 2 options are required`;
    if (q.options.length > 6)
      return `Question ${i + 1}: maximum 6 options allowed`;
    if (!q.correctAnswer?.trim())
      return `Question ${i + 1}: correctAnswer is required`;
    if (!q.options.includes(q.correctAnswer))
      return `Question ${i + 1}: correctAnswer must match one of the options`;
    if (!q.points || q.points < 1)
      return `Question ${i + 1}: points must be at least 1`;
  }
  return null;
}

// ─── GET /api/fanbattle/quiz/[id] ─────────────────────────────────────────────
// Always returns full quiz including correctAnswer (admin single-fetch for edit form)

//  Helper: extract ID from URL 
function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET - Fetch single article by ID
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Quiz ID is required" }, { status: 400 });
    }
    const doc = await db.collection("fanBattleQuizzes").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: `Quiz "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: { id: doc.id, ...doc.data() } },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching quiz:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/fanbattle/quiz/[id] ─────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Quiz ID is required" }, { status: 400 });
    }
    const docRef = db.collection("fanBattleQuizzes").doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      return NextResponse.json(
        { error: `Quiz "${id}" not found` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { level, category, questions } = body;

    if (level && !VALID_LEVELS.includes(level)) {
      return NextResponse.json(
        { error: `level must be one of: ${VALID_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Build update payload — only include fields that were sent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (level) updates.level = level;
    if (category) updates.category = category.trim();

    if (questions) {
      const qError = validateQuestions(questions);
      if (qError) return NextResponse.json({ error: qError }, { status: 400 });

      const mappedQuestions: QuizQuestion[] = questions.map(
        (q: QuizQuestion, i: number) => ({
          questionNumber: i + 1,
          question: q.question.trim(),
          options: q.options.map((o: string) => o.trim()),
          correctAnswer: q.correctAnswer.trim(),
          points: Number(q.points),
        })
      );

      updates.questions = mappedQuestions;
      updates.totalQuestions = mappedQuestions.length;
      updates.totalPoints = mappedQuestions.reduce((sum, q) => sum + q.points, 0);
    }

    await docRef.update(updates);

    const updated = await docRef.get();

    return NextResponse.json(
      { success: true, message: "Quiz updated", data: { id: updated.id, ...updated.data() } },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating quiz:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/fanbattle/quiz/[id] ─────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Quiz ID is required" }, { status: 400 });
    }
    const docRef = db.collection("fanBattleQuizzes").doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      return NextResponse.json(
        { error: `Quiz "${id}" not found` },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json(
      { success: true, message: `Quiz "${id}" deleted` },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting quiz:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}