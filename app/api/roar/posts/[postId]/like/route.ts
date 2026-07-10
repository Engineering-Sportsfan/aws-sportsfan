import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let resolvedUserId = user.email;
    let userSnap = await db.collection("users").doc(user.email).get();
    if (!userSnap.exists) {
      userSnap = await db.collection("users").doc(user.userId).get();
      if (userSnap.exists) resolvedUserId = user.userId;
    }

    const postRef = db.collection("roarPosts").doc(postId);
    const likeRef = postRef.collection("likes").doc(resolvedUserId);

    let likeCount = 0;
    let liked = false;

    await db.runTransaction(async (tx) => {
      const [postSnap, likeSnap] = await Promise.all([
        tx.get(postRef),
        tx.get(likeRef),
      ]);

      if (!postSnap.exists) throw new Error("Post not found");

      if (likeSnap.exists) {
        // Unlike
        tx.delete(likeRef);
        tx.update(postRef, { likeCount: FieldValue.increment(-1) });
        likeCount = Math.max(0, (postSnap.data() as any).likeCount ?? 1) - 1;
        liked = false;
      } else {
        // Like
        tx.set(likeRef, { likedAt: Date.now() });
        tx.update(postRef, { likeCount: FieldValue.increment(1) });
        likeCount = ((postSnap.data() as any).likeCount ?? 0) + 1;
        liked = true;
      }
    });

    return NextResponse.json({ success: true, likeCount, liked });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
