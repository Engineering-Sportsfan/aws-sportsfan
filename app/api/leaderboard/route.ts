import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unknown error occurred";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const userId = searchParams.get("userId");

    // Fetch the top users from globalLeaderboard ordered by totalPoints
    const snapshot = await db
      .collection("globalLeaderboard")
      .orderBy("totalPoints", "desc")
      .select("userId", "userName", "userEmail", "totalPoints", "lastUpdated")
      .get();

    const totalParticipants = snapshot.size;

    // Map documents to the legacy LeaderboardEntry structure
    const entries = snapshot.docs.map((doc, index) => {
      const d = doc.data();
      return {
        rank: index + 1,
        userId: d.userId || doc.id,
        username: d.userName || "User",
        totalPoints: d.totalPoints ?? 0,
        correctPredictions: 0,
        totalPredictions: 0,
      };
    });

    // Page the results
    const pagedEntries = entries.slice(0, limit);

    // Find the requested user's rank card
    let currentUser = null;
    if (userId) {
      currentUser = entries.find((e) => e.userId === userId) ?? null;
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: pagedEntries,
        totalParticipants,
        currentUser,
      },
    });
  } catch (err: unknown) {
    console.error("Leaderboard API error:", err);
    return NextResponse.json(
      { success: false, error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}