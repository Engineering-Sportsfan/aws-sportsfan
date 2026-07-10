// app/api/roar/fans/[username]/profile/route.ts
// Public endpoint — returns any fan's ROAR profile by username.
// Used when clicking on another user's avatar in posts/comments.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { Post } from "@/app/models/Post";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    // Must be logged in to view any profile
    const requestingUser = await getUser(req);
    if (!requestingUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { username } = params;
    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    // Find the user doc by username field
    const usersSnap = await db
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      return NextResponse.json({ error: "Fan not found" }, { status: 404 });
    }

    const userDoc = usersSnap.docs[0];
    const resolvedUserId = userDoc.id;
    const userData = userDoc.data() as any;

    if (!userData || !userData.username || !userData.badge) {
      return NextResponse.json({ error: "Fan not onboarded" }, { status: 404 });
    }

    const [badgesSnap, postsSnap, rivalSnap] = await Promise.all([
      db.collection("roarBadges").doc(resolvedUserId).collection("roarProgress").get(),
      db.collection("roarPosts").where("authorUid", "==", resolvedUserId).get(),
      db.collection("rivals").doc(resolvedUserId).get(),
    ]);

    const accuracy =
      userData.predictionCount > 0
        ? Math.round((userData.correctPredictions / userData.predictionCount) * 100)
        : 0;

    const allPosts = postsSnap.docs.map((d) => ({ ...(d.data() as Post), postId: d.id }));
    const sortedPosts = allPosts.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    // Only expose public fields — no email, no FCM token etc.
    return NextResponse.json({
      success: true,
      user: {
        username: userData.username,
        handle: userData.handle ?? userData.username,
        badge: userData.badge,
        avatarUrl: userData.avatarUrl ?? null,
        favPlayer: userData.favPlayer ?? null,
        about: userData.about ?? null,
        fanSince: userData.fanSince ?? null,
        yearsFandom: userData.yearsFandom ?? null,
        reputationScore: userData.reputationScore ?? 0,
        predictionCount: userData.predictionCount ?? 0,
        hotTakeCount: userData.hotTakeCount ?? 0,
        correctPredictions: userData.correctPredictions ?? 0,
        accuracy,
        showPredHistory: userData.showPredHistory !== false,
      },
      badges: badgesSnap.docs.map((d) => ({ ...d.data(), badgeId: d.id })),
      predictions:
        userData.showPredHistory !== false
          ? sortedPosts.filter((p: any) => p.type === "prediction").slice(0, 20)
          : [],
      hotTakes: sortedPosts.filter((p: any) => p.type === "hot_take").slice(0, 10),
      rival: rivalSnap.exists ? rivalSnap.data() : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/fans/[username]/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
