// app/api/watch-along/route.ts — Migrated to AWS DynamoDB (RealTimeChat & SportsData)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";
import { getUserSessionAndRole } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface WatchAlongRoom {
  id: string;
  liveMatchId?: string;
  isLive?: boolean;
  createdAt?: number;
  [key: string]: unknown;
}

interface LiveMatch {
  id: string;
  [key: string]: unknown;
}

/* ─────────────────────────────────────────────
   GET  /api/watch-along
   Returns all rooms with their related live match
   Query params:
     ?isLive=true        → filter live rooms only
     ?limit=20           → pagination limit
───────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isLiveFilter = searchParams.get("isLive");
    const includeInactive = searchParams.get("includeInactive") === "true";
    const limit = parseInt(searchParams.get("limit") || "20");

    let roomsData: WatchAlongRoom[] = [];

    // 1. Query DynamoDB RealTimeChat table for rooms
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "RealTimeChat",
          FilterExpression: "sk = :skMeta",
          ExpressionAttributeValues: {
            ":skMeta": "ROOM#META",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        let items = (scanRes.Items as any[]).filter(
          (item) => item.isWatchAlong === true || item.type === "watchalong" || (item.roomId && (item.roomId as string).startsWith("ROOM#watchalong_")) || item.liveMatchId
        );

        if (isLiveFilter === "true") {
          items = items.filter((item) => item.isLive === true || item.isLive === "true");
        }
        if (!includeInactive) {
          items = items.filter((item) => item.isActive !== false);
        }

        roomsData = items.map((item) => ({
          id: (item.roomId as string)?.replace(/^ROOM#/, "") || item.id,
          name: item.name,
          role: item.role,
          badge: item.badge,
          badgeColor: item.badgeColor,
          borderColor: item.borderColor,
          initials: item.initials,
          displayPicture: item.displayPicture,
          mediaFile: item.mediaFile,
          isActive: item.isActive !== false,
          isLive: Boolean(item.isLive),
          watching: item.watching,
          engagement: item.engagement,
          active: item.active,
          startTime: item.startTime,
          liveMatchId: item.liveMatchId,
          hostUserId: item.hostUserId,
          coHostUserId: item.coHostUserId,
          sport: item.sport,
          createdAt: Number(item.createdAt || Date.now()),
          updatedAt: Number(item.updatedAt || Date.now()),
        }));
      }
    } catch (dynErr) {
      console.warn("[watch-along GET] DynamoDB scan warning:", dynErr);
    }

    // 2. Fallback to Firestore if no rooms in DynamoDB
    if (roomsData.length === 0) {
      let query: FirebaseFirestore.Query = db.collection("watchAlongRooms");
      if (isLiveFilter === "true") {
        query = query.where("isLive", "==", true);
      }
      query = query.orderBy("createdAt", "desc").limit(limit);

      const snapshot = await query.get();
      roomsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WatchAlongRoom[];
      if (!includeInactive) {
        roomsData = roomsData.filter((room) => room.isActive !== false);
      }
    }

    // Sort by createdAt desc and slice to limit
    roomsData.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const paginatedRooms = roomsData.slice(0, limit);

    // Fetch related matches in parallel from DynamoDB / Firestore
    const liveMatchIds = paginatedRooms
      .map((room) => room.liveMatchId)
      .filter((id): id is string => Boolean(id));

    const matchesMap = new Map<string, LiveMatch>();
    if (liveMatchIds.length > 0) {
      await Promise.all(
        liveMatchIds.map(async (mId) => {
          try {
            const mGet = await docClient.send(
              new GetCommand({
                TableName: "SportsData",
                Key: { entityId: `MATCH#${mId}`, sk: "MATCH#META" },
              })
            );
            if (mGet.Item) {
              matchesMap.set(mId, { id: mId, ...mGet.Item });
              return;
            }
          } catch (e) {
            // fallback
          }

          try {
            const matchDoc = await db.collection("watchAlongMatches").doc(mId).get();
            if (matchDoc.exists) {
              matchesMap.set(mId, { id: matchDoc.id, ...matchDoc.data() } as LiveMatch);
            }
          } catch (e) {
            // ignore
          }
        })
      );
    }

    const rooms = paginatedRooms.map((room) => ({
      ...room,
      liveMatch: room.liveMatchId ? matchesMap.get(room.liveMatchId) || null : null,
    }));

    return NextResponse.json({
      success: true,
      rooms,
      pagination: {
        limit,
        hasMore: roomsData.length > limit,
      },
    });
  } catch (error) {
    console.error("[watch-along GET]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch rooms: " + (error as Error).message },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along
   Creates a new Watch Along room (expert card)
───────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin", "host"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const formData = await req.formData();

    const name = formData.get("name") as string;
    const role = formData.get("role") as string;
    const badge = formData.get("badge") as string;

    if (!name || !role || !badge) {
      return NextResponse.json(
        { success: false, message: "name, role, and badge are required" },
        { status: 400 }
      );
    }

    const badgeColor = (formData.get("badgeColor") as string) || "bg-pink-600";
    const borderColor = (formData.get("borderColor") as string) || "border-pink-500";
    const isLive = formData.get("isLive") === "true";
    const isActive = formData.get("isActive") !== "false";
    const watching = (formData.get("watching") as string) || "0";
    const engagement = (formData.get("engagement") as string) || "0%";
    const active = (formData.get("active") as string) || "0";
    const startTime = (formData.get("startTime") as string) || "";
    const liveMatchId = (formData.get("liveMatchId") as string) || null;
    const hostUserId = (formData.get("hostUserId") as string) || user.userId || null;
    const coHostUserId = (formData.get("coHostUserId") as string) || null;
    const sport = (formData.get("sport") as string) || "cricket";

    let displayPicture = "";
    const dpFile = formData.get("displayPicture") as File | null;
    if (dpFile && dpFile.size > 0) {
      const bytes = await dpFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${dpFile.type};base64,${buffer.toString("base64")}`;

      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "watchAlong/experts",
        public_id: `${Date.now()}-${dpFile.name.replace(/\s/g, "_")}`,
      });
      displayPicture = uploaded.secure_url;
    }

    let mediaFile = "";
    const uploadedFile = formData.get("mediaFile") as File | null;
    if (uploadedFile && uploadedFile.size > 0) {
      const bytes = await uploadedFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${uploadedFile.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;

      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "watchAlong/files",
        public_id: `${Date.now()}-${uploadedFile.name.replace(/\s/g, "_")}`,
        resource_type: "auto",
      });
      mediaFile = uploaded.secure_url;
    }

    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const roomId = uuidv4();
    let resolvedMatchId = liveMatchId;

    if (!resolvedMatchId) {
      const matchId = uuidv4();
      const matchData = {
        title: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await dualWrite({
        tableName: "SportsData",
        dynamoItem: {
          entityId: `MATCH#${matchId}`,
          sk: "MATCH#META",
          id: matchId,
          ...matchData,
        },
        firestoreRef: db.collection("watchAlongMatches").doc(matchId),
        firestoreData: matchData,
      });

      resolvedMatchId = matchId;
    }

    const now = Date.now();
    const roomData = {
      id: roomId,
      name,
      role,
      badge,
      badgeColor,
      borderColor,
      initials,
      displayPicture,
      mediaFile,
      isLive,
      isActive,
      watching,
      engagement,
      active,
      startTime,
      liveMatchId: resolvedMatchId,
      hostUserId: hostUserId || null,
      coHostUserId: coHostUserId || null,
      sport,
      isWatchAlong: true,
      type: "watchalong",
      createdAt: now,
      updatedAt: now,
    };

    // Primary write to DynamoDB RealTimeChat + dual-write to Firestore
    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ROOM#${roomId}`,
        sk: "ROOM#META",
        ...roomData,
        isActive: String(isActive),
      },
      firestoreRef: db.collection("watchAlongRooms").doc(roomId),
      firestoreData: roomData,
    });

    return NextResponse.json({
      success: true,
      room: { ...roomData, id: roomId },
    });
  } catch (error) {
    console.error("[watch-along POST]", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}
