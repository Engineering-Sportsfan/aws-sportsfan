// api/roar/rooms/[roomId]/messages/[msgId]/comments/[commentId]/react/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function reactionCountField(reaction: string): string {
  const map: Record<string, string> = {
    heart: "heartCount", fire: "fireCount", mindblown: "mindblownCount",
    goat: "goatCount", clap: "clapCount", nochance: "nochanceCount",
    laugh: "laughCount", sad: "sadCount", thumb: "thumbCount",
  };
  return map[reaction] ?? `${reaction}Count`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string; commentId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const { roomId, msgId, commentId } = resolvedParams;
    const { reaction } = await req.json();
    if (!reaction) return NextResponse.json({ error: "reaction is required" }, { status: 400 });

    const userId = user.userId;

    // 1. Fetch parent comment from DynamoDB first
    let commentItem: any = null;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND sk = :s",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `COMMENT#${msgId}#${commentId}` },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        commentItem = qRes.Items[0];
      }
    } catch (dynErr) {
      console.warn("[CommentReact POST] DynamoDB comment fetch failed:", dynErr);
    }

    const commentRef = db
      .collection("roarRooms").doc(roomId)
      .collection("messages").doc(msgId)
      .collection("comments").doc(commentId);

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

    const newHeartCount = Math.max(0, (data.heartCount ?? 0) + (isSameReaction ? -1 : (previousReaction ? 0 : 1)));

    if (isSameReaction) {
      // Toggle reaction off
      delete reactions[userId];
      const prevField = reactionCountField(previousReaction);
      const newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);

      // Update DynamoDB
      try {
        // A. Delete reaction record
        await docClient.send(new DeleteCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${commentId}#${userId}` }
        }));

        // B. Update Parent Item
        if (commentItem) {
          await docClient.send(new UpdateCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${roomId}`, sk: `COMMENT#${msgId}#${commentId}` },
            UpdateExpression: "SET reactions = :r, heartCount = :hc, #pf = :pfc",
            ExpressionAttributeNames: { "#pf": prevField },
            ExpressionAttributeValues: { ":r": reactions, ":hc": newHeartCount, ":pfc": newPrevFieldCount }
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
          [reactionCountField(previousReaction)]: FieldValue.increment(-1),
        });
        await commentRef.collection("likes").doc(userId).delete();
      } catch (fsErr) {
        console.warn("[CommentReact POST] Firestore remove failed:", fsErr);
      }

      return NextResponse.json({ success: true, action: "removed", reaction: null, heartCount: newHeartCount });
    }

    // Add or Switch reaction
    reactions[userId] = reaction;
    const field = reactionCountField(reaction);
    const newFieldCount = (data[field] ?? 0) + 1;

    let updateExpr = "SET reactions = :r, heartCount = :hc, #f = :fc";
    let attrNames: Record<string, string> = { "#f": field };
    let attrVals: Record<string, any> = { ":r": reactions, ":hc": newHeartCount, ":fc": newFieldCount };

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
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `LIKE#${commentId}#${userId}`,
          reaction: reaction,
          reactedAt: Date.now()
        }
      }));

      // B. Update Parent Item
      if (commentItem) {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `COMMENT#${msgId}#${commentId}` },
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
        heartCount: newHeartCount
      };
      if (previousReaction) {
        fsUpdate[prevField] = FieldValue.increment(-1);
      }
      await commentRef.update(fsUpdate);
      await commentRef.collection("likes").doc(userId).set({ reaction, reactedAt: Date.now(), userId });
    } catch (fsErr) {
      console.warn("[CommentReact POST] Firestore write failed:", fsErr);
    }

    return NextResponse.json({ success: true, action: previousReaction ? "switched" : "added", reaction, heartCount: newHeartCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}