// api/roar/rooms/[roomId]/messages/[msgId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { docClient } from "@/lib/dynamodb";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

// export async function DELETE(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; msgId: string }> | { roomId: string; msgId: string } }
// ) {
//   try {
//     const resolvedParams = await params;
//     const { roomId, msgId } = resolvedParams;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const roomRef = db.collection("roarRooms").doc(roomId);
//     const msgRef = roomRef.collection("messages").doc(msgId);

//     const snap = await msgRef.get();
//     if (!snap.exists) {
//       return NextResponse.json({ error: "Message not found" }, { status: 404 });
//     }

//     const message = snap.data() as RoomMessage;
//     if (message.authorUid !== user.userId && user.role !== "admin") {
//       const RESTRICTED_USERS: string[] = [];
//       const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
//       if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//     }

//     // 1. Delete from DynamoDB first (Find the matching sk by querying with partition key and filtering by chatId)
//     try {
//       const qRes = await docClient.send(new QueryCommand({
//         TableName: "RealTimeChat",
//         KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
//         FilterExpression: "chatId = :m",
//         ExpressionAttributeValues: {
//           ":r": `ROOM#${roomId}`,
//           ":p": `MSG#${roomId}#`,
//           ":m": msgId
//         },
//         Limit: 1
//       }));
//       if (qRes.Items && qRes.Items.length > 0) {
//         const msgSk = qRes.Items[0].sk;
//         await docClient.send(new DeleteCommand({
//           TableName: "RealTimeChat",
//           Key: {
//             roomId: `ROOM#${roomId}`,
//             sk: msgSk
//           }
//         }));
//       }
//     } catch (dynErr) {
//       console.warn("[RoomMessage DELETE] DynamoDB delete failed:", dynErr);
//     }

//     // 2. Sync to Firestore
//     const countField = COUNT_FIELD_BY_TYPE[message.type];
//     const channelRef = message.channelId ? roomRef.collection("channels").doc(message.channelId) : null;

//     try {
//       await db.runTransaction(async (tx) => {
//         const roomSnapTx = await tx.get(roomRef);
//         const channelSnapTx = channelRef ? await tx.get(channelRef) : null;

//         tx.delete(msgRef);

//         const currentFanCount = (roomSnapTx.data() as any)?.fanCount ?? 0;
//         tx.update(roomRef, { fanCount: Math.max(0, currentFanCount - 1) });

//         if (countField) {
//           const currentRoomCount = (roomSnapTx.data() as any)?.[countField] ?? 0;
//           tx.update(roomRef, { [countField]: Math.max(0, currentRoomCount - 1) });
//         }

//         if (channelRef && channelSnapTx && countField) {
//           const currentChannelCount = (channelSnapTx.data() as any)?.counts?.[countField] ?? 0;
//           tx.update(channelRef, { [`counts.${countField}`]: Math.max(0, currentChannelCount - 1) });
//         }
//       });
//     } catch (fsErr) {
//       console.warn("[RoomMessage DELETE] Firestore delete failed:", fsErr);
//     }

//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> | { roomId: string; msgId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Messages live in DynamoDB now — find the row there, not Firestore.
    const qRes = await docClient.send(new QueryCommand({
      TableName: "RealTimeChat",
      KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
      ExpressionAttributeValues: {
        ":r": `ROOM#${roomId}`,
        ":p": `MSG#${roomId}#`,
      },
    }));
    const messageItem = qRes.Items?.find((item) => item.msgId === msgId);

    if (!messageItem) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (messageItem.authorUid !== user.userId && user.role !== "admin") {
      const RESTRICTED_USERS: string[] = [];
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(new DeleteCommand({
        TableName: "RealTimeChat",
        Key: {
          roomId: `ROOM#${roomId}`,
          sk: messageItem.sk,
        }
      }));
    } catch (dynErr) {
      console.warn("[RoomMessage DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Best-effort Firestore cleanup (legacy rooms may still have a
    // mirrored doc; if it doesn't exist this just no-ops).
    const roomRef = db.collection("roarRooms").doc(roomId);
    const msgRef = roomRef.collection("messages").doc(msgId);
    const countField = COUNT_FIELD_BY_TYPE[messageItem.type];
    const channelRef = messageItem.channelId ? roomRef.collection("channels").doc(messageItem.channelId) : null;

    try {
      await db.runTransaction(async (tx) => {
        const roomSnapTx = await tx.get(roomRef);
        const msgSnapTx = await tx.get(msgRef);
        if (!msgSnapTx.exists) return; // nothing to sync in Firestore

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