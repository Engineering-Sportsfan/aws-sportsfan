// app/api/chats/[chatId]/messages/MessageId]/route.ts — BACKEND
// Legacy alias route for message edit and deletion (DynamoDB-First + Firestore Fallback)

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
// DELETE
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
    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 },
      );
    }

    let messageData: any = null;
    let dynamoItemKey: { roomId: string; sk: string } | null = null;

    if (chatId) {
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
    }

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

    if (!isSameUser(messageData.senderId, CURRENT_USER_ID)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const now = Date.now();
    const updatedMsg = {
      ...messageData,
      content: "This message was deleted.",
      deletedAt: now,
      deleted: true,
      updatedAt: now,
    };

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
        console.error("[MessageId DELETE] DynamoDB error:", dynErr);
      }
    }

    try {
      await db.collection("messages").doc(messageId).update({
        content: "This message was deleted.",
        deletedAt: now,
        deleted: true,
        updatedAt: now,
      });
    } catch (fsErr) {
      console.error("[MessageId DELETE] Firestore error:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/messages/[messageId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}