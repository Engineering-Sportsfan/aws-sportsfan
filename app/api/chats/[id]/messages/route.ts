// app/api/chats/[chatId]/messages/route.ts — BACKEND
// Chat messages retrieval and sending (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const normalizeId = (id: string) =>
  id.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return {
          userId: normalizeId(userId),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {}
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return {
          userId: normalizeId(userId),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {}
  }

  return null;
}

function getChatIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 2];
}

const VALID_TYPES = ["text", "image", "video", "audio", "file"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chats/[chatId]/messages
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;
    const isSameUser = (id1: string, id2: string) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      if (!n1 || !n2) return false;
      return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
    };

    const chatId = getChatIdFromUrl(req);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    // 1. Verify chat exists and user is participant
    let chatData: any = null;
    try {
      const cRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${chatId}`, sk: "ROOM#META" },
        }),
      );
      if (cRes.Item) chatData = cRes.Item;
    } catch {}

    if (!chatData) {
      const chatDoc = await db.collection("chats").doc(chatId).get();
      if (!chatDoc.exists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      chatData = chatDoc.data()!;
    }

    if (
      !(chatData?.participantIds as string[] || []).some((pid) =>
        isSameUser(pid, CURRENT_USER_ID),
      )
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let messages: any[] = [];
    let fetchedFromDynamo = false;
    let lastDoc: any = null;

    // 2. Try DynamoDB First for messages
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :msg)",
          ExpressionAttributeValues: {
            ":r": `ROOM#${chatId}`,
            ":msg": "MSG#",
          },
          ScanIndexForward: false, // newest first
          Limit: limit,
        }),
      );

      if (qRes.Items && qRes.Items.length > 0) {
        let items: any[] = qRes.Items.map((item: any) => ({
          id: item.id || (item.sk as string).split("#")[2] || (item.sk as string).replace(/^MSG#/, ""),
          ...item,
        }));

        items = items.filter(
          (msg: any) => !msg.deletedForUsers?.includes(CURRENT_USER_ID),
        );

        messages = items.reverse(); // oldest first for UI
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[messages GET] DynamoDB notice:", dynErr);
    }

    // 3. Fallback to Firestore if not found in DynamoDB
    if (!fetchedFromDynamo) {
      let query = db
        .collection("messages")
        .where("chatId", "==", chatId)
        .orderBy("createdAt", "desc")
        .limit(limit);

      if (lastDocId && lastDocCreatedAt) {
        const lastRef = db.collection("messages").doc(lastDocId);
        const lastDocSnap = await lastRef.get();
        if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
      }

      const snapshot = await query.get();
      messages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
        .filter((msg) => !msg.deletedForUsers?.includes(CURRENT_USER_ID))
        .reverse();
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      const unreadDocs = snapshot.docs.filter(
        (doc) =>
          !doc.data().isRead &&
          !isSameUser(doc.data().senderId, CURRENT_USER_ID),
      );
      if (unreadDocs.length > 0) {
        const batch = db.batch();
        unreadDocs.forEach((doc) => batch.update(doc.ref, { isRead: true }));
        batch.update(db.collection("chats").doc(chatId), {
          [`unreadCount.${normalizeId(CURRENT_USER_ID)}`]: 0,
        });
        await batch.commit();
      }
    }

    const nextLastDoc =
      lastDoc ?? (messages.length > 0 ? messages[messages.length - 1] : null);

    return NextResponse.json({
      success: true,
      messages,
      pagination: {
        limit,
        hasMore: messages.length === limit,
        nextCursor:
          messages.length === limit
            ? {
                lastDocId: nextLastDoc?.id,
                lastDocCreatedAt:
                  nextLastDoc?.createdAt ?? nextLastDoc?.data?.()?.createdAt,
              }
            : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/chats/[chatId]/messages error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chats/[chatId]/messages
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;
    const isSameUser = (id1: string, id2: string) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      if (!n1 || !n2) return false;
      return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
    };

    const chatId = getChatIdFromUrl(req);
    const body = await req.json();
    const { content, type = "text", replyToId, mediaUrl } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    // 1. Verify chat exists & user is participant
    let chatData: any = null;
    try {
      const cRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${chatId}`, sk: "ROOM#META" },
        }),
      );
      if (cRes.Item) chatData = cRes.Item;
    } catch {}

    if (!chatData) {
      const chatDoc = await db.collection("chats").doc(chatId).get();
      if (!chatDoc.exists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      chatData = chatDoc.data()!;
    }

    if (
      !(chatData?.participantIds as string[] || []).some((pid) =>
        isSameUser(pid, CURRENT_USER_ID),
      )
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (replyToId) {
      let replyExists = false;
      try {
        const rRes = await docClient.send(
          new QueryCommand({
            TableName: "RealTimeChat",
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :msg)",
            ExpressionAttributeValues: {
              ":r": `ROOM#${chatId}`,
              ":msg": `MSG#`,
            },
          }),
        );
        if (
          rRes.Items &&
          rRes.Items.some(
            (item) => item.id === replyToId || (item.sk as string).endsWith(replyToId),
          )
        ) {
          replyExists = true;
        }
      } catch {}

      if (!replyExists) {
        const replyDoc = await db.collection("messages").doc(replyToId).get();
        if (!replyDoc.exists || replyDoc.data()?.chatId !== chatId) {
          return NextResponse.json(
            { error: "Replied-to message not found in this chat" },
            { status: 404 },
          );
        }
      }
    }

    const now = Date.now();
    const msgId = randomUUID();
    const newMessage: Record<string, unknown> = {
      id: msgId,
      chatId,
      senderId: CURRENT_USER_ID,
      type,
      content: content.trim(),
      isRead: false,
      createdAt: now,
      updatedAt: now,
    };
    if (replyToId) newMessage.replyToId = replyToId;
    if (mediaUrl) newMessage.mediaUrl = mediaUrl;

    const participantIds = (chatData?.participantIds as string[]) || [];
    const updatedUnread = { ...(chatData?.unreadCount || {}) };
    participantIds.forEach((pid) => {
      if (!isSameUser(pid, CURRENT_USER_ID)) {
        const normalizedPid = normalizeId(pid);
        updatedUnread[normalizedPid] = (updatedUnread[normalizedPid] || 0) + 1;
      }
    });

    const updateChatFields = {
      lastMessageContent: content.trim(),
      lastMessageAt: now,
      updatedAt: now,
      unreadCount: updatedUnread,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      // Put message
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${chatId}`,
            sk: `MSG#${now}#${msgId}`,
            ...newMessage,
          },
        }),
      );

      // Update room meta
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${chatId}`,
            sk: "ROOM#META",
            ...chatData,
            ...updateChatFields,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[messages POST] DynamoDB write error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection("messages").doc(msgId).set(newMessage);

      const firestoreUpdate: Record<string, any> = {
        lastMessageContent: content.trim(),
        lastMessageAt: now,
        updatedAt: now,
      };
      participantIds.forEach((pid) => {
        if (!isSameUser(pid, CURRENT_USER_ID)) {
          const normalizedPid = normalizeId(pid);
          firestoreUpdate[`unreadCount.${normalizedPid}`] =
            FieldValue.increment(1);
        }
      });
      await db.collection("chats").doc(chatId).update(firestoreUpdate);
    } catch (fsErr) {
      console.error("[messages POST] Firestore write error:", fsErr);
    }

    return NextResponse.json(
      {
        success: true,
        id: msgId,
        message: { id: msgId, ...newMessage },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/chats/[chatId]/messages error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
