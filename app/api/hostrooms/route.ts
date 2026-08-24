// app/api/hostrooms/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

async function uploadHostRoomFile(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;

  const uploadRes = await cloudinary.uploader.upload(base64, {
    folder: "hostrooms/files",
    resource_type: "auto",
    public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
  });

  return {
    url: uploadRes.secure_url,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (!roomId && !userId) {
      return NextResponse.json(
        { success: false, error: "Either roomId or userId is required" },
        { status: 400 }
      );
    }

    // Fetch single room by ID
    if (roomId) {
      let room: any = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: {
              roomId: `ROOM#${roomId}`,
              sk: "ROOM#META",
            },
          })
        );
        if (getRes.Item) {
          room = { id: roomId, ...getRes.Item };
        }
      } catch (e) {
        console.warn("[hostrooms GET] DynamoDB notice:", e);
      }

      if (!room) {
        const docRef = db.collection("rooms").doc(roomId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return NextResponse.json(
            { success: false, error: "Room not found" },
            { status: 404 }
          );
        }
        room = { id: doc.id, ...doc.data() };
      }

      return NextResponse.json({
        success: true,
        room,
      });
    }

    // Fetch all rooms for a user
    if (userId) {
      let rooms: any[] = [];
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "RealTimeChat",
            FilterExpression: "sk = :skMeta AND (userId = :uId OR hostUserId = :uId)",
            ExpressionAttributeValues: {
              ":skMeta": "ROOM#META",
              ":uId": userId,
            },
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          rooms = (scanRes.Items as any[]).map((item) => ({
            id: (item.roomId as string)?.replace(/^ROOM#/, "") || item.id,
            ...item,
          }));
        }
      } catch (e) {
        console.warn("[hostrooms user GET] DynamoDB notice:", e);
      }

      if (rooms.length === 0) {
        const snapshot = await db
          .collection("rooms")
          .where("userId", "==", userId)
          .orderBy("updatedAt", "desc")
          .get();

        rooms = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      }

      rooms.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

      return NextResponse.json({
        success: true,
        rooms,
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms GET]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST: Create new host room ───
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const authHeader = req.headers.get("authorization");
    let token: string | null = null;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const cookieToken = req.cookies.get("token")?.value;
      if (cookieToken) {
        token = cookieToken;
      }
    } else {
      token = authHeader.split("Bearer ")[1];
    }
    
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized - No token provided" }, { status: 401 });
    }

    let userEmail: string;
    let firebaseUid: string;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        email: string;
        uid?: string;
        id?: string;
      };
      userEmail = decoded.email;
      firebaseUid = decoded.uid || decoded.id || userEmail;
    } catch (err) {
      console.log("Token verification error:", err);
      return NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 });
    }

    const eventId = formData.get("eventId") as string;
    const eventName = formData.get("eventName") as string;
    const roomType = formData.get("roomType") as string;

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const capacity = parseInt(formData.get("capacity") as string);
    const primaryLanguage = formData.get("primaryLanguage") as string;
    const tags = JSON.parse(formData.get("tags") as string || "[]");
    const moderators = JSON.parse(formData.get("moderators") as string || "[]");
    const schedule = formData.get("schedule") as string;
    
    const thumbnailFile = formData.get("thumbnail") as File | null;
    const roomFile = formData.get("roomFile") as File | null;
    const assetFiles = formData.getAll("assets") as File[];
    const pricePerFan = parseInt(formData.get("pricePerFan") as string);
    const currency = formData.get("currency") as string || "INR";

    if (!eventId || !eventName || !roomType || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    let thumbnailUrl = "";
    if (thumbnailFile) {
      const bytes = await thumbnailFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${thumbnailFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "hostrooms/thumbnails",
        public_id: `${Date.now()}-${thumbnailFile.name.replace(/\s/g, "_")}`,
      });
      thumbnailUrl = uploadRes.secure_url;
    }

    const assets = [];
    for (const assetFile of assetFiles) {
      const bytes = await assetFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${assetFile.type};base64,${buffer.toString("base64")}`;
      
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "rooms/assets",
        resource_type: "auto",
        public_id: `${Date.now()}-${assetFile.name.replace(/\s/g, "_")}`,
      });
      
      assets.push({
        type: assetFile.type.startsWith("video/") ? "video" : "image",
        url: uploadRes.secure_url,
        name: assetFile.name,
        size: assetFile.size,
      });
    }

    const uploadedRoomFile = roomFile && roomFile.size > 0
      ? await uploadHostRoomFile(roomFile)
      : null;

    const roomId = uuidv4();
    const now = Date.now();
    const newRoom = {
      id: roomId,
      userId: userEmail,
      firebaseUid: firebaseUid,
      status: "published",
      currentStep: 4,
      isHostRoom: true,
      event: {
        selectedEvent: { id: eventId, name: eventName },
        roomType: roomType,
      },
      details: {
        title,
        description: description || "",
        thumbnail: thumbnailUrl,
        capacity: capacity || 0,
        primaryLanguage: primaryLanguage || "",
        tags,
        moderators,
        schedule: schedule || "",
      },
      content: {
        assets,
        roomFile: uploadedRoomFile,
      },
      pricing: {
        pricePerFan: pricePerFan || 0,
        currency,
      },
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };

    // Primary DynamoDB write + Firestore dual-write
    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ROOM#${roomId}`,
        sk: "ROOM#META",
        ...newRoom,
      },
      firestoreRef: db.collection("rooms").doc(roomId),
      firestoreData: newRoom,
    });

    return NextResponse.json({
      success: true,
      roomId,
      room: newRoom,
    }, { status: 201 });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms POST] Full error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
