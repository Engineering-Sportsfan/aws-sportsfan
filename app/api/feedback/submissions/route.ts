// app/api/feedback/submissions/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Query, DocumentData, CollectionReference } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

interface FeedbackAnswer {
  questionId: string;
  question: string;
  type: string;
  answer: string | string[] | number | null;
  fileUrls?: string[];
}

interface FeedbackSubmission {
  id?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  answers: FeedbackAnswer[];
  textFeedback?: string;
  rating?: number | null;
  attachments?: string[];
  status: "pending" | "reviewed" | "resolved";
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  notes?: string;
  pageUrl?: string;
  userAgent?: string;
}

// GET — fetch submissions
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const lastDocId = searchParams.get("lastDocId");
    const id = searchParams.get("id");

    // Single submission fetch
    if (id) {
      try {
        const getRes = await docClient.send(
          new ScanCommand({
            TableName: "SocialAndContent",
            FilterExpression: "contentId = :cid",
            ExpressionAttributeValues: {
              ":cid": `FEEDBACK_SUB#${id}`,
            },
            Limit: 1,
          })
        );
        if (getRes.Items && getRes.Items.length > 0) {
          return NextResponse.json({
            success: true,
            submission: { id, ...(getRes.Items[0] as unknown as FeedbackSubmission) },
          });
        }
      } catch (e) {
        console.warn("[feedback/submissions single GET] DynamoDB notice:", e);
      }

      if (db) {
        const doc = await db.collection("feedbackSubmissions").doc(id).get();
        if (doc.exists) {
          return NextResponse.json({
            success: true,
            submission: { id: doc.id, ...(doc.data() as FeedbackSubmission) },
          });
        }
      }

      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    let submissions: FeedbackSubmission[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(contentId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "FEEDBACK_SUB#",
      };

      if (status && ["pending", "reviewed", "resolved"].includes(status)) {
        filterExpr += " AND #st = :status";
        exprVals[":status"] = status;
      }
      if (startDate && endDate) {
        filterExpr += " AND createdAt >= :start AND createdAt <= :end";
        exprVals[":start"] = parseInt(startDate);
        exprVals[":end"] = parseInt(endDate);
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: status ? { "#st": "status" } : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: limit,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        submissions = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^FEEDBACK_SUB#/, ""),
          ...(item as unknown as FeedbackSubmission),
        }));
      }
    } catch (e) {
      console.warn("[feedback/submissions GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (submissions.length === 0 && db) {
      let query: Query<DocumentData> | CollectionReference<DocumentData> = db
        .collection("feedbackSubmissions")
        .orderBy("createdAt", "desc")
        .limit(limit);

      if (status && ["pending", "reviewed", "resolved"].includes(status)) {
        query = query.where("status", "==", status);
      }

      if (startDate && endDate) {
        query = query
          .where("createdAt", ">=", parseInt(startDate))
          .where("createdAt", "<=", parseInt(endDate));
      }

      if (lastDocId) {
        const lastDoc = await db.collection("feedbackSubmissions").doc(lastDocId).get();
        if (lastDoc.exists) query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      submissions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as FeedbackSubmission),
      }));
    }

    submissions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      success: true,
      submissions,
      pagination: {
        hasMore: submissions.length === limit,
        nextCursor: submissions.length === limit ? { lastDocId: submissions[submissions.length - 1]?.id } : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — submit feedback
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, userName, userEmail, answers, textFeedback, rating, attachments, pageUrl, userAgent } = body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: "Answers are required" }, { status: 400 });
    }

    const processedAnswers = answers.map((answer: FeedbackAnswer) => {
      if (answer.type === "file_upload" && !answer.fileUrls && answer.answer) {
        if (typeof answer.answer === "string" && answer.answer.startsWith("http")) {
          return {
            ...answer,
            fileUrls: [answer.answer],
            answer: null,
          };
        }
      }
      return answer;
    });

    const now = Date.now();
    const id = `feedback_sub_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const submission: FeedbackSubmission = {
      id,
      userId: userId || "anonymous",
      userName: userName || "Anonymous User",
      userEmail: userEmail || "",
      answers: processedAnswers,
      textFeedback: textFeedback || "",
      rating: rating ?? null,
      attachments: attachments || [],
      status: "pending",
      createdAt: now,
    };

    if (pageUrl) submission.pageUrl = pageUrl;
    if (userAgent) submission.userAgent = userAgent;

    const dynamoItem = {
      contentId: `FEEDBACK_SUB#${id}`,
      sk: `USER#${userId || "anonymous"}#${now}`,
      ...submission,
    };

    await dualWrite("feedbackSubmissions", id, "SocialAndContent", dynamoItem);

    return NextResponse.json(
      { success: true, message: "Feedback submitted successfully", submissionId: id },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error in POST /api/feedback/submissions:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT — update submission status
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, reviewedBy, notes } = body;

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    let existingData: Record<string, unknown> = {};

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `FEEDBACK_SUB#${id}`,
          },
          Limit: 1,
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        existingData = scanRes.Items[0];
      }
    } catch (e) {
      console.warn("[feedback/submissions PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      const ref = db.collection("feedbackSubmissions").doc(id);
      const doc = await ref.get();
      if (doc.exists) {
        existingData = doc.data() as Record<string, unknown>;
      }
    }

    const now = Date.now();
    const updatedSubmission = {
      ...existingData,
      id,
      status,
      reviewedAt: now,
      reviewedBy: reviewedBy || "Admin",
      ...(notes !== undefined && { notes }),
    };

    const dynamoItem = {
      contentId: `FEEDBACK_SUB#${id}`,
      sk: (existingData.sk as string) || `USER#${existingData.userId || "anonymous"}#${existingData.createdAt || now}`,
      ...updatedSubmission,
    };

    await dualWrite("feedbackSubmissions", id, "SocialAndContent", dynamoItem);

    return NextResponse.json({
      success: true,
      submission: updatedSubmission,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — delete submission
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await dualDelete("feedbackSubmissions", id, "SocialAndContent", {
      contentId: `FEEDBACK_SUB#${id}`,
      sk: `USER#anonymous#0`,
    });

    return NextResponse.json({ success: true, message: "Deleted successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}