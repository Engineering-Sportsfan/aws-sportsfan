// api/roar/rooms/[roomId]/messages/[msgId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { notifyRoomMessageComment } from "@/lib/roarNotifyHelpers";
import { awardRoarPointsByReason } from "@/lib/roarPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand, UpdateCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveCommentAuthorId(userId: string, email: string): Promise<string> {
  const info = await getUserInfo(userId, undefined, email);
  return info.exists ? info.actualUserId : userId;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    let comments: any[] = [];
    let fetchedFromDynamo = false;

    // Try DynamoDB
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `COMMENT#${msgId}#` },
        Limit: limit
      }));
      if (res.Items) {
        comments = res.Items.map(item => ({
          id: (item.sk as string).split("#")[2],
          commentId: (item.sk as string).split("#")[2],
          ...item
        }));
        // Sort by createdAt desc in memory
        comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomComments GET] DynamoDB query failed, trying Firestore:", dynErr);
    }

    // Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snap = await db
          .collection("roarRooms")
          .doc(roomId)
          .collection("messages")
          .doc(msgId)
          .collection("comments")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        comments = snap.docs.map((doc) => ({
          id: doc.id,
          commentId: doc.id,
          ...doc.data(),
        }));
      } catch (fsErr) {
        console.error("[RoomComments GET] Firestore fallback failed:", fsErr);
      }
    }

    // Fetch live avatarUrl/badge per unique author
    const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
    const uniqueAuthorUids = Array.from(
      new Set(comments.map((c) => c.authorUid).filter(Boolean))
    );

    if (uniqueAuthorUids.length > 0) {
      let fetchedProfiles = false;
      try {
        const keys = uniqueAuthorUids.map(uid => ({
          entityId: `USER#${uid}`,
          sk: "USER#META"
        }));
        const batchRes = await docClient.send(new BatchGetCommand({
          RequestItems: {
            "IdentityAndAccess": {
              Keys: keys
            }
          }
        }));
        const items = batchRes.Responses?.["IdentityAndAccess"] || [];
        items.forEach(item => {
          const uid = (item.entityId as string).replace(/^USER#/, "");
          authorMap.set(uid, {
            avatarUrl: item.avatarUrl ?? null,
            badge: item.badge ?? null,
          });
        });
        fetchedProfiles = true;
      } catch (dynErr) {
        console.warn("[RoomComments GET] DynamoDB batch profile lookup failed, trying Firestore:", dynErr);
      }

      if (!fetchedProfiles || authorMap.size < uniqueAuthorUids.length) {
        try {
          const missingUserIds = uniqueAuthorUids.filter(uid => !authorMap.has(uid));
          const authorSnaps = await Promise.all(
            missingUserIds.map((uid) => db.collection("users").doc(uid).get())
          );
          authorSnaps.forEach((s, idx) => {
            const uid = missingUserIds[idx];
            const data = s.exists ? (s.data() as any) : null;
            authorMap.set(uid, {
              avatarUrl: data?.avatarUrl ?? null,
              badge: data?.badge ?? null,
            });
          });
        } catch (fsErr) {
          console.error("[RoomComments GET] Firestore batch profiles failed:", fsErr);
        }
      }
    }

    const commentsWithAuthor = comments.map((c) => {
      const author = authorMap.get(c.authorUid);
      return {
        ...c,
        authorAvatarUrl: author?.avatarUrl ?? c.authorAvatarUrl ?? null,
        authorBadge: author?.badge ?? c.authorBadge ?? null,
      };
    });

    return NextResponse.json({ success: true, comments: commentsWithAuthor });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const body = await req.json();
    const text: string = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedAuthorId = info.exists ? info.actualUserId : user.userId;
    const { username, avatarUrl, badge } = await resolveUserInfo(resolvedAuthorId, user.name, user.email);
    const now = Date.now();

    // existence check on room message
    let msgItem: any = null;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND sk = :s",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `MSG#${msgId}` },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        msgItem = qRes.Items[0];
      }
    } catch (dynErr) {
      console.warn("[RoomComments POST] DynamoDB msg check failed:", dynErr);
    }

    let isWatchalongFallback = false;
    let roomRef = db.collection("roarRooms").doc(roomId);

    if (!msgItem) {
      // Check Firestore fallback
      const msgSnap = await roomRef.collection("messages").doc(msgId).get();
      if (!msgSnap.exists) {
        const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
        const fallbackSnap = await fallbackRef.collection("messages").doc(msgId).get();
        if (fallbackSnap.exists) {
          roomRef = fallbackRef;
          isWatchalongFallback = true;
        } else {
          return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }
      }
    }

    const commentRef = roomRef
      .collection("messages")
      .doc(msgId)
      .collection("comments")
      .doc();

    const commentId = commentRef.id;

    // 1. Write to DynamoDB First
    try {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `COMMENT#${msgId}#${commentId}`,
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

      // Increment replyCount on parent message
      await docClient.send(new UpdateCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${msgId}` },
        UpdateExpression: "ADD replyCount :one",
        ExpressionAttributeValues: { ":one": 1 }
      })).catch((e) => console.warn("[RoomComments POST] Failed to update room message replyCount in DynamoDB:", e));
    } catch (dynErr) {
      console.warn("[RoomComments POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync/Fallback to Firestore
    try {
      await commentRef.set({
        commentId,
        text,
        authorUid: resolvedAuthorId,
        authorEmail: user.email,
        authorUsername: username,
        authorAvatarUrl: avatarUrl,
        authorBadge: badge,
        createdAt: now,
        roomId,
      });

      roomRef
        .collection("messages")
        .doc(msgId)
        .update({ replyCount: FieldValue.increment(1) })
        .catch(() => { });
    } catch (fsErr) {
      console.warn("[RoomComments POST] Firestore write failed:", fsErr);
    }

    let watchAlongRoomId = null;
    let roarRoomId = null;

    try {
      if (isWatchalongFallback) {
        watchAlongRoomId = roomId;
        const roarRoomSnap = await db.collection("roarRooms")
          .where("watchAlongRoomId", "==", roomId)
          .limit(1)
          .get();
        if (!roarRoomSnap.empty) {
          roarRoomId = roarRoomSnap.docs[0].id;
        }
      } else {
        roarRoomId = roomId;
        const roarRoomDoc = await db.collection("roarRooms").doc(roomId).get();
        if (roarRoomDoc.exists) {
          watchAlongRoomId = roarRoomDoc.data()?.watchAlongRoomId ?? null;
        }
      }
    } catch (fsErr) {
      console.warn("[RoomComments POST] Room ID resolution failed:", fsErr);
    }

    awardRoarPointsByReason({
      actualUserId: resolvedAuthorId,
      authUserId: user.userId,
      userName: username,
      userEmail: user.email,
      userExists: info.exists,
      reason: "ROAR_COMMENT",
      points: 8,
      transactionId: `comment_${commentId}`,
      metadata: {
        roomId,
        msgId,
        commentId,
        watchAlongRoomId,
        roarRoomId
      },
    }).catch(() => { });

    // Notify post author
    notifyRoomMessageComment(roomId, msgId, resolvedAuthorId, user.email, username, text.slice(0, 80)).catch(() => { });

    return NextResponse.json({
      success: true,
      commentId: commentId,
      comment: {
        id: commentId,
        commentId: commentId,
        text,
        authorUid: resolvedAuthorId,
        authorUsername: username,
        authorAvatarUrl: avatarUrl,
        authorBadge: badge,
        roomId,
        createdAt: now,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function resolveUserInfo(userId: string, name: string, email: string): Promise<{
  username: string;
  avatarUrl: string | null;
  badge: string | null;
}> {
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (snap.exists) {
      const d = snap.data()!;
      return {
        username: (d.username as string) || name || email.split("@")[0],
        avatarUrl: (d.avatarUrl as string) ?? null,
        badge: (d.badge as string) ?? null,
      };
    }
  } catch { }
  return { username: name || email.split("@")[0], avatarUrl: null, badge: null };
}