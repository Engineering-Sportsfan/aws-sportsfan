// api/roar/rooms/[roomId]/channels/[channelId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; channelId: string }> | { roomId: string; channelId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId, channelId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, icon, order, isActive } = body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (icon !== undefined) updates.icon = icon;
    if (order !== undefined) updates.order = Number(order);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    if (Object.keys(updates).length > 0) {
      // 1. Update in DynamoDB first
      try {
        let updateExpression = "SET";
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        Object.keys(updates).forEach((key, index) => {
          const valKey = `:val${index}`;
          const nameKey = `#name${index}`;
          updateExpression += ` ${nameKey} = ${valKey},`;
          expressionAttributeNames[nameKey] = key;
          expressionAttributeValues[valKey] = updates[key];
        });

        // Strip trailing comma
        updateExpression = updateExpression.slice(0, -1);

        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `CHANNEL#${channelId}` },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        }));
      } catch (dynErr) {
        console.warn("[Channel PATCH] DynamoDB update failed:", dynErr);
      }

      // 2. Sync to Firestore
      try {
        await db.collection("roarRooms").doc(roomId).collection("channels").doc(channelId).update(updates);
      } catch (fsErr) {
        console.warn("[Channel PATCH] Firestore fallback update failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; channelId: string }> | { roomId: string; channelId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId, channelId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hard = req.nextUrl.searchParams.get("hard") === "true";
    const channelRef = db.collection("roarRooms").doc(roomId).collection("channels").doc(channelId);

    // 1. Delete / Update in DynamoDB first
    try {
      if (hard) {
        await docClient.send(new DeleteCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `CHANNEL#${channelId}` }
        }));
      } else {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `CHANNEL#${channelId}` },
          UpdateExpression: "SET isActive = :false",
          ExpressionAttributeValues: { ":false": false }
        }));
      }
    } catch (dynErr) {
      console.warn("[Channel DELETE] DynamoDB action failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      if (hard) {
        await channelRef.delete();
      } else {
        await channelRef.update({ isActive: false });
      }
    } catch (fsErr) {
      console.warn("[Channel DELETE] Firestore fallback action failed:", fsErr);
    }

    return NextResponse.json({ success: true, hard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}