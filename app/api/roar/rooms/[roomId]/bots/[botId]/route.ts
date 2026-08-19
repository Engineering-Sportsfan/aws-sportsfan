import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ roomId: string; botId: string }> }
) {
  try {
    const { roomId, botId } = await params;

    if (!roomId || !botId) {
      return NextResponse.json({ success: false, error: "Missing roomId or botId" }, { status: 400 });
    }

    // 1. Update in DynamoDB first
    try {
      const candidates = [`ROOM#${roomId}`, roomId];
      for (const cand of candidates) {
        const getRes = await docClient.send(new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: cand, sk: `META#${roomId}` }
        }));
        if (getRes.Item) {
          const data = getRes.Item;
          if (data.botConfig && data.botConfig[botId]) {
            const newConfig = { ...data.botConfig };
            delete newConfig[botId];

            await docClient.send(new UpdateCommand({
              TableName: "RealTimeChat",
              Key: { roomId: cand, sk: `META#${roomId}` },
              UpdateExpression: "SET botConfig = :b",
              ExpressionAttributeValues: { ":b": newConfig }
            }));
          }
        }
      }
    } catch (dynErr) {
      console.warn("[StopRoomBot DELETE] DynamoDB config update failed:", dynErr);
    }
    
    // 2. Sync to Firestore
    try {
      const roomRef = db.collection("roarRooms").doc(roomId);
      const roomSnap = await roomRef.get();
      if (roomSnap.exists) {
        const data = roomSnap.data();
        if (data?.botConfig && data.botConfig[botId]) {
          const newConfig = { ...data.botConfig };
          delete newConfig[botId];
          await roomRef.update({ botConfig: newConfig });
        }
      }
    } catch (fsErr) {
      console.warn("[StopRoomBot DELETE] Firestore config update fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true, message: `Bot ${botId} stopped in room ${roomId}` });
  } catch (error: any) {
    console.error("Error stopping room bot:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to stop room bot" },
      { status: 500 }
    );
  }
}
