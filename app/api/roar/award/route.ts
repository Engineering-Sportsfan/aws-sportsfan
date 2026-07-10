import { NextRequest, NextResponse } from "next/server";
import { awardUserPoints, getUserInfo } from "@/lib/userPoints";

// POST: Award points for user activity (Service 1)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, reason, transactionId, metadata } = body;

    // Validate inputs
    if (!userId || !reason || !transactionId) {
      return NextResponse.json(
        { success: false, error: "userId, reason, and transactionId are required fields" },
        { status: 400 }
      );
    }

    // Load user profile details using the internal fallback resolver
    const userProfile = await getUserInfo(userId);

    // Invoke the points engine to calculate, limit, and award points
    const success = await awardUserPoints({
      actualUserId: userProfile.actualUserId,
      authUserId: userProfile.authUserId,
      userName: userProfile.userName,
      userEmail: userProfile.userEmail,
      userExists: userProfile.exists,
      points: 0, // Points are fetched dynamically from Firestore rules configuration
      reason,
      transactionId,
      metadata
    });

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Activity ${reason} processed successfully for user ${userId}`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Activity processing skipped (possibly due to daily caps, short session, or duplicate transaction)"
      }, { status: 200 }); // Status 200 to prevent frontend crashes on soft-skips
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/award error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
