// api/roar/rooms/[roomId]/messages/[msgId]/pin/route.ts
//
// Single toggle endpoint — one route instead of separate POST (pin) /
// DELETE (unpin) handlers. Body: { action: "pin" | "unpin" }.
//
// Pin state is a per-user doc, never a field on the message itself:
//
//   roarRooms/{roomId}/userPins/{userId}  →  { msgId, pinnedAt, text, authorUsername, type }
//
// One doc per user per room = exactly one pin per room (matches the single
// pinned banner UI). It is read back by the room's GET /presence response
// (see presence/route.ts), not by a dedicated GET here.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import type { RoomMessage } from "@/app/models/RoomMessage";

async function resolveUserId(email: string, userId: string): Promise<string | null> {
  const info = await getUserInfo(userId, undefined, email);
  return info.exists ? info.actualUserId : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action: "pin" | "unpin" = body.action === "unpin" ? "unpin" : "pin";

    const resolvedUserId = await resolveUserId(user.email, user.userId);
    if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const pinRef = db.collection("roarRooms").doc(roomId).collection("userPins").doc(resolvedUserId);

    if (action === "unpin") {
      await pinRef.delete();
      return NextResponse.json({ success: true, pin: null });
    }

    // action === "pin"
    const msgRef = db.collection("roarRooms").doc(roomId).collection("messages").doc(msgId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const data = msgSnap.data() as RoomMessage;
    const pinDoc = {
      msgId,
      pinnedAt: Date.now(),
      text: data.text ?? "",
      authorUsername: data.authorUsername ?? "Fan",
      type: data.type ?? "post",
    };
    await pinRef.set(pinDoc);

    return NextResponse.json({ success: true, pin: pinDoc });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST .../pin error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}