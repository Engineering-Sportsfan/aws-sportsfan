// api/roar/rooms/[roomId]/messages/[msgId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { findRoomMessage } from "@/lib/roarRoomHelpers";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { RoomMessage } from "@/app/models/RoomMessage";

export const dynamic = "force-dynamic";

// ── Room-level type counters ──
const COUNT_FIELD_BY_TYPE: Partial<Record<string, "postCount" | "debateCount" | "predictionCount" | "triviaCount" | "battleCount">> = {
  post: "postCount",
  chat: "postCount",
  debate: "debateCount",
  prediction: "predictionCount",
  trivia: "triviaCount",
  battle: "battleCount",
};

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> | { roomId: string; msgId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const found = await findRoomMessage(cleanRoomId, msgId);

    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;

    if (msgItem.authorUid !== user.userId && user.role !== "admin") {
      const RESTRICTED_USERS: string[] = [];
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Delete from DynamoDB
    if (fromDynamo && msgSk) {
      try {
        await docClient.send(new DeleteCommand({
          TableName: TABLES.RealTimeChat,
          Key: {
            roomId: roomIdKey,
            sk: msgSk,
          }
        }));
      } catch (dynErr) {
        console.warn("[RoomMessage DELETE] DynamoDB delete failed:", dynErr);
      }
    }

    // 2. Best-effort Firestore cleanup
    const roomRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId);
    const msgRef = roomRef.collection("messages").doc(targetMsgId);
    const countField = COUNT_FIELD_BY_TYPE[msgItem.type];
    const channelRef = msgItem.channelId ? roomRef.collection("channels").doc(msgItem.channelId) : null;

    try {
      await db.runTransaction(async (tx) => {
        const roomSnapTx = await tx.get(roomRef);
        const msgSnapTx = await tx.get(msgRef);
        if (!msgSnapTx.exists) return;

        const channelSnapTx = channelRef ? await tx.get(channelRef) : null;

        tx.delete(msgRef);

        const currentFanCount = (roomSnapTx.data() as any)?.fanCount ?? 0;
        tx.update(roomRef, { fanCount: Math.max(0, currentFanCount - 1) });

        if (countField) {
          const currentRoomCount = (roomSnapTx.data() as any)?.[countField] ?? 0;
          tx.update(roomRef, { [countField]: Math.max(0, currentRoomCount - 1) });
        }

        if (channelRef && channelSnapTx && countField) {
          const currentChannelCount = (channelSnapTx.data() as any)?.counts?.[countField] ?? 0;
          tx.update(channelRef, { [`counts.${countField}`]: Math.max(0, currentChannelCount - 1) });
        }
      });
    } catch (fsErr) {
      console.warn("[RoomMessage DELETE] Firestore delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}