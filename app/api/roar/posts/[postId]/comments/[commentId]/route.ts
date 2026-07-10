//api/roar/posts/[postId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> },
) {
  try {
    const { postId, commentId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const commentRef = db
      .collection("roarPosts")
      .doc(postId)
      .collection("comments")
      .doc(commentId);

    const snap = await commentRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const commentData = snap.data() as { authorUid: string };
    
    const RESTRICTED_USERS = [
      // "venkyiimb@gmail.com",
      // "sethi.anshul39@gmail.com"
      ""
    ];
    // Check if author or admin
    if (commentData.authorUid !== user.userId && user.role !== "admin") {
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const batch = db.batch();
    batch.delete(commentRef);
    batch.update(db.collection("roarPosts").doc(postId), {
      replyCount: FieldValue.increment(-1),
      updatedAt: Date.now(),
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
