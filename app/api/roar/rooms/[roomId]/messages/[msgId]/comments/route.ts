// api/roar/rooms/[roomId]/messages/[msgId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { notifyRoomMessageComment, notifyMentions } from "@/lib/notifications";
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
        ConsistentRead: true,
        Limit: limit
      }));

      comments = (res.Items ?? []).map(item => {
        const reactions = item.reactions && typeof item.reactions === "object" ? item.reactions : {};
        const reactionUids = Object.entries(reactions)
          .filter(([_, r]) => r === "heart" || r === "like" || r === true)
          .map(([uid]) => uid);
        const likedBy = Array.isArray(item.likedBy) && item.likedBy.length > 0
          ? Array.from(new Set([...item.likedBy, ...reactionUids]))
          : reactionUids;
        const heartCount = Math.max(
          Number(item.heartCount ?? item.likesCount ?? item.likes ?? 0),
          likedBy.length
        );
        const cid = String(item.commentId || (item.sk as string).split("#").pop() || item.id);
        return {
          ...item,
          id: cid,
          commentId: cid,
          likedBy,
          likes: heartCount,
          likesCount: heartCount,
          heartCount,
        };
      });
    } catch (dynErr) {
      console.warn("[RoomComments GET] DynamoDB notice:", dynErr);
    }

    // Always fetch Firestore to merge or fallback so all user reactions and likes are fully synced
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

      if (!snap.empty) {
        const fsComments = snap.docs.map(doc => {
          const data = doc.data();
          const reactions = data.reactions && typeof data.reactions === "object" ? data.reactions : {};
          const reactionUids = Object.entries(reactions)
            .filter(([_, r]) => r === "heart" || r === "like" || r === true)
            .map(([uid]) => uid);
          const likedBy = Array.isArray(data.likedBy) && data.likedBy.length > 0
            ? Array.from(new Set([...data.likedBy, ...reactionUids]))
            : reactionUids;
          const heartCount = Math.max(
            Number(data.heartCount ?? data.likesCount ?? data.likes ?? 0),
            likedBy.length
          );
          const cid = String(data.commentId || doc.id);
          return {
            ...data,
            id: cid,
            commentId: cid,
            likedBy,
            likes: heartCount,
            likesCount: heartCount,
            heartCount,
          };
        });

        if (comments.length === 0) {
          comments = fsComments;
        } else {
          // Merge Firestore confirmed reactions/likes with DynamoDB items
          const fsMap = new Map<string, any>(fsComments.map(c => [c.id, c]));
          comments = comments.map((dItem: any) => {
            const fsItem = fsMap.get(dItem.id);
            if (!fsItem) return dItem;
            const combinedLikedBy = Array.from(new Set([...(dItem.likedBy || []), ...(fsItem.likedBy || [])]));
            const maxCount = Math.max(dItem.heartCount || 0, fsItem.heartCount || 0, combinedLikedBy.length);
            return {
              ...dItem,
              ...fsItem,
              likedBy: combinedLikedBy,
              likes: maxCount,
              likesCount: maxCount,
              heartCount: maxCount,
            };
          });

          // Add any comments from Firestore that were not in DynamoDB
          const existingIds = new Set(comments.map(c => c.id));
          for (const fsItem of fsComments) {
            if (!existingIds.has(fsItem.id)) {
              comments.push(fsItem);
            }
          }
        }
      }
    } catch (fsErr) {
      console.warn("[RoomComments GET] Firestore notice:", fsErr);
    }

    comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ success: true, comments }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
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
    const parentId: string | null = body.parentId ? String(body.parentId).trim() : null;
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
          parentId,
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
        parentId,
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
    notifyRoomMessageComment(cleanRoomId, targetMsgId, resolvedAuthorId, user.email, username, text.slice(0, 80), {
      authorUid: msgItem.authorUid || msgItem.userId,
      authorEmail: msgItem.authorEmail || msgItem.email,
      text: msgItem.text || msgItem.content,
    }).catch((notifErr) => {
      console.warn("[RoomComments POST] Notification notice:", notifErr);
    });
    notifyMentions(text, cleanRoomId, targetMsgId, resolvedAuthorId, username).catch(() => { });

    return NextResponse.json({
      success: true,
      commentId,
      comment: { 
        id: commentId, 
        commentId, 
        parentId,
        text, 
        authorUid: resolvedAuthorId, 
        authorUsername: username, 
        authorAvatarUrl: avatarUrl, 
        authorBadge: badge, 
        roomId: cleanRoomId, 
        createdAt: now,
        likes: 0,
        likesCount: 0,
        heartCount: 0,
        likedBy: [],
        reactions: {}
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}