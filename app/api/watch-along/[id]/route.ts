// app/api/watch-along/[id]/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";
import { getUserSessionAndRole } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// ─────────────────────────────────────────────
// GET  /api/watch-along/[id]
// ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let roomData: any = null;

    // 1. Check DynamoDB RealTimeChat
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ROOM#${id}`,
            sk: "ROOM#META",
          },
        })
      );
      if (getRes.Item) {
        roomData = {
          id,
          ...getRes.Item,
        };
      }
    } catch (dynErr) {
      console.warn("[watch-along/[id] GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!roomData) {
      const doc = await db.collection("watchAlongRooms").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json(
          { success: false, message: "Room not found" },
          { status: 404 }
        );
      }
      roomData = { id: doc.id, ...doc.data() };
    }

    // Fetch related live match
    let liveMatch = null;
    if (roomData.liveMatchId) {
      try {
        const mGet = await docClient.send(
          new GetCommand({
            TableName: "SportsData",
            Key: { entityId: `MATCH#${roomData.liveMatchId}`, sk: "MATCH#META" },
          })
        );
        if (mGet.Item) {
          liveMatch = { id: roomData.liveMatchId, ...mGet.Item };
        }
      } catch (e) {
        // fallback
      }

      if (!liveMatch) {
        try {
          const matchDoc = await db
            .collection("watchAlongMatches")
            .doc(roomData.liveMatchId)
            .get();
          if (matchDoc.exists) {
            liveMatch = { id: matchDoc.id, ...matchDoc.data() };
          }
        } catch (e) {
          // ignore
        }
      }
    }

    return NextResponse.json({
      success: true,
      room: { ...roomData, liveMatch },
    });
  } catch (error) {
    console.error("[watch-along/[id] GET]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch room: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// PUT  /api/watch-along/[id]
// ─────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let existingData: any = null;

    // Check DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${id}`, sk: "ROOM#META" },
        })
      );
      if (getRes.Item) existingData = getRes.Item;
    } catch (e) {
      // fallback
    }

    if (!existingData) {
      const docRef = db.collection("watchAlongRooms").doc(id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return NextResponse.json(
          { success: false, message: "Room not found" },
          { status: 404 }
        );
      }
      existingData = existing.data();
    }

    const coHosts = existingData?.coHostUserId
      ? existingData.coHostUserId.split(",").map((cId: string) => cId.trim().toLowerCase())
      : [];
    const isCoHost = coHosts.some(
      (cId: string) =>
        cId === user.userId?.toLowerCase() ||
        cId === user.name?.toLowerCase() ||
        cId === user.email?.toLowerCase()
    );

    const isOwner = existingData?.hostUserId && (
      existingData.hostUserId.toLowerCase() === user.userId?.toLowerCase() ||
      existingData.hostUserId.toLowerCase() === user.name?.toLowerCase() ||
      existingData.hostUserId.toLowerCase() === user.email?.toLowerCase()
    );

    const authorizedRoles = ["super_admin", "admin", "host"];
    if (!authorizedRoles.includes(user.role) && !isOwner && !isCoHost) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    if (user.role === "host" && !isOwner && !isCoHost) {
      return NextResponse.json(
        { success: false, message: "Forbidden - You do not own this watchroom" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    const fields = ["name", "role", "badge", "badgeColor", "borderColor", "watching", "engagement", "active", "hostUserId", "coHostUserId", "sport"];
    for (const field of fields) {
      const val = formData.get(field);
      if (val !== null) {
        if ((field === "coHostUserId" || field === "hostUserId") && (val === "null" || val === "")) {
          updates[field] = null;
        } else {
          updates[field] = val as string;
        }
      }
    }

    const isLive = formData.get("isLive");
    if (isLive !== null) updates.isLive = isLive === "true";

    const liveMatchId = formData.get("liveMatchId");
    if (liveMatchId !== null) {
      if (liveMatchId && liveMatchId !== "null") {
        updates.liveMatchId = liveMatchId as string;
      } else {
        updates.liveMatchId = null;
      }
    }

    if (updates.name) {
      updates.initials = (updates.name as string)
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }

    const dpFile = formData.get("displayPicture") as File | null;
    if (dpFile && dpFile.size > 0) {
      const bytes = await dpFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${dpFile.type};base64,${buffer.toString("base64")}`;

      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "watchAlong/experts",
        public_id: `${Date.now()}-${dpFile.name.replace(/\s/g, "_")}`,
      });
      updates.displayPicture = uploaded.secure_url;
    }

    const finalData = {
      ...existingData,
      ...updates,
      id,
    };

    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ROOM#${id}`,
        sk: "ROOM#META",
        ...finalData,
      },
      firestoreRef: db.collection("watchAlongRooms").doc(id),
      firestoreData: updates,
    });

    return NextResponse.json({
      success: true,
      room: finalData,
    });
  } catch (error) {
    console.error("[watch-along/[id] PUT]", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// DELETE  /api/watch-along/[id]
// ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
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

    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let existingData: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${id}`, sk: "ROOM#META" },
        })
      );
      if (getRes.Item) existingData = getRes.Item;
    } catch (e) {
      // fallback
    }

    if (!existingData) {
      const docRef = db.collection("watchAlongRooms").doc(id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return NextResponse.json(
          { success: false, message: "Room not found" },
          { status: 404 }
        );
      }
      existingData = existing.data();
    }

    const isOwner = existingData?.hostUserId && (
      existingData.hostUserId.toLowerCase() === user.userId?.toLowerCase() ||
      existingData.hostUserId.toLowerCase() === user.name?.toLowerCase() ||
      existingData.hostUserId.toLowerCase() === user.email?.toLowerCase()
    );

    if (user.role === "host" && !isOwner) {
      return NextResponse.json(
        { success: false, message: "Forbidden - You do not own this watchroom" },
        { status: 403 }
      );
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ROOM#${id}`,
            sk: "ROOM#META",
          },
        })
      );
    } catch (dynErr) {
      console.warn("[watch-along/[id] DELETE] DynamoDB delete warning:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      const docRef = db.collection("watchAlongRooms").doc(id);
      const chatsSnap = await docRef.collection("chats").get();
      const batch = db.batch();
      chatsSnap.docs.forEach((chatDoc) => batch.delete(chatDoc.ref));
      await batch.commit();
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[watch-along/[id] DELETE] Firestore delete warning:", fsErr);
    }

    return NextResponse.json({ success: true, message: "Room deleted" });
  } catch (error) {
    console.error("[watch-along/[id] DELETE]", error);
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}