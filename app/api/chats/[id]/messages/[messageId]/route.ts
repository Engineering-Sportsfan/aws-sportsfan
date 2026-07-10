import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

const normalizeId = (id: string) => id.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string; userId?: string; uid?: string; id?: string;
        name?: string; role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return { userId: normalizeId(userId), email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
      }
    } catch {}
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string; userId?: string; uid?: string; id?: string;
        name?: string; role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return { userId: normalizeId(userId), email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
      }
    } catch {}
  }

  return null;
}

function getIdsFromUrl(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  // URL structure: /api/chats/[chatId]/messages/[messageId]
  const chatsIdx = parts.findIndex(p => p === "chats");
  const messagesIdx = parts.findIndex(p => p === "messages");
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const CURRENT_USER_ID = user.userId;
    const isSameUser = (id1: string, id2: string) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      if (!n1 || !n2) return false;
      return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
    };

    const { chatId, messageId } = getIdsFromUrl(req);
    if (!chatId || !messageId) {
      return NextResponse.json({ error: "Chat ID and Message ID are required" }, { status: 400 });
    }

    // Check if chat exists and user is participant
    const chatRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const chatData = chatDoc.data()!;
    if (!(chatData.participantIds as string[]).some(pid => isSameUser(pid, CURRENT_USER_ID))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get message doc
    const messageRef = db.collection("messages").doc(messageId);
    const messageDoc = await messageRef.get();
    if (!messageDoc.exists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const messageData = messageDoc.data()!;
    // Verify message belongs to this chat
    if (messageData.chatId !== chatId) {
      return NextResponse.json({ error: "Message does not belong to this chat" }, { status: 400 });
    }

    // Parse deletion type (default to forEveryone = true)
    const forEveryone = new URL(req.url).searchParams.get("forEveryone") !== "false";

    const now = Date.now();
    if (forEveryone) {
      // Check authorization: only message sender can delete message for everyone
      if (!isSameUser(messageData.senderId, CURRENT_USER_ID)) {
        return NextResponse.json({ error: "Unauthorized to delete this message for everyone" }, { status: 403 });
      }

      // Soft delete message
      await messageRef.update({
        content: "This message was deleted.",
        deletedAt: now,
        deleted: true,
        updatedAt: now,
      });
    } else {
      // Delete for Me: hide it from the current user only
      await messageRef.update({
        deletedForUsers: FieldValue.arrayUnion(CURRENT_USER_ID),
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true, message: "Message deleted successfully" });
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const CURRENT_USER_ID = user.userId;
    const isSameUser = (id1: string, id2: string) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      if (!n1 || !n2) return false;
      return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
    };

    const { chatId, messageId } = getIdsFromUrl(req);
    if (!chatId || !messageId) {
      return NextResponse.json({ error: "Chat ID and Message ID are required" }, { status: 400 });
    }

    // Check if chat exists and user is participant
    const chatRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const chatData = chatDoc.data()!;
    if (!(chatData.participantIds as string[]).some(pid => isSameUser(pid, CURRENT_USER_ID))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get message doc
    const messageRef = db.collection("messages").doc(messageId);
    const messageDoc = await messageRef.get();
    if (!messageDoc.exists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const messageData = messageDoc.data()!;
    // Verify message belongs to this chat
    if (messageData.chatId !== chatId) {
      return NextResponse.json({ error: "Message does not belong to this chat" }, { status: 400 });
    }

    // Check authorization: only message sender can edit message
    if (!isSameUser(messageData.senderId, CURRENT_USER_ID)) {
      return NextResponse.json({ error: "Unauthorized to edit this message" }, { status: 403 });
    }

    const body = await req.json();
    const { content } = body;
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // If message is already deleted, don't allow edit
    if (messageData.deletedAt || messageData.deleted) {
      return NextResponse.json({ error: "Cannot edit a deleted message" }, { status: 400 });
    }

    const now = Date.now();
    await messageRef.update({
      content: content.trim(),
      edited: true,
      updatedAt: now,
    });

    const updatedDoc = await messageRef.get();
    const updatedData = updatedDoc.data()!;

    return NextResponse.json({
      success: true,
      message: { id: messageId, ...updatedData },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/chats/[id]/messages/[messageId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
