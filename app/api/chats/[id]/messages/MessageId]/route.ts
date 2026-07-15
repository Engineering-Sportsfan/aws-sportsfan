import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";


export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const messageId = getMessageId(req);

    const messageRef = db.collection("messages").doc(messageId);

    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const messageData = messageDoc.data();

    // Only sender can delete
    if (messageData?.senderId !== user.userId) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    await messageRef.update({
      content: "This message was deleted.",
      deletedAt: Date.now(),
      deleted: true,
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unexpected error";

    console.error("DELETE /api/messages/[messageId] error:", error);

    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}


// ─── Auth helper ─────────────────────────────────────────────────────────────
async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;

  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
      };

      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;

      if (userId) {
        return { userId };
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
      };

      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;

      if (userId) {
        return { userId };
      }
    } catch {}
  }

  return null;
}

function getMessageId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/messages/[messageId]
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const messageId = getMessageId(req);

    const body = await req.json();

    const { content } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const messageRef = db.collection("messages").doc(messageId);

    const messageDoc = await messageRef.get();

    if (!messageDoc.exists) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const messageData = messageDoc.data();

    // Only sender can edit
    if (messageData?.senderId !== user.userId) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Prevent editing deleted messages
    if (messageData?.deletedAt) {
      return NextResponse.json(
        { error: "Cannot edit deleted message" },
        { status: 400 }
      );
    }

    const updateData = {
      content: content.trim(),
      updatedAt: Date.now(),
      edited: true,
    };

    await messageRef.update(updateData);

    const updatedDoc = await messageRef.get();

    return NextResponse.json({
      success: true,
      message: {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unexpected error";

    console.error("PATCH /api/messages/[messageId] error:", error);

    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}