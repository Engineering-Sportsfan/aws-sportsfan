// app/api/feedback/stats/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Query, DocumentData, CollectionReference } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

interface FeedbackAnswer {
  questionId: string;
  answer: string | string[] | number;
}

interface FeedbackSubmission {
  status: "pending" | "reviewed" | "resolved";
  createdAt: number;
  answers?: FeedbackAnswer[];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let submissions: FeedbackSubmission[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(contentId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "FEEDBACK_SUB#",
      };

      if (startDate && endDate) {
        filterExpr += " AND createdAt >= :start AND createdAt <= :end";
        exprVals[":start"] = parseInt(startDate);
        exprVals[":end"] = parseInt(endDate);
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        submissions = scanRes.Items.map((item) => item as unknown as FeedbackSubmission);
      }
    } catch (e) {
      console.warn("[feedback/stats GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (submissions.length === 0 && db) {
      let submissionsQuery: Query<DocumentData> | CollectionReference<DocumentData> =
        db.collection("feedbackSubmissions");

      if (startDate && endDate) {
        const start = parseInt(startDate);
        const end = parseInt(endDate);
        submissionsQuery = submissionsQuery
          .where("createdAt", ">=", start)
          .where("createdAt", "<=", end);
      }

      const submissionsSnapshot = await submissionsQuery.get();
      submissions = submissionsSnapshot.docs.map(
        (doc) => doc.data() as FeedbackSubmission
      );
    }

    // Calculate statistics
    const totalSubmissions = submissions.length;
    const pendingSubmissions = submissions.filter((s) => s.status === "pending").length;
    const reviewedSubmissions = submissions.filter((s) => s.status === "reviewed").length;
    const resolvedSubmissions = submissions.filter((s) => s.status === "resolved").length;

    let totalRating = 0;
    let ratingCount = 0;

    submissions.forEach((submission) => {
      submission.answers?.forEach((answer: FeedbackAnswer) => {
        if (typeof answer.answer === "number" && answer.answer <= 10) {
          totalRating += answer.answer;
          ratingCount++;
        }
      });
    });

    const averageRating =
      ratingCount > 0 ? parseFloat((totalRating / ratingCount).toFixed(1)) : 0;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSubmissions = submissions.filter(
      (s) => s.createdAt >= thirtyDaysAgo
    );

    const submissionsByDay: Record<string, number> = {};
    recentSubmissions.forEach((submission) => {
      const date = new Date(submission.createdAt).toISOString().split("T")[0];
      submissionsByDay[date] = (submissionsByDay[date] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalSubmissions,
        pendingSubmissions,
        reviewedSubmissions,
        resolvedSubmissions,
        averageRating,
        submissionsByDay,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching feedback stats:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}