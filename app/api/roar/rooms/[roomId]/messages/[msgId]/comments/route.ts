// api/roar/rooms/[roomId]/messages/[msgId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { notifyRoomMessageComment, notifyMentions } from "@/lib/roarNotifyHelpers";
import { awardRoarPointsByReason } from "@/lib/roarPoints";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { findRoomMessage } from "@/lib/roarRoomHelpers";
import { QueryCommand, PutCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUserInfo(userId: string, name: string, email: string): Promise<{
  username: string; avatarUrl: string | null; badge: string | null;
}> {
  try {
    const res = await docClient.send(new GetCommand({
      TableName: TABLES.IdentityAndAccess,
      Key: { entityId: `USER#${userId}`, sk: "USER#META" }
    }));
    if (res.Item) {
      return {
        username: res.Item.username ?? name ?? email.split("@")[0],
        avatarUrl: res.Item.avatarUrl ?? null,
        badge: res.Item.badge ?? null,
      };
    }
  } catch (e) { console.warn("[RoomComments] resolveUserInfo notice:", e); }
  return { username: name || email.split("@")[0], avatarUrl: null, badge: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const found = await findRoomMessage(cleanRoomId, msgId);
    const targetMsgId = found?.rawMsgId || msgId;
    const roomCand = found?.roomIdKey || `ROOM#${cleanRoomId}`;

    let comments: any[] = [];
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { 
          ":r": roomCand, 
          ":p": `COMMENT#${targetMsgId}#` 
        },
        Limit: limit
      }));

      comments = (res.Items ?? []).map(item => ({
        id: (item.sk as string).split("#")[2] || item.commentId,
        commentId: (item.sk as string).split("#")[2] || item.commentId,
        ...item
      }));
    } catch (dynErr) {
      console.warn("[RoomComments GET] DynamoDB notice:", dynErr);
    }

    // Fallback to Firestore if empty
    if (comments.length === 0) {
      try {
        const snap = await db
          .collection(getFirestoreCollection("roarRooms"))
          .doc(cleanRoomId)
          .collection("messages")
          .doc(targetMsgId)
          .collection("comments")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        comments = snap.docs.map(doc => ({
          id: doc.id,
          commentId: doc.id,
          ...doc.data()
        }));
      } catch (fsErr) {
        console.warn("[RoomComments GET] Firestore notice:", fsErr);
      }
    }

    comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ success: true, comments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomId, msgId } = await params;
    const body = await req.json();
    const text: string = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedAuthorId = info.exists ? info.actualUserId : user.userId;
    const { username, avatarUrl, badge } = await resolveUserInfo(resolvedAuthorId, user.name, user.email);
    const now = Date.now();

    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const found = await findRoomMessage(cleanRoomId, msgId);
    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;
    const commentId = `cmt_${now}_${Math.random().toString(36).slice(2, 9)}`;

    // Save the comment in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: {
          roomId: roomIdKey,
          sk: `COMMENT#${targetMsgId}#${commentId}`,
          commentId,
          text,
          authorUid: resolvedAuthorId,
          authorEmail: user.email,
          authorUsername: username,
          authorAvatarUrl: avatarUrl,
          authorBadge: badge,
          createdAt: now,
        }
      }));

      // Update replyCount on parent message
      if (fromDynamo && msgSk) {
        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { 
            roomId: roomIdKey, 
            sk: msgSk
          },
          UpdateExpression: "ADD replyCount :one",
          ExpressionAttributeValues: { ":one": 1 }
        })).catch((e) => console.warn("[RoomComments POST] replyCount update notice:", e));
      }
    } catch (dynErr) {
      console.warn("[RoomComments POST] DynamoDB write notice:", dynErr);
    }

    // Save in Firestore
    try {
      const msgRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId);
      await msgRef.collection("comments").doc(commentId).set({
        id: commentId,
        commentId,
        text,
        authorUid: resolvedAuthorId,
        authorEmail: user.email,
        authorUsername: username,
        authorAvatarUrl: avatarUrl,
        authorBadge: badge,
        createdAt: now,
      });
      await msgRef.set({ replyCount: FieldValue.increment(1) }, { merge: true });
    } catch (fsErr) {
      console.warn("[RoomComments POST] Firestore sync notice:", fsErr);
    }

    // Award points
    awardRoarPointsByReason({
      actualUserId: resolvedAuthorId,
      authUserId: user.userId,
      userName: username,
      userEmail: user.email,
      userExists: info.exists,
      reason: "ROAR_COMMENT",
      points: 8,
      transactionId: `comment_${commentId}`,
      metadata: { roomId: cleanRoomId, msgId: targetMsgId, commentId },
    }).catch(() => { });

    // Notify post author on reply
    notifyRoomMessageComment(cleanRoomId, targetMsgId, resolvedAuthorId, user.email, username, text.slice(0, 80)).catch(() => { });
    notifyMentions(text, cleanRoomId, targetMsgId, resolvedAuthorId, username).catch(() => { });

    return NextResponse.json({
      success: true,
      commentId,
      comment: { 
        id: commentId, 
        commentId, 
        text, 
        authorUid: resolvedAuthorId, 
        authorUsername: username, 
        authorAvatarUrl: avatarUrl, 
        authorBadge: badge, 
        roomId: cleanRoomId, 
        createdAt: now 
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}