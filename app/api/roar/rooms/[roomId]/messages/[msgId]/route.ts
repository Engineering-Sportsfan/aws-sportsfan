// api/roar/rooms/[roomId]/messages/[msgId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { findRoomMessage } from "@/lib/roarRoomHelpers";
import { DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

    // 1. Delete from DynamoDB across candidates
    const roomCandidates = Array.from(new Set([roomIdKey, `ROOM#${cleanRoomId}`, cleanRoomId]));
    for (const rCand of roomCandidates) {
      try {
        if (msgSk) {
          await docClient.send(new DeleteCommand({
            TableName: TABLES.RealTimeChat,
            Key: {
              roomId: rCand,
              sk: msgSk,
            }
          }));
        }
      } catch (dynErr) {
        console.warn("[RoomMessage DELETE] DynamoDB delete notice:", dynErr);
      }
    }

    // 2. Best-effort Firestore cleanup
    const countField = COUNT_FIELD_BY_TYPE[msgItem.type] || "postCount";
    for (const collName of ["roarRooms", "watchAlongRooms"]) {
      try {
        const roomRef = db.collection(getFirestoreCollection(collName)).doc(cleanRoomId);
        const msgRef = roomRef.collection("messages").doc(targetMsgId);
        const msgSnap = await msgRef.get();
        if (msgSnap.exists) {
          await msgRef.delete();
          const roomSnap = await roomRef.get();
          if (roomSnap.exists) {
            const data = roomSnap.data() || {};
            const curFan = data.fanCount ?? 0;
            const curCount = data[countField] ?? 0;
            await roomRef.update({
              fanCount: Math.max(0, curFan - 1),
              ...(countField && { [countField]: Math.max(0, curCount - 1) }),
            });
          }
        }
      } catch (fsErr) {
        console.warn(`[RoomMessage DELETE] Firestore ${collName} delete notice:`, fsErr);
      }
    }

    // 3. Decrement typeCounts in ROOM#META
    const rawType = (msgItem?.type || "post").toLowerCase();
    const countKey =
      rawType === "debate" ? "debate" :
      rawType === "prediction" || rawType === "predictions_live" ? "prediction" :
      rawType === "trivia" || rawType === "quiz" ? "trivia" :
      rawType === "battle" ? "battle" : "post";

    try {
      const metaRes = await docClient.send(new GetCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: `ROOM#${cleanRoomId}`, sk: "ROOM#META" },
      }));
      if (metaRes.Item?.typeCounts) {
        const curCounts = metaRes.Item.typeCounts;
        const newCounts = {
          ...curCounts,
          [countKey]: Math.max(0, (curCounts[countKey] || 0) - 1),
        };
        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: `ROOM#${cleanRoomId}`, sk: "ROOM#META" },
          UpdateExpression: "SET typeCounts = :c",
          ExpressionAttributeValues: { ":c": newCounts },
        }));
      }
    } catch (metaErr) {
      console.warn("[RoomMessage DELETE] ROOM#META count update notice:", metaErr);
    }

    return NextResponse.json({ success: true, deletedMsgId: targetMsgId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}