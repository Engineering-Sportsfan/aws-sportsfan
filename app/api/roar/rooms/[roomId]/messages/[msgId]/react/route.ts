// app/api/roar/rooms/[roomId]/messages/[msgId]/react/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";
import { getUserInfo } from "@/lib/userPoints";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { findRoomMessage, VALID_REACTIONS, normalizeReaction, COUNT_FIELDS } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const rawReaction: string | null = body.reaction ?? null;
    const reaction = normalizeReaction(rawReaction);

    if (rawReaction !== null && !VALID_REACTIONS.includes(rawReaction.toLowerCase())) {
      return NextResponse.json(
        { error: `reaction must be one of: ${VALID_REACTIONS.join(", ")}, or null` },
        { status: 400 }
      );
    }

    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedUserId = info.exists ? info.actualUserId : user.userId;
    if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    // 1. Find message across DynamoDB & Firestore
    const found = await findRoomMessage(roomId, msgId);
    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;

    // 2. Find user's existing reaction on this message
    let existingReaction: string | null = null;
    try {
      const existingRes = await docClient.send(new GetCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: roomIdKey,
          sk: `LIKE#${targetMsgId}#${resolvedUserId}`
        }
      }));
      existingReaction = normalizeReaction(existingRes.Item?.reaction) ?? null;
    } catch (e) {
      console.warn("[MessageReact POST] Existing reaction lookup notice:", e);
    }

    // Nothing to do if user clicked same active reaction again
    if (existingReaction === reaction && reaction !== null) {
      const field = COUNT_FIELDS[reaction] || "heartCount";
      const currentCount = msgItem[field] ?? 0;
      return NextResponse.json({
        success: true,
        reaction: existingReaction,
        heartCount: msgItem.heartCount ?? msgItem.likeCount ?? 0,
        [field]: currentCount,
      });
    }

    const updates: Record<string, number> = {};
    let totalReactions = Number(msgItem.heartCount ?? msgItem.likeCount ?? 0);

    // If removing previous reaction
    if (existingReaction) {
      const oldField = COUNT_FIELDS[existingReaction] || "heartCount";
      updates[oldField] = Math.max(0, (msgItem[oldField] ?? 0) - 1);
      totalReactions = Math.max(0, totalReactions - 1);
    }

    // If applying new reaction
    if (reaction) {
      const newField = COUNT_FIELDS[reaction] || "heartCount";
      const base = newField in updates ? updates[newField] : (msgItem[newField] ?? 0);
      updates[newField] = base + 1;
      totalReactions = totalReactions + 1;
    }

    updates["heartCount"] = totalReactions;
    updates["likeCount"] = totalReactions;

    // 3. Write/delete user's reaction record in DynamoDB
    try {
      if (reaction) {
        await docClient.send(new PutCommand({
          TableName: TABLES.RealTimeChat,
          Item: {
            roomId: roomIdKey,
            sk: `LIKE#${targetMsgId}#${resolvedUserId}`,
            reaction,
            reactedAt: Date.now(),
          }
        }));
      } else {
        await docClient.send(new DeleteCommand({
          TableName: TABLES.RealTimeChat,
          Key: {
            roomId: roomIdKey,
            sk: `LIKE#${targetMsgId}#${resolvedUserId}`
          }
        }));
      }

      // Update counts on parent message row in DynamoDB
      if (fromDynamo && msgSk) {
        const setExpr = Object.keys(updates).map((f, i) => `${f} = :v${i}`).join(", ");
        const values = Object.fromEntries(Object.values(updates).map((v, i) => [`:v${i}`, v]));
        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: roomIdKey, sk: msgSk },
          UpdateExpression: `SET ${setExpr}`,
          ExpressionAttributeValues: values,
        }));
      }
    } catch (dynErr) {
      console.warn("[MessageReact POST] DynamoDB write notice:", dynErr);
    }

    // 4. Firestore Sync
    try {
      const cleanRoomId = roomId.replace(/^ROOM#/, "");
      const msgRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId);
      const reactionRef = msgRef.collection("likes").doc(resolvedUserId);

      if (reaction) {
        await reactionRef.set({ reaction, reactedAt: Date.now(), userId: resolvedUserId }, { merge: true });
      } else {
        await reactionRef.delete();
      }

      await msgRef.set({ heartCount: totalReactions, likeCount: totalReactions }, { merge: true });
    } catch (fsErr) {
      console.warn("[MessageReact POST] Firestore sync notice:", fsErr);
    }

    // Notify author if a new reaction was added
    if (reaction) {
      notifyRoomMessageReaction(roomId, targetMsgId, resolvedUserId, reaction).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      reaction,
      heartCount: totalReactions,
      likeCount: totalReactions,
      ...updates,
    });
  } catch (error: any) {
    console.error("POST /api/roar/rooms/[roomId]/messages/[msgId]/react error:", error);
    return NextResponse.json({ error: error.message || "Failed to save reaction" }, { status: 500 });
  }
}