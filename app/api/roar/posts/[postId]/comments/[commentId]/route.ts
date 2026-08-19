//api/roar/posts/[postId]/comments/[commentId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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

    // 1. Fetch Comment from DynamoDB first
    let commentData: any = null;
    let fetchedFromDynamo = false;

    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "SocialAndContent",
        Key: { contentId: `POST#${postId}`, sk: `COMMENT#${commentId}` }
      }));
      if (getRes.Item) {
        commentData = getRes.Item;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Comment DELETE] DynamoDB comment fetch failed:", dynErr);
    }

    const commentRef = db
      .collection("roarPosts")
      .doc(postId)
      .collection("comments")
      .doc(commentId);

    // Fallback: Check Firestore
    if (!fetchedFromDynamo) {
      try {
        const snap = await commentRef.get();
        if (snap.exists) {
          commentData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[Comment DELETE] Firestore comment fetch failed:", fsErr);
      }
    }

    if (!commentData) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    
    const RESTRICTED_USERS = [""];
    // Check if author or admin
    if (commentData.authorUid !== user.userId && user.role !== "admin") {
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 2. Delete from DynamoDB
    try {
      // A. Delete comment item
      await docClient.send(new DeleteCommand({
        TableName: "SocialAndContent",
        Key: { contentId: `POST#${postId}`, sk: `COMMENT#${commentId}` }
      }));

      // B. Find parent post and decrement replyCount
      const postRes = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
        Limit: 1
      }));
      if (postRes.Items && postRes.Items.length > 0) {
        const postSk = postRes.Items[0].sk;
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: postSk },
          UpdateExpression: "SET replyCount = size(replyCount) - :one", // fallback logic or conditional if positive
          ExpressionAttributeValues: { ":one": 1 }
        })).catch(async () => {
          // Fallback simple UpdateCommand if expression size() is not ideal
          await docClient.send(new UpdateCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `POST#${postId}`, sk: postSk },
            UpdateExpression: "ADD replyCount :negOne",
            ExpressionAttributeValues: { ":negOne": -1 }
          })).catch(() => {});
        });
      }
    } catch (dynErr) {
      console.warn("[Comment DELETE] DynamoDB delete failed:", dynErr);
    }

    // 3. Sync/Fallback to Firestore
    try {
      const batch = db.batch();
      batch.delete(commentRef);
      batch.update(db.collection("roarPosts").doc(postId), {
        replyCount: FieldValue.increment(-1),
        updatedAt: Date.now(),
      });
      await batch.commit();
    } catch (fsErr) {
      console.warn("[Comment DELETE] Firestore delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
