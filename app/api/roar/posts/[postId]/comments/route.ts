// app/api/roar/posts/[postId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { notifyPostComment, notifyRoomMessageComment } from "@/lib/roarNotifyHelpers";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { postId } = resolvedParams;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const lastCreatedAt = searchParams.get("lastCreatedAt")
      ? parseInt(searchParams.get("lastCreatedAt")!)
      : null;

    let comments: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "COMMENT#" }
      }));
      if (res.Items && res.Items.length > 0) {
        comments = res.Items.map(item => ({
          id: item.commentId || (item.sk as string).replace(/^COMMENT#/, ""),
          commentId: item.commentId || (item.sk as string).replace(/^COMMENT#/, ""),
          ...item
        }));
        // Sort in memory by createdAt desc
        comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Comments GET] DynamoDB fetch failed, trying Firestore:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        let query = db
          .collection("roarPosts")
          .doc(postId)
          .collection("comments")
          .orderBy("createdAt", "desc")
          .limit(limit) as FirebaseFirestore.Query;

        if (lastCreatedAt) query = query.startAfter(lastCreatedAt);

        const snap = await query.get();
        comments = snap.docs.map((doc) => ({ id: doc.id, commentId: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[Comments GET] Firestore fallback failed:", fsErr);
      }
    } else {
      // Apply pagination manually for DynamoDB results
      if (lastCreatedAt) {
        comments = comments.filter(c => (c.createdAt || 0) < lastCreatedAt);
      }
      comments = comments.slice(0, limit);
    }

    // ── Batch-fetch live avatarUrl/badge per unique commenter ────────────────
    const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
    const uniqueAuthorUids = Array.from(
      new Set(comments.map((c) => c.authorUid).filter((uid): uid is string => !!uid))
    );

    await Promise.all(
      uniqueAuthorUids.map(async (uid) => {
        let avatarUrl: string | null = null;
        let badge: string | null = null;
        let fetchedAuthor = false;

        try {
          const userRes = await docClient.send(new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${uid}`, sk: "USER#META" }
          }));
          if (userRes.Item) {
            avatarUrl = userRes.Item.avatarUrl ?? null;
            badge = userRes.Item.badge ?? null;
            fetchedAuthor = true;
          }
        } catch (e) {}

        if (!fetchedAuthor) {
          try {
            const snap = await db.collection("users").doc(uid).get();
            if (snap.exists) {
              const data = snap.data() as any;
              avatarUrl = data?.avatarUrl ?? null;
              badge = data?.badge ?? null;
            }
          } catch (e) {}
        }

        authorMap.set(uid, { avatarUrl, badge });
      })
    );

    // Assemble comments with live author details
    const assembledComments = comments.map((c) => {
      const author = authorMap.get(c.authorUid);
      return {
        ...c,
        authorAvatarUrl: author?.avatarUrl ?? c.authorAvatarUrl ?? null,
        authorBadge: author?.badge ?? c.authorBadge ?? null,
      };
    });

    return NextResponse.json({ success: true, comments: assembledComments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const text: string = (body.text ?? "").trim();
    const roomId: string | undefined = body.roomId;
    const parentCommentId: string | undefined = body.parentCommentId;

    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const resolvedParams = await params;
    const { postId } = resolvedParams;

    // Resolve username from roarProfile, fall back to name or email prefix
    const username = await resolveUsername(user.userId, user.name, user.email);

    const now = Date.now();
    const isRoomMessage = !!roomId;

    const commentRef = isRoomMessage
      ? db.collection("roarRooms").doc(roomId).collection("messages").doc(postId).collection("comments").doc()
      : db.collection("roarPosts").doc(postId).collection("comments").doc();

    const commentId = commentRef.id;

    // 1. Write to DynamoDB First
    try {
      if (isRoomMessage) {
        // A. Put comment item
        await docClient.send(new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${roomId}`,
            sk: `COMMENT#${postId}#${commentId}`,
            commentId,
            text,
            authorUid: user.userId,
            authorEmail: user.email,
            authorUsername: username,
            createdAt: now,
            ...(parentCommentId ? { parentCommentId } : {})
          }
        }));

        // B. Increment replyCount on parent message
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${postId}` },
          UpdateExpression: "ADD replyCount :one",
          ExpressionAttributeValues: { ":one": 1 }
        })).catch((e) => console.warn("[Comments POST] Failed to update room message replyCount in DynamoDB:", e));

      } else {
        // A. Put comment item
        await docClient.send(new PutCommand({
          TableName: "SocialAndContent",
          Item: {
            contentId: `POST#${postId}`,
            sk: `COMMENT#${commentId}`,
            commentId,
            text,
            authorUid: user.userId,
            authorEmail: user.email,
            authorUsername: username,
            createdAt: now,
            ...(parentCommentId ? { parentCommentId } : {})
          }
        }));

        // B. Find parent post and increment replyCount
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
            UpdateExpression: "ADD replyCount :one",
            ExpressionAttributeValues: { ":one": 1 }
          })).catch((e) => console.warn("[Comments POST] Failed to update post replyCount in DynamoDB:", e));
        }
      }
    } catch (dynErr) {
      console.warn("[Comments POST] DynamoDB write failed, falling back to Firestore:", dynErr);
    }

    // 2. Sync/Fallback to Firestore
    try {
      await commentRef.set({
        commentId,
        text,
        authorUid: user.userId,
        authorEmail: user.email,
        authorUsername: username,
        createdAt: now,
        ...(roomId ? { roomId } : {}),
        ...(parentCommentId ? { parentCommentId } : {}),
      });

      // Increment replyCount on the correct parent doc
      const parentRef = isRoomMessage
        ? db.collection("roarRooms").doc(roomId).collection("messages").doc(postId)
        : db.collection("roarPosts").doc(postId);

      parentRef.update({ replyCount: FieldValue.increment(1) }).catch(() => {});
    } catch (fsErr) {
      console.warn("[Comments POST] Firestore write failed:", fsErr);
    }

    // Notify post author (non-blocking)
    if (roomId) {
      notifyRoomMessageComment(roomId, postId, user.userId, user.email, username, text.slice(0, 80)).catch(() => { });
    } else {
      notifyPostComment(postId, user.userId, user.email, username, text.slice(0, 80)).catch(() => { });
    }

    return NextResponse.json({
      success: true,
      commentId: commentId,
      comment: {
        id: commentId,
        commentId: commentId,
        text,
        authorUid: user.userId,
        authorUsername: username,
        parentCommentId: parentCommentId || null,
        roomId,
        createdAt: now,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[comments POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function resolveUsername(userId: string, name: string, email: string): Promise<string> {
  try {
    const userRes = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: { entityId: `USER#${userId}`, sk: "USER#META" }
    }));
    if (userRes.Item?.username) return userRes.Item.username;
  } catch {}

  try {
    const snap = await db.collection("roarProfiles").doc(userId).get();
    if (snap.exists) {
      const d = snap.data()!;
      if (d.username) return d.username as string;
    }
  } catch { /* ignore */ }
  return name || email.split("@")[0];
}
