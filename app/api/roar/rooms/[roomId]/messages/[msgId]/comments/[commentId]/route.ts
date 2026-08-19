// api/roar/rooms/[roomId]/messages/[msgId]/comments/[commentId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string; commentId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId, commentId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. Fetch Comment from DynamoDB first
    let commentData: any = null;
    let fetchedFromDynamo = false;

    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `COMMENT#${msgId}#${commentId}` }
      }));
      if (getRes.Item) {
        commentData = getRes.Item;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomComment DELETE] DynamoDB comment fetch failed:", dynErr);
    }

    const commentRef = db
      .collection("roarRooms")
      .doc(roomId)
      .collection("messages")
      .doc(msgId)
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
        console.warn("[RoomComment DELETE] Firestore comment fetch failed:", fsErr);
      }
    }

    if (!commentData) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Resolve requester's canonical ID
    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedRequesterId = info.exists ? info.actualUserId : user.userId;

    const isAuthor =
      commentData.authorUid === resolvedRequesterId ||
      commentData.authorUid === user.userId ||
      commentData.authorEmail === user.email;

    if (!isAuthor && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Delete from DynamoDB
    try {
      // A. Delete comment item
      await docClient.send(new DeleteCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `COMMENT#${msgId}#${commentId}` }
      }));

      // B. Decrement parent message replyCount (Find correct sk first)
      let msgSk: string | null = null;
      try {
        const qRes = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
          FilterExpression: "chatId = :m",
          ExpressionAttributeValues: {
            ":r": `ROOM#${roomId}`,
            ":p": `MSG#${roomId}#`,
            ":m": msgId
          },
          Limit: 1
        }));
        if (qRes.Items && qRes.Items.length > 0) {
          msgSk = qRes.Items[0].sk;
        }
      } catch (dynErr) {
        console.warn("Failed to find message sk in DynamoDB:", dynErr);
      }

      if (msgSk) {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: msgSk },
          UpdateExpression: "SET replyCount = replyCount - :one",
          ExpressionAttributeValues: { ":one": 1 }
        }));
      }
    } catch (dynErr) {
      console.warn("[RoomComment DELETE] DynamoDB delete/update failed:", dynErr);
    }

    // 3. Sync/Fallback to Firestore
    try {
      await commentRef.delete();

      db.collection("roarRooms")
        .doc(roomId)
        .collection("messages")
        .doc(msgId)
        .update({ replyCount: FieldValue.increment(-1) })
        .catch(() => { });
    } catch (fsErr) {
      console.warn("[RoomComment DELETE] Firestore delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}