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
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

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
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action: "pin" | "unpin" = body.action === "unpin" ? "unpin" : "pin";

    const resolvedUserId = await resolveUserId(user.email, user.userId);
    if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const pinRef = db.collection("roarRooms").doc(roomId).collection("userPins").doc(resolvedUserId);

    if (action === "unpin") {
      // 1. Delete from DynamoDB first
      try {
        await docClient.send(new DeleteCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `PIN#${resolvedUserId}` }
        }));
      } catch (dynErr) {
        console.warn("[Pin POST] DynamoDB unpin failed:", dynErr);
      }

      // 2. Sync to Firestore
      try {
        await pinRef.delete();
      } catch (fsErr) {
        console.warn("[Pin POST] Firestore unpin fallback failed:", fsErr);
      }

      return NextResponse.json({ success: true, pin: null });
    }

    // action === "pin"
    // Fetch message DynamoDB-first by querying chatId = msgId
    let msgData: any = null;
    let fetchedFromDynamo = false;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        FilterExpression: "chatId = :m",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `MSG#${roomId}#`,
          ":m": msgId
        },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        msgData = qRes.Items[0];
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Pin POST] DynamoDB message fetch failed:", dynErr);
    }

    const msgRef = db.collection("roarRooms").doc(roomId).collection("messages").doc(msgId);
    let msgExists = fetchedFromDynamo;
    let fallbackMsgData: any = null;

    if (!msgExists) {
      try {
        const snap = await msgRef.get();
        if (snap.exists) {
          msgExists = true;
          fallbackMsgData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[Pin POST] Firestore message fetch fallback failed:", fsErr);
      }
    }

    if (!msgExists) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const data = msgData || fallbackMsgData || {};
    const pinDoc = {
      msgId,
      pinnedAt: Date.now(),
      text: data.text ?? "",
      authorUsername: data.authorUsername ?? "Fan",
      type: data.type ?? "post",
    };

    // 1. Put pin in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `PIN#${resolvedUserId}`,
          ...pinDoc
        }
      }));
    } catch (dynErr) {
      console.warn("[Pin POST] DynamoDB pin failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await pinRef.set(pinDoc);
    } catch (fsErr) {
      console.warn("[Pin POST] Firestore pin fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true, pin: pinDoc });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST .../pin error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}