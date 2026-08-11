import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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

// GET - Fetch single feedback submission by ID
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "feedback ID is required" }, { status: 400 });
    }

    let submission: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Query first
    try {
      const queryRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `FEEDBACK_SUB#${id}`,
          },
        })
      );
      if (queryRes.Items && queryRes.Items.length > 0) {
        submission = { id, ...(queryRes.Items[0] as unknown as FeedbackSubmission) };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn(`[feedback/submissions/[id] GET] DynamoDB query failed:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const doc = await db.collection("feedbackSubmissions").doc(id).get();
        if (doc.exists) {
          submission = { id: doc.id, ...(doc.data() as FeedbackSubmission) };
        }
      } catch (fsErr) {
        console.error(`[feedback/submissions/[id] GET] Firestore fallback failed:`, fsErr);
      }
    }

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      submission,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}