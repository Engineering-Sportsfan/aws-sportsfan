// app/api/roar/rooms/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table) with Firestore dual-write
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ChatRoom } from "@/app/models/ChatRoom";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

export async function getRoomName(roomId: string): Promise<string> {
  try {
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const res = await docClient.send(
      new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${cleanRoomId}`, sk: `META#${cleanRoomId}` },
      })
    );
    return (res.Item?.name as string) || cleanRoomId;
  } catch (e) {
    console.warn("[rooms] getRoomName notice:", e);
    return roomId.replace(/^ROOM#/, "");
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET  /api/roar/rooms
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const allItems: any[] = [];
    const activeStatesToQuery = includeInactive ? ["true", "false"] : ["true"];

    try {
      for (const act of activeStatesToQuery) {
        let lastEvaluatedKey: Record<string, any> | undefined = undefined;
        let pages = 0;
        const MAX_PAGES = 3;

        do {
          const qRes: any = await docClient.send(
            new QueryCommand({
              TableName: "RealTimeChat",
              IndexName: "isActive-order-index",
              KeyConditionExpression: "isActive = :act",
              FilterExpression: "begins_with(sk, :p)",
              ExpressionAttributeValues: { ":act": act, ":p": "META#" },
              ScanIndexForward: false,
              Limit: 100,
              ExclusiveStartKey: lastEvaluatedKey,
            })
          );

          if (qRes.Items?.length) {
            allItems.push(...qRes.Items);
          }

          lastEvaluatedKey = qRes.LastEvaluatedKey;
          pages++;
        } while (lastEvaluatedKey && pages < MAX_PAGES);
      }
    } catch (dynErr) {
      console.warn("DynamoDB roar rooms query notice:", dynErr);
    }

    // Map and deduplicate rooms by clean roomId
    const roomMap = new Map<string, ChatRoom>();
    for (const item of allItems) {
      const cleanId = (item.roomId as string)?.replace(/^ROOM#/, "") || item.id;
      if (!cleanId) continue;
      const isActiveBool = item.isActive === "true" || item.isActive === true;
      if (!includeInactive && !isActiveBool) continue;

      if (!roomMap.has(cleanId)) {
        roomMap.set(cleanId, {
          roomId: cleanId,
          name: (item.name as string) || "Unnamed Room",
          sport: (item.sport as string) || "general",
          createdAt: Number(item.createdAt || item.order || Date.now()),
          isActive: isActiveBool,
          fanCount: Number(item.fanCount || 0),
          icon: item.icon as string | undefined,
          description: item.description as string | undefined,
          scheduledStartTime: item.scheduledStartTime as number | undefined,
          score: item.score as string | undefined,
          scoreSubtitle: item.scoreSubtitle as string | undefined,
          watchAlongRoomId: item.watchAlongRoomId as string | undefined,
          matchId: item.matchId as string | undefined,
          botConfig: item.botConfig as any,
          isTestingRoom: Boolean(item.isTestingRoom),
          image: item.image as string | undefined,
        });
      }
    }

    // Firestore fallback if DynamoDB had no rooms
    if (roomMap.size === 0) {
      try {
        let query = db.collection("roarRooms").orderBy("createdAt", "desc").limit(limit);
        if (!includeInactive) {
          query = db.collection("roarRooms").where("isActive", "==", true).orderBy("createdAt", "desc").limit(limit);
        }
        const snapshot = await query.get();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          roomMap.set(doc.id, {
            ...(data as ChatRoom),
            roomId: doc.id,
            isActive: data.isActive !== false && data.isActive !== "false",
            createdAt: Number(data.createdAt || Date.now()),
            fanCount: Number(data.fanCount || 0),
          });
        }
      } catch (fsErr) {
        console.warn("Firestore fallback notice for roar rooms:", fsErr);
      }
    }

    let rooms = Array.from(roomMap.values());
    rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    rooms = rooms.slice(0, limit);

    return NextResponse.json(
      {
        success: true,
        rooms,
        pagination: {
          limit,
          hasMore: rooms.length === limit,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST  /api/roar/rooms
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let name = "";
    let icon: string | null = null;
    let sport = "cricket";
    let description: string | null = null;
    let isActive = true;
    let scheduledStartTime: string | null = null;
    let score: string | null = null;
    let scoreSubtitle: string | null = null;
    let matchId: string | null = null;
    let isTestingRoom = false;
    let botConfig: any = undefined;
    let image = "";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      name = (formData.get("name") as string) || "";
      icon = formData.get("icon") as string | null;
      sport = (formData.get("sport") as string) || "cricket";
      description = formData.get("description") as string | null;
      const actVal = formData.get("isActive");
      isActive = actVal !== "false" && actVal !== "0";
      scheduledStartTime = formData.get("scheduledStartTime") as string | null;
      score = formData.get("score") as string | null;
      scoreSubtitle = formData.get("scoreSubtitle") as string | null;
      matchId = formData.get("matchId") as string | null;
      isTestingRoom = formData.get("isTestingRoom") === "true";
      const botConfigRaw = formData.get("botConfig") as string | null;
      if (botConfigRaw) {
        try {
          botConfig = JSON.parse(botConfigRaw);
        } catch {}
      }

      const imageFile = formData.get("image") as File | null;
      if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
        const bytes = await imageFile.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${imageFile.type};base64,${buffer.toString("base64")}`;
        const uploaded = await cloudinary.uploader.upload(base64, {
          folder: "roar/rooms",
          public_id: `${Date.now()}-${imageFile.name.replace(/\s/g, "_")}`,
        });
        image = uploaded.secure_url;
      }
    } else {
      const body = await req.json();
      name = body.name || "";
      icon = body.icon || null;
      sport = body.sport || "cricket";
      description = body.description || null;
      isActive = body.isActive !== false && body.isActive !== "false";
      scheduledStartTime = body.scheduledStartTime ? String(body.scheduledStartTime) : null;
      score = body.score || null;
      scoreSubtitle = body.scoreSubtitle || null;
      matchId = body.matchId || null;
      isTestingRoom = Boolean(body.isTestingRoom);
      botConfig = body.botConfig;
      image = body.image || "";
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    const now = Date.now();
    const roomId = `room_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newRoom: ChatRoom & Record<string, unknown> = {
      roomId,
      name: name.trim(),
      sport,
      createdAt: now,
      isActive,
      privacy: "public",
      fanCount: 0,
      createdByUid: user.userId,
      isTestingRoom,
      ...(icon && { icon }),
      ...(description && { description: description.trim() }),
      ...(scheduledStartTime && { scheduledStartTime: Number(scheduledStartTime) }),
      ...(score && { score: score.trim() }),
      ...(scoreSubtitle && { scoreSubtitle: scoreSubtitle.trim() }),
      ...(matchId && { matchId }),
      ...(botConfig && { botConfig }),
      ...(image && { image }),
    };

    const dynamoItem = {
      ...newRoom,
      roomId: `ROOM#${roomId}`,
      sk: `META#${roomId}`,
      isActive: newRoom.isActive ? "true" : "false",
      order: now,
    };

    // 1. Write to DynamoDB
    await docClient.send(new PutCommand({ TableName: "RealTimeChat", Item: dynamoItem }));

    // 2. Dual-write to Firestore
    try {
      await db.collection("roarRooms").doc(roomId).set(newRoom);
    } catch (fbErr) {
      console.warn("Firestore roarRooms dual-write notice:", fbErr);
    }

    return NextResponse.json({ success: true, roomId, room: newRoom });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}