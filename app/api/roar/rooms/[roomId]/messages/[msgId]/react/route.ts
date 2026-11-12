// app/api/roar/rooms/[roomId]/messages/[msgId]/react/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { notifyRoomMessageReaction } from "@/lib/notifications";
import { getUserInfo } from "@/lib/userPoints";
import { db } from "@/lib/firebaseAdmin";
import { findRoomMessage, VALID_REACTIONS, normalizeReaction, COUNT_FIELDS } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const rawReaction: string | null = body.reaction ?? null;
    const reaction = normalizeReaction(rawReaction);

    if (rawReaction !== null && !VALID_REACTIONS.includes(rawReaction.toLowerCase())) {
      return NextResponse.json(
        { error: `reaction must be one of: ${VALID_REACTIONS.join(", ")}, or null` },
        { status: 400 }
      );
    }

    const clientUserId = body?.userId || req.headers.get("x-user-id");
    let resolvedUserId: string = "";
    if (user?.userId) {
      try {
        const info = await getUserInfo(user.userId, undefined, user.email);
        resolvedUserId = info.exists ? info.actualUserId : user.userId;
      } catch {
        resolvedUserId = user.userId;
      }
    } else if (clientUserId) {
      resolvedUserId = String(clientUserId).trim();
    } else {
      resolvedUserId = "guest_fan";
    }

    // 1. Find message across DynamoDB & Firestore
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const found = await findRoomMessage(cleanRoomId, msgId);
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

    // Fallback: check Firestore for existing reaction if not in DynamoDB
    if (!existingReaction && db) {
      try {
        const snap = await db
          .collection(getFirestoreCollection("roarRooms"))
          .doc(cleanRoomId)
          .collection("messages")
          .doc(targetMsgId)
          .collection("likes")
          .doc(resolvedUserId)
          .get();
        if (snap.exists) {
          existingReaction = normalizeReaction(snap.data()?.reaction) ?? null;
        }
      } catch {}
    }

    // Determine target reaction: if user sends same reaction that is already active, toggle it off (unlike)
    const effectiveReaction = (existingReaction === reaction && reaction !== null) ? null : reaction;

    const updates: Record<string, number> = {};
    let totalReactions = Math.max(0, Number(msgItem.heartCount ?? msgItem.likeCount ?? 0));

    // If removing previous reaction
    if (existingReaction) {
      const oldField = COUNT_FIELDS[existingReaction] || "heartCount";
      updates[oldField] = Math.max(0, (msgItem[oldField] ?? 0) - 1);
      totalReactions = Math.max(0, totalReactions - 1);
    }

    // If applying new reaction
    if (effectiveReaction) {
      const newField = COUNT_FIELDS[effectiveReaction] || "heartCount";
      const base = newField in updates ? updates[newField] : (msgItem[newField] ?? 0);
      updates[newField] = base + 1;
      totalReactions = totalReactions + 1;
    }

    updates["heartCount"] = totalReactions;
    updates["likeCount"] = totalReactions;

    // 3. Write/delete user's reaction record in DynamoDB
    try {
      if (effectiveReaction) {
        await docClient.send(new PutCommand({
          TableName: TABLES.RealTimeChat,
          Item: {
            roomId: roomIdKey,
            sk: `LIKE#${targetMsgId}#${resolvedUserId}`,
            reaction: effectiveReaction,
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
      const msgRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId);
      const reactionRef = msgRef.collection("likes").doc(resolvedUserId);

      if (effectiveReaction) {
        await reactionRef.set({ reaction: effectiveReaction, reactedAt: Date.now(), userId: resolvedUserId }, { merge: true });
      } else {
        await reactionRef.delete();
      }

      await msgRef.set({ heartCount: totalReactions, likeCount: totalReactions }, { merge: true });
    } catch (fsErr) {
      console.warn("[MessageReact POST] Firestore sync notice:", fsErr);
    }

    // Notify author if a new reaction was added and user is authenticated
    if (effectiveReaction && user?.email) {
      notifyRoomMessageReaction(roomId, targetMsgId, resolvedUserId, effectiveReaction, user.email, {
        authorUid: msgItem.authorUid || msgItem.userId,
        authorEmail: msgItem.authorEmail || msgItem.email,
        text: msgItem.text || msgItem.content,
      }).catch((notifErr) => {
        console.warn("[MessageReact POST] Notification notice:", notifErr);
      });
    }

    return NextResponse.json({
      success: true,
      reaction: effectiveReaction,
      heartCount: totalReactions,
      likeCount: totalReactions,
      ...updates,
    });
  } catch (error: any) {
    console.error("POST /api/roar/rooms/[roomId]/messages/[msgId]/react error:", error);
    return NextResponse.json({ error: error.message || "Failed to save reaction" }, { status: 500 });
  }
}
