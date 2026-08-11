// app/api/fanbattle/quiz/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Level = "easy" | "medium" | "difficult";

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

export interface QuizQuestion {
  questionNumber: number;
  question: string;
  options: string[];
  correctAnswer: string;
  points: number;
}

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

// ─── POST /api/fanbattle/quiz ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { level, category, questions } = body;

    if (!level || !VALID_LEVELS.includes(level)) {
      return NextResponse.json(
        { error: `level is required and must be one of: ${VALID_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!category?.trim() || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category is required and must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const qError = validateQuestions(questions);
    if (qError) {
      return NextResponse.json({ error: qError }, { status: 400 });
    }

    const mappedQuestions: QuizQuestion[] = questions.map(
      (q: QuizQuestion, i: number) => ({
        questionNumber: i + 1,
        question: q.question.trim(),
        options: q.options.map((o: string) => o.trim()),
        correctAnswer: q.correctAnswer.trim(),
        points: Number(q.points),
      })
    );

    const now = Date.now();
    const quizId = `quiz_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newQuiz = {
      id: quizId,
      level,
      category: category.trim(),
      questions: mappedQuestions,
      totalQuestions: mappedQuestions.length,
      totalPoints: mappedQuestions.reduce((sum, q) => sum + q.points, 0),
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write to DynamoDB & Firestore
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `QUIZ#${quizId}`,
        sk: "QUIZ#META",
        ...newQuiz,
      },
      firestoreRef: db.collection("fanBattleQuizzes").doc(quizId),
      firestoreData: newQuiz,
    });

    return NextResponse.json(
      { success: true, id: quizId, quiz: newQuiz },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating quiz:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/fanbattle/quiz ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const level = searchParams.get("level");
    const category = searchParams.get("category");
    const lastDocId = searchParams.get("lastDocId");
    const isAdmin = searchParams.get("admin") === "true";

    let quizzes: any[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :qPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":qPrefix": "QUIZ#",
        ":metaSk": "QUIZ#META",
      };

      if (level && VALID_LEVELS.includes(level as Level)) {
        filterExpr += " AND #lvl = :level";
        exprVals[":level"] = level;
      }
      if (category && VALID_CATEGORIES.includes(category)) {
        filterExpr += " AND category = :category";
        exprVals[":category"] = category;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: level ? { "#lvl": "level" } : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        quizzes = scanRes.Items.map((item) => {
          const qId = item.id || (item.entityId as string).replace(/^QUIZ#/, "");
          return {
            id: qId,
            ...item,
            questions: isAdmin
              ? item.questions
              : (item.questions as QuizQuestion[] || []).map(
                  ({ correctAnswer: _ca, ...rest }) => rest
                ),
          };
        });
      }
    } catch (e) {
      console.warn("[fanbattle quiz GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (quizzes.length === 0 && db) {
      let query: FirebaseFirestore.Query = db
        .collection("fanBattleQuizzes")
        .orderBy("createdAt", "desc");

      if (level && VALID_LEVELS.includes(level as Level)) {
        query = query.where("level", "==", level);
      }
      if (category && VALID_CATEGORIES.includes(category)) {
        query = query.where("category", "==", category);
      }

      query = query.limit(limit);

      if (lastDocId) {
        const lastDocRef = db.collection("fanBattleQuizzes").doc(lastDocId);
        const lastDoc = await lastDocRef.get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const snapshot = await query.get();
      quizzes = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          questions: isAdmin
            ? data.questions
            : ((data.questions as QuizQuestion[]) || []).map(
                ({ correctAnswer: _ca, ...rest }) => rest
              ),
        };
      });
    }

    quizzes.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const paginated = quizzes.slice(0, limit);
    const lastDoc = paginated[paginated.length - 1];

    return NextResponse.json({
      success: true,
      count: paginated.length,
      quizzes: paginated,
      pagination: {
        limit,
        hasMore: paginated.length === limit,
        nextCursor:
          paginated.length === limit
            ? {
                lastDocId: lastDoc?.id,
                lastDocCreatedAt: lastDoc?.createdAt,
              }
            : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching quizzes:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}