
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

interface FeedbackSubmission {
    userId?: string;
    userName?: string;
    userEmail?: string;
    answers: {
        questionId: string;
        question: string;
        type: string;
        answer: string | string[] | number | null;
        fileUrls?: string[];
    }[];
    textFeedback?: string;
    rating?: number | null;
    attachments?: string[];
    status: "pending" | "reviewed" | "resolved";
    createdAt: number;
    reviewedAt?: number;
    reviewedBy?: string;
    notes?: string;
}

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
      return NextResponse.json({ error: "feedback ID is required" }, { status: 400 });
    }
        const doc = await db.collection("feedbackSubmissions").doc(id).get();
        if (!doc.exists) {
            return NextResponse.json({ error: "Submission not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            submission: { id: doc.id, ...(doc.data() as FeedbackSubmission) },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}