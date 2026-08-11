// api/roar/rooms/[roomId]/channels/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { Channel } from "@/app/models/Channel";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let channels: Channel[] = [];
    let fetchedFromDynamo = false;

    // 1. Try fetching from DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": "CHANNEL#" }
      }));

      if (res.Items) {
        channels = res.Items
          .filter(item => item.isActive === true)
          .map(item => ({
            channelId: (item.sk as string).replace(/^CHANNEL#/, ""),
            roomId: item.roomId.replace(/^ROOM#/, ""),
            name: item.name,
            slug: item.slug,
            icon: item.icon ?? "",
            isActive: item.isActive,
            order: item.order ?? 0,
            createdAt: item.createdAt ?? 0
          }));
        // Sort in memory by order
        channels.sort((a, b) => a.order - b.order);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Channels GET] DynamoDB fetch failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await db
          .collection("roarRooms")
          .doc(roomId)
          .collection("channels")
          .where("isActive", "==", true)
          .orderBy("order", "asc")
          .get();

        channels = snapshot.docs.map((doc) => ({
          ...(doc.data() as Channel),
          channelId: doc.id,
        }));
      } catch (fsErr) {
        console.error("[Channels GET] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, channels });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Try reading room from DynamoDB first
    let roomExists = false;
    try {
      const candidates = [`ROOM#${roomId}`, roomId];
      for (const cand of candidates) {
        const roomRes = await docClient.send(new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: cand, sk: `META#${roomId}` }
        }));
        if (roomRes.Item) {
          roomExists = true;
          break;
        }
      }
    } catch (e) {}

    if (!roomExists) {
      try {
        const roomSnap = await db.collection("roarRooms").doc(roomId).get();
        if (roomSnap.exists) roomExists = true;
      } catch (e) {}
    }

    if (!roomExists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, slug, icon, order, isActive } = body;

    if (!name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }

    const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");

    // Check slug uniqueness in room from DynamoDB first
    let slugExists = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": "CHANNEL#" }
      }));
      if (res.Items) {
        slugExists = res.Items.some(item => item.slug === normalizedSlug);
      }
    } catch (e) {}

    if (!slugExists) {
      try {
        const channelsRef = db.collection("roarRooms").doc(roomId).collection("channels");
        const existing = await channelsRef.where("slug", "==", normalizedSlug).limit(1).get();
        if (!existing.empty) slugExists = true;
      } catch (e) {}
    }

    if (slugExists) {
      return NextResponse.json({ error: "A channel with this slug already exists" }, { status: 409 });
    }

    // Generate random doc ID like Firestore ref.doc()
    const channelId = `chan_${Math.random().toString(36).substring(2, 15)}`;
    const channel: Channel = {
      channelId,
      roomId,
      name: name.trim(),
      slug: normalizedSlug,
      icon: icon || "",
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: Number.isFinite(order) ? Number(order) : 0,
      createdAt: Date.now(),
    };

    const { roomId: _, ...channelFields } = channel;

    // 1. Put to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `CHANNEL#${channelId}`,
          ...channelFields
        }
      }));
    } catch (dynErr) {
      console.warn("[Channels POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const channelsRef = db.collection("roarRooms").doc(roomId).collection("channels");
      await channelsRef.doc(channelId).set(channel);
    } catch (fsErr) {
      console.warn("[Channels POST] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, channel });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}