// app/api/roar/rooms/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { ChatRoom } from "@/app/models/ChatRoom";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────────────
// GET  /api/roar/rooms
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    let rooms: ChatRoom[] = [];

    // 1. Try querying DynamoDB RealTimeChat table using isActive-order-index or prefix scan
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          IndexName: "isActive-order-index",
          KeyConditionExpression: "isActive = :act",
          ExpressionAttributeValues: { ":act": "true" },
          ScanIndexForward: false,
          Limit: limit,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        rooms = qRes.Items.map((item) => ({
          roomId: (item.roomId as string)?.replace(/^ROOM#/, "") || item.id,
          name: item.name as string,
          sport: (item.sport as string) || "general",
          createdAt: Number(item.createdAt || Date.now()),
          isActive: item.isActive === "true" || item.isActive === true,
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
        }));
      }
    } catch (dynErr) {
      console.warn("DynamoDB roar rooms query notice:", dynErr);
    }

    // 2. Fallback to Firebase
    if (rooms.length === 0) {
      try {
        const snapshot = await db
          .collection("roarRooms")
          .where("isActive", "==", true)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .select(
            "roomId",
            "name",
            "icon",
            "sport",
            "description",
            "createdAt",
            "isActive",
            "fanCount",
            "scheduledStartTime",
            "score",
            "scoreSubtitle",
            "watchAlongRoomId",
            "matchId",
            "botConfig",
            "isTestingRoom"
          )
          .get();

        rooms = snapshot.docs.map((doc) => ({
          ...(doc.data() as ChatRoom),
          roomId: doc.id,
        }));
      } catch (fbErr) {
        console.warn("Firebase roar rooms fallback notice:", fbErr);
      }
    }

    const lastRoom = rooms[rooms.length - 1];

    return NextResponse.json({
      success: true,
      rooms,
      pagination: {
        limit,
        hasMore: rooms.length === limit,
        nextCursor:
          rooms.length === limit
            ? { lastCreatedAt: lastRoom?.createdAt ?? null }
            : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
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

    const body = await req.json();
    const {
      name,
      icon,
      sport,
      description,
      isActive,
      scheduledStartTime,
      score,
      scoreSubtitle,
      createWatchAlong,
      matchId,
      privacy,
      isTestingRoom,
      botConfig,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    const VALID_PRIVACY = ["public", "private", "premium"];
    const normalizedPrivacy = VALID_PRIVACY.includes(privacy) ? privacy : "public";
    const now = Date.now();

    if (createWatchAlong === true) {
      try {
        const matchRef = await db.collection("watchAlongMatches").add({
          title: name.trim(),
          createdAt: now,
          updatedAt: now,
        });

        const initials = name
          .trim()
          .split(" ")
          .map((w: string) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        const watchAlongRoomData = {
          name: name.trim(),
          role: "Host",
          badge: "Live",
          badgeColor: "bg-pink-600",
          borderColor: "border-pink-500",
          initials,
          displayPicture: "",
          isLive: true,
          watching: "0",
          engagement: "0%",
          active: "0",
          liveMatchId: matchRef.id,
          hostUserId: user.email || user.userId || null,
          coHostUserId: null,
          createdAt: now,
          updatedAt: now,
        };

        const watchAlongRef = await db.collection("watchAlongRooms").add(watchAlongRoomData);
        return NextResponse.json({ success: true, watchAlongRoomId: watchAlongRef.id });
      } catch (err) {
        console.error("Failed to create Watchalong Room:", err);
        return NextResponse.json({ error: "Failed to create Watchalong Room" }, { status: 500 });
      }
    } else {
      const roomId = `room_${now}_${Math.random().toString(36).substring(2, 9)}`;

      const newRoom: ChatRoom & {
        matchId?: string;
        privacy?: string;
        isTestingRoom?: boolean;
        botConfig?: Record<string, unknown>;
      } = {
        roomId,
        name: name.trim(),
        sport: sport || "general",
        createdAt: now,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        privacy: normalizedPrivacy,
        fanCount: 0,
        createdByUid: user.userId,
        isTestingRoom: Boolean(isTestingRoom),
        ...(icon && { icon }),
        ...(description && { description: description.trim() }),
        ...(scheduledStartTime && { scheduledStartTime: Number(scheduledStartTime) }),
        ...(score && { score }),
        ...(scoreSubtitle && { scoreSubtitle }),
        ...(matchId && { matchId }),
        ...(botConfig && { botConfig }),
      };

      // ── Dual-Write to RealTimeChat in DynamoDB & roarRooms in Firebase ─────────
      const dynamoItem = {
        ...newRoom,
        roomId: `ROOM#${roomId}`,
        sk: `META#${roomId}`,
        isActive: newRoom.isActive ? "true" : "false",
        order: now,
      };

      await dualWrite("roarRooms", roomId, "RealTimeChat", dynamoItem);

      return NextResponse.json({ success: true, room: newRoom });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}