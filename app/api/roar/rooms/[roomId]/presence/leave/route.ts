// api/roar/rooms/[roomId]/presence/leave/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;
  return { id: info.actualUserId };
}

async function getRoomRef(roomId: string) {
  let roomRef = db.collection("roarRooms").doc(roomId);
  let snap = await roomRef.get();
  if (!snap.exists) {
    const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
    const fallbackSnap = await fallbackRef.get();
    if (fallbackSnap.exists) {
      roomRef = fallbackRef;
    }
  }
  return roomRef;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `PRESENCE#${resolved.id}` }
      }));
    } catch (dynErr) {
      console.warn("[PresenceLeave POST] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const roomRef = await getRoomRef(roomId);
      await roomRef
        .collection("presence")
        .doc(resolved.id)
        .delete();
    } catch (fsErr) {
      console.warn("[PresenceLeave POST] Firestore delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}