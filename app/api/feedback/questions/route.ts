// app/api/feedback/questions/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

interface FeedbackQuestion {
  id?: string;
  question: string;
  type: "multiple_choice" | "text" | "rating" | "file_upload";
  options?: QuestionOption[];
  required: boolean;
  order: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// GET — fetch all questions
export async function GET() {
  try {
    let questions: FeedbackQuestion[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "begins_with(contentId, :prefix)",
          ExpressionAttributeValues: {
            ":prefix": "FEEDBACK_Q#",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        questions = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^FEEDBACK_Q#/, ""),
          ...(item as unknown as FeedbackQuestion),
        }));
      }
    } catch (e) {
      console.warn("[feedback/questions GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (questions.length === 0 && db) {
      const snapshot = await db
        .collection("feedbackQuestions")
        .orderBy("order", "asc")
        .get();

      questions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as FeedbackQuestion),
      }));
    }

    questions.sort((a, b) => (a.order || 0) - (b.order || 0));

    return NextResponse.json({ success: true, questions });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — create a new question
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, type, options, required, order } = body;

    if (!question || !type) {
      return NextResponse.json(
        { error: "Question and type are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `feedback_q_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newQuestion: FeedbackQuestion = {
      id,
      question,
      type,
      options: options || [],
      required: required ?? true,
      order: order ?? 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      contentId: `FEEDBACK_Q#${id}`,
      sk: "FEEDBACK_Q#META",
      ...newQuestion,
    };

    await dualWrite("feedbackQuestions", id, "SocialAndContent", dynamoItem);

    return NextResponse.json(
      { success: true, id, question: newQuestion },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT — update a question
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, question, type, options, required, order, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Question ID is required" },
        { status: 400 }
      );
    }

    let existingData: Record<string, unknown> = {};

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: {
            contentId: `FEEDBACK_Q#${id}`,
            sk: "FEEDBACK_Q#META",
          },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[feedback/questions PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      const ref = db.collection("feedbackQuestions").doc(id);
      const doc = await ref.get();
      if (doc.exists) {
        existingData = doc.data() as Record<string, unknown>;
      }
    }

    const updateData: Record<string, unknown> = {
      ...existingData,
      id,
      ...(question !== undefined && { question }),
      ...(type !== undefined && { type }),
      ...(options !== undefined && { options }),
      ...(required !== undefined && { required }),
      ...(order !== undefined && { order }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      contentId: `FEEDBACK_Q#${id}`,
      sk: "FEEDBACK_Q#META",
      ...updateData,
    };

    await dualWrite("feedbackQuestions", id, "SocialAndContent", dynamoItem);

    return NextResponse.json({
      success: true,
      question: updateData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — delete a question
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Question ID is required" },
        { status: 400 }
      );
    }

    await dualDelete("feedbackQuestions", id, "SocialAndContent", {
      contentId: `FEEDBACK_Q#${id}`,
      sk: "FEEDBACK_Q#META",
    });

    return NextResponse.json({
      success: true,
      message: "Question deleted successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}