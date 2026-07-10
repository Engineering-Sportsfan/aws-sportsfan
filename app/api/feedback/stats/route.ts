import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Query, DocumentData, CollectionReference } from "firebase-admin/firestore";

interface FeedbackAnswer {
    questionId: string;
    answer: string | string[] | number;
}

interface FeedbackSubmission {
    status: 'pending' | 'reviewed' | 'resolved';
    createdAt: number;
    answers?: FeedbackAnswer[];
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        // ← Use Query | CollectionReference union to fix the type mismatch
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

        // ← Cast doc.data() to FeedbackSubmission — fixes the any on answers
        const submissions = submissionsSnapshot.docs.map(
            (doc) => doc.data() as FeedbackSubmission
        );

        // Calculate statistics
        const totalSubmissions = submissions.length;
        const pendingSubmissions = submissions.filter((s) => s.status === "pending").length;
        const reviewedSubmissions = submissions.filter((s) => s.status === "reviewed").length;
        const resolvedSubmissions = submissions.filter((s) => s.status === "resolved").length;

        // Average rating calculation
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

        // Submissions by day (last 30 days)
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