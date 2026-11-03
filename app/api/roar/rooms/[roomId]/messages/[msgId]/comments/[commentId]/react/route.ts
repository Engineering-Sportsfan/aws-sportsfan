import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { findRoomMessage, normalizeReaction, reactionCountField } from "@/lib/roarRoomHelpers";
import { QueryCommand, DeleteCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string; commentId: string }> }
) {
  try {
    const user = await getUser(req);
    const resolvedParams = await params;
    const { roomId, msgId, commentId } = resolvedParams;
    const body = await req.json().catch(() => ({}));
    const rawReaction = body?.reaction || "heart";

    const reaction = normalizeReaction(rawReaction) || "heart";
    const userId = user?.userId || user?.email || body?.userId || req.headers.get("x-user-id") || "guest_fan";
    const cleanRoomId = roomId.replace(/^ROOM#/, "");

    const found = await findRoomMessage(cleanRoomId, msgId);
    const targetMsgId = found?.rawMsgId || msgId;
    const roomCand = found?.roomIdKey || `ROOM#${cleanRoomId}`;
    const cleanCommentKey = String(commentId || "")
      .replace(/^COMMENT#/, "")
      .replace(new RegExp(`^${targetMsgId}#`), "")
      .replace(/^COMMENT#/, "")
      .trim();

    // 1. Fetch parent comment from DynamoDB first
    let commentItem: any = null;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :r AND sk = :s",
        ExpressionAttributeValues: { ":r": roomCand, ":s": `COMMENT#${targetMsgId}#${cleanCommentKey}` },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        commentItem = qRes.Items[0];
      }
    } catch (dynErr) {
      console.warn("[CommentReact POST] DynamoDB comment fetch failed:", dynErr);
    }

    const commentRef = db
      .collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId)
      .collection("messages").doc(targetMsgId)
      .collection("comments").doc(cleanCommentKey);

    // Fallback: Check Firestore
    let commentExists = !!commentItem;
    let fallbackData: any = null;

    if (!commentExists) {
      try {
        const snap = await commentRef.get();
        if (snap.exists) {
          commentExists = true;
          fallbackData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[CommentReact POST] Firestore comment fetch failed:", fsErr);
      }
    }

    if (!commentExists) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    const data = commentItem || fallbackData || {};
    const reactions = { ...(data.reactions ?? {}) };
    const previousReaction = reactions[userId] ?? null;
    const isSameReaction = previousReaction === reaction;

    const newHeartCount = Math.max(0, (data.heartCount ?? data.likesCount ?? data.likes ?? 0) + (isSameReaction ? -1 : (previousReaction ? 0 : 1)));

    const existingLikedBy: string[] = Array.isArray(data.likedBy) ? data.likedBy : Object.keys(reactions);
    const updatedLikedBy = isSameReaction
      ? existingLikedBy.filter((u: string) => u !== userId && u !== "me")
      : Array.from(new Set([...existingLikedBy, userId]));

    if (isSameReaction) {
      // Toggle reaction off
      delete reactions[userId];
      const prevField = reactionCountField(previousReaction);
      const newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);

      // Update DynamoDB
      try {
        // A. Delete reaction record
        await docClient.send(new DeleteCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: roomCand, sk: `LIKE#${cleanCommentKey}#${userId}` }
        }));

        // B. Update Parent Item
        if (commentItem) {
          await docClient.send(new UpdateCommand({
            TableName: TABLES.RealTimeChat,
            Key: { roomId: roomCand, sk: `COMMENT#${targetMsgId}#${cleanCommentKey}` },
            UpdateExpression: "SET reactions = :r, heartCount = :hc, likesCount = :hc, likedBy = :lb, #pf = :pfc",
            ExpressionAttributeNames: { "#pf": prevField },
            ExpressionAttributeValues: { ":r": reactions, ":hc": newHeartCount, ":lb": updatedLikedBy, ":pfc": newPrevFieldCount }
          }));
        }
      } catch (dynErr) {
        console.warn("[CommentReact POST] DynamoDB remove failed:", dynErr);
      }

      // Sync/Fallback to Firestore
      try {
        await commentRef.update({
          [`reactions.${userId}`]: FieldValue.delete(),
          heartCount: newHeartCount,
          likesCount: newHeartCount,
          likedBy: updatedLikedBy,
          [reactionCountField(previousReaction)]: FieldValue.increment(-1),
        });
        await commentRef.collection("likes").doc(userId).delete();
      } catch (fsErr) {
        console.warn("[CommentReact POST] Firestore remove failed:", fsErr);
      }

      return NextResponse.json({
        success: true,
        action: "removed",
        reaction: null,
        heartCount: newHeartCount,
        likesCount: newHeartCount,
        liked: false,
        likedBy: updatedLikedBy,
      });
    }

    // Add or Switch reaction
    reactions[userId] = reaction;
    const field = reactionCountField(reaction);
    const newFieldCount = (data[field] ?? 0) + 1;

    let updateExpr = "SET reactions = :r, heartCount = :hc, likesCount = :hc, likedBy = :lb, #f = :fc";
    let attrNames: Record<string, string> = { "#f": field };
    let attrVals: Record<string, any> = { ":r": reactions, ":hc": newHeartCount, ":lb": updatedLikedBy, ":fc": newFieldCount };

    let prevField = "";
    let newPrevFieldCount = 0;
    if (previousReaction) {
      prevField = reactionCountField(previousReaction);
      newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);
      updateExpr += ", #pf = :pfc";
      attrNames["#pf"] = prevField;
      attrVals[":pfc"] = newPrevFieldCount;
    }

    // Update DynamoDB
    try {
      // A. Put reaction record
      await docClient.send(new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: {
          roomId: roomCand,
          sk: `LIKE#${cleanCommentKey}#${userId}`,
          reaction: reaction,
          reactedAt: Date.now()
        }
      }));

      // B. Update Parent Item
      if (commentItem) {
        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: roomCand, sk: `COMMENT#${targetMsgId}#${cleanCommentKey}` },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: attrNames,
          ExpressionAttributeValues: attrVals
        }));
      }
    } catch (dynErr) {
      console.warn("[CommentReact POST] DynamoDB write failed:", dynErr);
    }

    // Sync/Fallback to Firestore
    try {
      const fsUpdate: Record<string, any> = {
        [`reactions.${userId}`]: reaction,
        [field]: FieldValue.increment(1),
        heartCount: newHeartCount,
        likesCount: newHeartCount,
        likedBy: updatedLikedBy,
      };
      if (previousReaction) {
        fsUpdate[prevField] = FieldValue.increment(-1);
      }
      await commentRef.update(fsUpdate);
      await commentRef.collection("likes").doc(userId).set({ reaction, reactedAt: Date.now(), userId });
    } catch (fsErr) {
      console.warn("[CommentReact POST] Firestore write failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      action: previousReaction ? "switched" : "added",
      reaction,
      heartCount: newHeartCount,
      likesCount: newHeartCount,
      liked: true,
      likedBy: updatedLikedBy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
