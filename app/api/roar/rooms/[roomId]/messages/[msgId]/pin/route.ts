// api/roar/rooms/[roomId]/messages/[msgId]/pin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { findRoomMessage } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

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

    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const pinRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("userPins").doc(resolvedUserId);

    if (action === "unpin") {
      // 1. Delete from DynamoDB
      try {
        await docClient.send(new DeleteCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: `ROOM#${cleanRoomId}`, sk: `PIN#${resolvedUserId}` }
        }));
      } catch (dynErr) {
        console.warn("[Pin POST] DynamoDB unpin notice:", dynErr);
      }

      // 2. Sync to Firestore
      try {
        await pinRef.delete();
      } catch (fsErr) {
        console.warn("[Pin POST] Firestore unpin notice:", fsErr);
      }

      return NextResponse.json({ success: true, pin: null });
    }

    // action === "pin"
    const found = await findRoomMessage(roomId, msgId);
    if (!found) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const data = found.msgItem || {};
    const targetMsgId = found.rawMsgId || msgId;

    const pinDoc = {
      msgId: targetMsgId,
      pinnedAt: Date.now(),
      text: data.text ?? "",
      authorUsername: data.authorUsername ?? "Fan",
      type: data.type ?? "post",
    };

    // 1. Put pin in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: {
          roomId: `ROOM#${cleanRoomId}`,
          sk: `PIN#${resolvedUserId}`,
          ...pinDoc,
        }
      }));
    } catch (dynErr) {
      console.warn("[Pin POST] DynamoDB pin notice:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await pinRef.set(pinDoc);
    } catch (fsErr) {
      console.warn("[Pin POST] Firestore pin notice:", fsErr);
    }

    return NextResponse.json({ success: true, pin: pinDoc });
  } catch (error: any) {
    console.error("POST /api/roar/rooms/[roomId]/messages/[msgId]/pin error:", error);
    return NextResponse.json({ error: error.message || "Failed to update pin" }, { status: 500 });
  }
}