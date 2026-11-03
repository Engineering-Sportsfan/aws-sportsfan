// app/api/roar/rooms/[roomId]/messages/[msgId]/share/route.ts

import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { findRoomMessage } from "@/lib/roarRoomHelpers";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const found = await findRoomMessage(cleanRoomId, msgId);

    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;
    let newShareCount = Number(msgItem?.shareCount || 0) + 1;

    // Update in DynamoDB
    if (fromDynamo && msgSk) {
      try {
        const updateRes = await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: roomIdKey, sk: msgSk },
          UpdateExpression: "ADD shareCount :one",
          ExpressionAttributeValues: { ":one": 1 },
          ReturnValues: "ALL_NEW",
        }));
        if (updateRes.Attributes && typeof updateRes.Attributes.shareCount === "number") {
          newShareCount = updateRes.Attributes.shareCount;
        }
      } catch (dynErr) {
        console.warn("[RoomMessage Share] DynamoDB notice:", dynErr);
      }
    }

    // Update in Firestore
    try {
      const msgRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId);
      await msgRef.set({ shareCount: FieldValue.increment(1) }, { merge: true });
    } catch (fsErr) {
      console.warn("[RoomMessage Share] Firestore notice:", fsErr);
    }

    return NextResponse.json({
      success: true,
      shareCount: newShareCount,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("POST room message share error:", err);
    return NextResponse.json({ error: err.message || "Failed to record share" }, { status: 500 });
  }
}

