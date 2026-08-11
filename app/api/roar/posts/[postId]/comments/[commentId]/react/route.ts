//api/roar/posts/[postId]/comments/[commentId]/react/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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

    // 1. Fetch parent comment & reaction record from DynamoDB first
    let commentItem: any = null;
    let alreadyReacted = false;
    let fetchedFromDynamo = false;

    try {
      const [commentRes, reactionRes] = await Promise.all([
        docClient.send(new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: `COMMENT#${commentId}` }
        })),
        docClient.send(new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: `COMMENT_REACT#${commentId}#${resolvedUserId}` }
        }))
      ]);

      if (commentRes.Item) {
        commentItem = commentRes.Item;
        alreadyReacted = !!reactionRes.Item;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[CommentReact] DynamoDB check failed:", dynErr);
    }

    // Fallback: Check Firestore
    if (!fetchedFromDynamo) {
      try {
        const commentSnap = await commentRef.get();
        if (commentSnap.exists) {
          commentItem = commentSnap.data();
          const reactionSnap = await commentRef.collection("reactions").doc(resolvedUserId).get();
          alreadyReacted = reactionSnap.exists;
        }
      } catch (fsErr) {
        console.warn("[CommentReact] Firestore check failed:", fsErr);
      }
    }

    if (!commentItem) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (alreadyReacted) {
      return NextResponse.json({ error: "Already reacted" }, { status: 400 });
    }

    const currentHeartCount = commentItem.heartCount ?? 0;
    const finalHeartCount = currentHeartCount + 1;

    // 2. Write to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "SocialAndContent",
        Item: {
          contentId: `POST#${postId}`,
          sk: `COMMENT_REACT#${commentId}#${resolvedUserId}`,
          reactedAt: Date.now()
        }
      }));

      await docClient.send(new UpdateCommand({
        TableName: "SocialAndContent",
        Key: { contentId: `POST#${postId}`, sk: `COMMENT#${commentId}` },
        UpdateExpression: "SET heartCount = :hc",
        ExpressionAttributeValues: { ":hc": finalHeartCount }
      })).catch((e) => console.warn("[CommentReact] Failed to update comment heartCount in DynamoDB:", e));
    } catch (dynErr) {
      console.warn("[CommentReact] DynamoDB write failed:", dynErr);
    }

    // 3. Sync/Fallback to Firestore
    try {
      const reactionRef = commentRef.collection("reactions").doc(resolvedUserId);
      await db.runTransaction(async (tx) => {
        tx.update(commentRef, {
          heartCount: FieldValue.increment(1),
        });
        tx.set(reactionRef, {
          reactedAt: Date.now(),
        });
      });
    } catch (fsErr) {
      console.warn("[CommentReact] Firestore write failed:", fsErr);
    }

    return NextResponse.json({ success: true, heartCount: finalHeartCount });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
