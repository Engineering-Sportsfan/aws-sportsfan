// app/api/chats/[chatId]/messages/[messageId]/route.ts — BACKEND
// Message edit and deletion (DynamoDB-First + Firestore Fallback)

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

function getIdsFromUrl(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const chatsIdx = parts.findIndex((p) => p === "chats");
  const messagesIdx = parts.findIndex((p) => p === "messages");
  const chatId = chatsIdx !== -1 ? parts[chatsIdx + 1] : "";
  const messageId = messagesIdx !== -1 ? parts[messagesIdx + 1] : "";
  return { chatId, messageId };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chats/[chatId]/messages/[messageId]
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
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

    const { chatId, messageId } = getIdsFromUrl(req);
    if (!chatId || !messageId) {
      return NextResponse.json(
        { error: "Chat ID and Message ID are required" },
        { status: 400 },
      );
    }

    // 1. Check if chat exists and user is participant
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
      !(chatData.participantIds as string[] || []).some((pid) =>
        isSameUser(pid, CURRENT_USER_ID),
      )
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 2. Get message doc
    let messageData: any = null;
    let dynamoItemKey: { roomId: string; sk: string } | null = null;

    try {
      const mRes = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :msg)",
          ExpressionAttributeValues: {
            ":r": `ROOM#${chatId}`,
            ":msg": "MSG#",
          },
        }),
      );
      if (mRes.Items && mRes.Items.length > 0) {
        const found = mRes.Items.find(
          (i) => i.id === messageId || (i.sk as string).endsWith(messageId),
        );
        if (found) {
          messageData = found;
          dynamoItemKey = { roomId: found.roomId, sk: found.sk };
        }
      }
    } catch {}

    if (!messageData) {
      const messageDoc = await db.collection("messages").doc(messageId).get();
      if (!messageDoc.exists) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 },
        );
      }
      messageData = { id: messageDoc.id, ...messageDoc.data() };
    }

    if (messageData.chatId !== chatId) {
      return NextResponse.json(
        { error: "Message does not belong to this chat" },
        { status: 400 },
      );
    }

    const forEveryone =
      new URL(req.url).searchParams.get("forEveryone") !== "false";
    const now = Date.now();

    if (forEveryone) {
      if (!isSameUser(messageData.senderId, CURRENT_USER_ID)) {
        return NextResponse.json(
          { error: "Unauthorized to delete this message for everyone" },
          { status: 403 },
        );
      }

      const updatedMsg = {
        ...messageData,
        content: "This message was deleted.",
        deletedAt: now,
        deleted: true,
        updatedAt: now,
      };

      // 1. Update DynamoDB
      if (dynamoItemKey) {
        try {
          await docClient.send(
            new PutCommand({
              TableName: "RealTimeChat",
              Item: {
                ...dynamoItemKey,
                ...updatedMsg,
              },
            }),
          );
        } catch (dynErr) {
          console.error("[message DELETE] DynamoDB error:", dynErr);
        }
      }

      // 2. Update Firestore
      try {
        await db.collection("messages").doc(messageId).update({
          content: "This message was deleted.",
          deletedAt: now,
          deleted: true,
          updatedAt: now,
        });
      } catch (fsErr) {
        console.error("[message DELETE] Firestore error:", fsErr);
      }
    } else {
      // Delete for Me
      const deletedForUsers = Array.isArray(messageData.deletedForUsers)
        ? Array.from(new Set([...messageData.deletedForUsers, CURRENT_USER_ID]))
        : [CURRENT_USER_ID];

      const updatedMsg = {
        ...messageData,
        deletedForUsers,
        updatedAt: now,
      };

      // 1. Update DynamoDB
      if (dynamoItemKey) {
        try {
          await docClient.send(
            new PutCommand({
              TableName: "RealTimeChat",
              Item: {
                ...dynamoItemKey,
                ...updatedMsg,
              },
            }),
          );
        } catch (dynErr) {
          console.error("[message DELETE forMe] DynamoDB error:", dynErr);
        }
      }

      // 2. Update Firestore
      try {
        await db.collection("messages").doc(messageId).update({
          deletedForUsers: FieldValue.arrayUnion(CURRENT_USER_ID),
          updatedAt: now,
        });
      } catch (fsErr) {
        console.error("[message DELETE forMe] Firestore error:", fsErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/chats/[id]/messages/[messageId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/chats/[chatId]/messages/[messageId]
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
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

    const { chatId, messageId } = getIdsFromUrl(req);
    if (!chatId || !messageId) {
      return NextResponse.json(
        { error: "Chat ID and Message ID are required" },
        { status: 400 },
      );
    }

    // 1. Check if chat exists and user is participant
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
      !(chatData.participantIds as string[] || []).some((pid) =>
        isSameUser(pid, CURRENT_USER_ID),
      )
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // 2. Get message doc
    let messageData: any = null;
    let dynamoItemKey: { roomId: string; sk: string } | null = null;

    try {
      const mRes = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :msg)",
          ExpressionAttributeValues: {
            ":r": `ROOM#${chatId}`,
            ":msg": "MSG#",
          },
        }),
      );
      if (mRes.Items && mRes.Items.length > 0) {
        const found = mRes.Items.find(
          (i) => i.id === messageId || (i.sk as string).endsWith(messageId),
        );
        if (found) {
          messageData = found;
          dynamoItemKey = { roomId: found.roomId, sk: found.sk };
        }
      }
    } catch {}

    if (!messageData) {
      const messageDoc = await db.collection("messages").doc(messageId).get();
      if (!messageDoc.exists) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 },
        );
      }
      messageData = { id: messageDoc.id, ...messageDoc.data() };
    }

    if (messageData.chatId !== chatId) {
      return NextResponse.json(
        { error: "Message does not belong to this chat" },
        { status: 400 },
      );
    }

    if (!isSameUser(messageData.senderId, CURRENT_USER_ID)) {
      return NextResponse.json(
        { error: "Unauthorized to edit this message" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { content } = body;
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }

    if (messageData.deletedAt || messageData.deleted) {
      return NextResponse.json(
        { error: "Cannot edit a deleted message" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const updatedMsg = {
      ...messageData,
      content: content.trim(),
      edited: true,
      updatedAt: now,
    };

    // 1. Update DynamoDB
    if (dynamoItemKey) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: "RealTimeChat",
            Item: {
              ...dynamoItemKey,
              ...updatedMsg,
            },
          }),
        );
      } catch (dynErr) {
        console.error("[message PATCH] DynamoDB error:", dynErr);
      }
    }

    // 2. Update Firestore
    try {
      await db.collection("messages").doc(messageId).update({
        content: content.trim(),
        edited: true,
        updatedAt: now,
      });
    } catch (fsErr) {
      console.error("[message PATCH] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: updatedMsg,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/chats/[id]/messages/[messageId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
