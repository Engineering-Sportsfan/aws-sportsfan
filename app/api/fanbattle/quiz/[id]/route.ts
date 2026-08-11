// app/api/fanbattle/quiz/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import type { Level, QuizQuestion } from "../route";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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

// GET - Fetch single quiz by ID
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Quiz ID is required" }, { status: 400 });
    }

    let quiz: any = null;

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `QUIZ#${id}`,
            sk: "QUIZ#META",
          },
        })
      );
      if (getRes.Item) {
        quiz = { id, ...getRes.Item };
      }
    } catch (e) {
      console.warn("[fanbattle quiz [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!quiz && db) {
      const doc = await db.collection("fanBattleQuizzes").doc(id).get();
      if (doc.exists) {
        quiz = { id: doc.id, ...doc.data() };
      }
    }

    if (!quiz) {
      return NextResponse.json(
        { error: `Quiz "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: quiz },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching quiz:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT /api/fanbattle/quiz/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Quiz ID is required" }, { status: 400 });
    }

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `QUIZ#${id}`, sk: "QUIZ#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch (e) {
      // fallback
    }

    if (!existing && db) {
      const doc = await db.collection("fanBattleQuizzes").doc(id).get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
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

    const now = Date.now();
    const updates: Record<string, any> = { ...existing, updatedAt: now };

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

    // Dual-write update
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `QUIZ#${id}`,
        sk: "QUIZ#META",
        ...updates,
        id,
      },
      firestoreRef: db.collection("fanBattleQuizzes").doc(id),
      firestoreData: updates,
    });

    return NextResponse.json(
      { success: true, message: "Quiz updated", data: { id, ...updates } },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating quiz:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/fanbattle/quiz/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Quiz ID is required" }, { status: 400 });
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SportsData",
          Key: {
            entityId: `QUIZ#${id}`,
            sk: "QUIZ#META",
          },
        })
      );
    } catch (e) {
      console.warn("[fanbattle quiz [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("fanBattleQuizzes").doc(id);
      await docRef.delete();
    }

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