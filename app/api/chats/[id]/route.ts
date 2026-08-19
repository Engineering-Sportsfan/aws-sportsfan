// app/api/chats/[id]/route.ts — BACKEND
// Single chat room details, updates and deletion (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
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

function getIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chats/[chatId]
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

    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "Chat ID is required" }, { status: 400 });
    }

    let data: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${id}`, sk: "ROOM#META" },
        }),
      );
      if (res.Item) {
        data = { id, ...res.Item };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[chats/[id] GET] DynamoDB notice:", dynErr);
    }

    // 2. Firestore Fallback
    if (!fetchedFromDynamo || !data) {
      const docRef = db.collection("chats").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      data = { id: docSnap.id, ...docSnap.data() };
    }

    const pids = (data.participantIds as string[] || []).map(normalizeId);
    if (!pids.some((pid) => isSameUser(pid, CURRENT_USER_ID))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let chatName = data.type === "dm" ? "" : data.name;
    let avatarUrl = data.avatarUrl || "";

    if (data.type === "dm" && Array.isArray(data.participantIds)) {
      const otherId = data.participantIds.find(
        (uid: string) => !isSameUser(uid, CURRENT_USER_ID),
      );
      if (otherId) {
        const normOtherId = normalizeId(otherId);

        // Try DynamoDB IdentityAndAccess
        try {
          const uRes = await docClient.send(
            new GetCommand({
              TableName: "IdentityAndAccess",
              Key: { entityId: `USER#${normOtherId}`, sk: "USER#META" },
            }),
          );
          if (uRes.Item) {
            const udata = uRes.Item;
            chatName =
              udata.name ||
              udata.username ||
              [udata.firstName, udata.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              chatName;
            avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
          }
        } catch {}

        if (!chatName) {
          let userDoc = await db
            .collection("users")
            .doc(normOtherId)
            .get();
          if (!userDoc.exists) {
            const querySnap = await db
              .collection("users")
              .where("userId", "==", normOtherId)
              .limit(1)
              .get();
            if (!querySnap.empty) {
              userDoc = querySnap.docs[0];
            }
          }

          if (userDoc && userDoc.exists) {
            const udata = userDoc.data()!;
            chatName =
              udata.name ||
              udata.username ||
              [udata.firstName, udata.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              chatName;
            avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      chat: { ...data, name: chatName, avatarUrl },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/chats/[chatId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/chats/[chatId]
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

    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "Chat ID is required" }, { status: 400 });
    }

    let data: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${id}`, sk: "ROOM#META" },
        }),
      );
      if (res.Item) {
        data = { id, ...res.Item };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[chats/[id] PATCH] DynamoDB notice:", dynErr);
    }

    if (!fetchedFromDynamo || !data) {
      const docRef = db.collection("chats").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      data = { id: docSnap.id, ...docSnap.data() };
    }

    if (
      !(data.participantIds as string[] || []).some((pid) =>
        isSameUser(pid, CURRENT_USER_ID),
      )
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();

    if (body.name !== undefined && data.type !== "group") {
      return NextResponse.json(
        { error: "Cannot rename a DM conversation" },
        { status: 400 },
      );
    }
    if (body.isMuted !== undefined && typeof body.isMuted !== "boolean") {
      return NextResponse.json(
        { error: "isMuted must be a boolean" },
        { status: 400 },
      );
    }
    if (body.isPinned !== undefined && typeof body.isPinned !== "boolean") {
      return NextResponse.json(
        { error: "isPinned must be a boolean" },
        { status: 400 },
      );
    }

    const allowedFields = ["name", "isMuted", "isPinned", "avatarUrl"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    allowedFields.forEach((field) => {
      if (body[field] !== undefined) updates[field] = body[field];
    });

    const updatedData = { ...data, ...updates };

    // 1. Update DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${id}`,
            sk: "ROOM#META",
            ...updatedData,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[chats/[id] PATCH] DynamoDB write error:", dynErr);
    }

    // 2. Update Firestore (Dual-Write)
    try {
      await db.collection("chats").doc(id).update(updates);
    } catch (fsErr) {
      console.error("[chats/[id] PATCH] Firestore write error:", fsErr);
    }

    let chatName = "";
    let avatarUrl = updatedData.avatarUrl || "";

    if (updatedData.type === "dm" && Array.isArray(updatedData.participantIds)) {
      const otherId = updatedData.participantIds.find(
        (uid: string) => !isSameUser(uid, CURRENT_USER_ID),
      );
      if (otherId) {
        const normOtherId = normalizeId(otherId);
        try {
          const uRes = await docClient.send(
            new GetCommand({
              TableName: "IdentityAndAccess",
              Key: { entityId: `USER#${normOtherId}`, sk: "USER#META" },
            }),
          );
          if (uRes.Item) {
            const udata = uRes.Item;
            chatName =
              udata.name ||
              [udata.firstName, udata.lastName].filter(Boolean).join(" ").trim() ||
              "";
            avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
          }
        } catch {}

        if (!chatName) {
          let userDoc = await db.collection("users").doc(normOtherId).get();
          if (!userDoc.exists) {
            const querySnap = await db
              .collection("users")
              .where("userId", "==", normOtherId)
              .limit(1)
              .get();
            if (!querySnap.empty) {
              userDoc = querySnap.docs[0];
            }
          }

          if (userDoc && userDoc.exists) {
            const udata = userDoc.data()!;
            chatName =
              udata.name ||
              [udata.firstName, udata.lastName].filter(Boolean).join(" ").trim() ||
              "";
            avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
          }
        }
      }
    } else {
      chatName = updatedData.name;
    }

    return NextResponse.json({
      success: true,
      chat: { ...updatedData, name: chatName, avatarUrl },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/chats/[chatId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chats/[chatId]
// DM / group owner → hard delete
// Group member     → removes self from participantIds (leave)
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

    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "Chat ID is required" }, { status: 400 });
    }

    let data: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${id}`, sk: "ROOM#META" },
        }),
      );
      if (res.Item) {
        data = { id, ...res.Item };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[chats/[id] DELETE] DynamoDB notice:", dynErr);
    }

    if (!fetchedFromDynamo || !data) {
      const docRef = db.collection("chats").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
      data = { id: docSnap.id, ...docSnap.data() };
    }

    if (
      !(data.participantIds as string[] || []).some((pid) =>
        isSameUser(pid, CURRENT_USER_ID),
      )
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (data.type === "dm" || isSameUser(data.createdBy, CURRENT_USER_ID)) {
      // 1. Delete from DynamoDB
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${id}`, sk: "ROOM#META" },
          }),
        );
      } catch (dynErr) {
        console.error("[chats/[id] DELETE] DynamoDB delete error:", dynErr);
      }

      // 2. Delete from Firestore
      try {
        await db.collection("chats").doc(id).delete();
      } catch (fsErr) {
        console.error("[chats/[id] DELETE] Firestore delete error:", fsErr);
      }

      return NextResponse.json({
        success: true,
        message: `Chat ${id} deleted successfully`,
      });
    }

    // Leaving group chat
    const updatedParticipants = (data.participantIds as string[]).filter(
      (uid) => !isSameUser(uid, CURRENT_USER_ID),
    );
    const updatedChat = {
      ...data,
      participantIds: updatedParticipants,
      updatedAt: Date.now(),
    };

    // 1. Update DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${id}`,
            sk: "ROOM#META",
            ...updatedChat,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[chats/[id] DELETE leave] DynamoDB update error:", dynErr);
    }

    // 2. Update Firestore
    try {
      await db.collection("chats").doc(id).update({
        participantIds: updatedParticipants,
        updatedAt: Date.now(),
      });
    } catch (fsErr) {
      console.error("[chats/[id] DELETE leave] Firestore update error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Left the group chat",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/chats/[chatId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}