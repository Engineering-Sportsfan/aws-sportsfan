//api/roar/posts/[postId]/comments/[commentId]/react/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> },
) {
  try {
    const { postId, commentId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve user ID
    let resolvedUserId = user.email;
    let userSnap = await db.collection("users").doc(user.email).get();
    if (!userSnap.exists) {
      userSnap = await db.collection("users").doc(user.userId).get();
      if (userSnap.exists) {
        resolvedUserId = user.userId;
      }
    }

    const commentRef = db
      .collection("roarPosts")
      .doc(postId)
      .collection("comments")
      .doc(commentId);

    const reactionRef = commentRef.collection("reactions").doc(resolvedUserId);

    let finalHeartCount = 0;

    await db.runTransaction(async (tx) => {
      const [commentSnap, reactionSnap] = await Promise.all([
        tx.get(commentRef),
        tx.get(reactionRef),
      ]);

      if (!commentSnap.exists) {
        throw new Error("Comment not found");
      }

      if (reactionSnap.exists) {
        throw new Error("Already reacted");
      }

      const current = (commentSnap.data() as any).heartCount ?? 0;
      finalHeartCount = current + 1;

      tx.update(commentRef, {
        heartCount: FieldValue.increment(1),
      });

      tx.set(reactionRef, {
        reactedAt: Date.now(),
      });
    });

    return NextResponse.json({ success: true, heartCount: finalHeartCount });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    if (msg === "Comment not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Already reacted") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
