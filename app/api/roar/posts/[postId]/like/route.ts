import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

    // 1. Fetch Post Meta from DynamoDB first
    let postItem: any = null;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        postItem = qRes.Items[0];
      }
    } catch (dynErr) {
      console.warn("[PostLike] DynamoDB post fetch failed:", dynErr);
    }

    // Fallback: Check Firestore
    let postExists = !!postItem;
    let currentLikeCount = postItem ? (postItem.likeCount ?? 0) : 0;
    const postRef = db.collection("roarPosts").doc(postId);

    if (!postExists) {
      try {
        const postSnap = await postRef.get();
        if (postSnap.exists) {
          postExists = true;
          currentLikeCount = postSnap.data()?.likeCount ?? 0;
        }
      } catch (fsErr) {
        console.warn("[PostLike] Firestore post check failed:", fsErr);
      }
    }

    if (!postExists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // 2. Check if already liked in DynamoDB first
    let alreadyLiked = false;
    try {
      const likeRes = await docClient.send(new GetCommand({
        TableName: "SocialAndContent",
        Key: { contentId: `POST#${postId}`, sk: `LIKE#${resolvedUserId}` }
      }));
      alreadyLiked = !!likeRes.Item;
    } catch (dynErr) {
      console.warn("[PostLike] DynamoDB like check failed, checking Firestore:", dynErr);
      // Fallback: check Firestore
      try {
        const likeSnap = await postRef.collection("likes").doc(resolvedUserId).get();
        alreadyLiked = likeSnap.exists;
      } catch (fsErr) {
        console.warn("[PostLike] Firestore like check failed:", fsErr);
      }
    }

    let likeCount = currentLikeCount;
    let liked = false;

    if (alreadyLiked) {
      // unlike operation
      liked = false;
      likeCount = Math.max(0, currentLikeCount - 1);

      // A. Update DynamoDB
      try {
        await docClient.send(new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: `LIKE#${resolvedUserId}` }
        }));

        if (postItem) {
          await docClient.send(new UpdateCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `POST#${postId}`, sk: postItem.sk },
            UpdateExpression: "SET likeCount = :c",
            ExpressionAttributeValues: { ":c": likeCount }
          }));
        }
      } catch (dynErr) {
        console.warn("[PostLike] DynamoDB unlike update failed:", dynErr);
      }

      // B. Update Firestore (Dual-Write Fallback)
      try {
        const likeRef = postRef.collection("likes").doc(resolvedUserId);
        await db.runTransaction(async (tx) => {
          tx.delete(likeRef);
          tx.update(postRef, { likeCount: FieldValue.increment(-1) });
        });
      } catch (fsErr) {
        console.warn("[PostLike] Firestore unlike sync failed:", fsErr);
      }
    } else {
      // like operation
      liked = true;
      likeCount = currentLikeCount + 1;

      // A. Update DynamoDB
      try {
        await docClient.send(new PutCommand({
          TableName: "SocialAndContent",
          Item: {
            contentId: `POST#${postId}`,
            sk: `LIKE#${resolvedUserId}`,
            likedAt: Date.now()
          }
        }));

        if (postItem) {
          await docClient.send(new UpdateCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `POST#${postId}`, sk: postItem.sk },
            UpdateExpression: "SET likeCount = :c",
            ExpressionAttributeValues: { ":c": likeCount }
          }));
        }
      } catch (dynErr) {
        console.warn("[PostLike] DynamoDB like update failed:", dynErr);
      }

      // B. Update Firestore (Dual-Write Fallback)
      try {
        const likeRef = postRef.collection("likes").doc(resolvedUserId);
        await db.runTransaction(async (tx) => {
          tx.set(likeRef, { likedAt: Date.now() });
          tx.update(postRef, { likeCount: FieldValue.increment(1) });
        });
      } catch (fsErr) {
        console.warn("[PostLike] Firestore like sync failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, likeCount, liked });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
