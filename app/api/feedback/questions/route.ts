import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


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
        const snapshot = await db
            .collection("feedbackQuestions")
            .orderBy("order", "asc")
            .get();

        const questions = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as FeedbackQuestion),
        }));

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

        const newQuestion: FeedbackQuestion = {
            question,
            type,
            options: options || [],
            required: required ?? true,
            order: order ?? 0,
            isActive: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const docRef = await db.collection("feedbackQuestions").add(newQuestion);

        return NextResponse.json(
            { success: true, id: docRef.id, question: newQuestion },
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

        const ref = db.collection("feedbackQuestions").doc(id);
        const doc = await ref.get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: "Question not found" },
                { status: 404 }
            );
        }

        const updateData: Partial<FeedbackQuestion> = {
            ...(question !== undefined && { question }),
            ...(type !== undefined && { type }),
            ...(options !== undefined && { options }),
            ...(required !== undefined && { required }),
            ...(order !== undefined && { order }),
            ...(isActive !== undefined && { isActive }),
            updatedAt: Date.now(),
        };

        await ref.update(updateData);
        const updated = await ref.get();

        return NextResponse.json({
            success: true,
            question: { id: updated.id, ...(updated.data() as FeedbackQuestion) },
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

        const ref = db.collection("feedbackQuestions").doc(id);
        const doc = await ref.get();

        if (!doc.exists) {
            return NextResponse.json(
                { error: "Question not found" },
                { status: 404 }
            );
        }

        await ref.delete();

        return NextResponse.json({
            success: true,
            message: "Question deleted successfully",
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}