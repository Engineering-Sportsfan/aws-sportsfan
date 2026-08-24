// app/api/hostrooms/[id]/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import cloudinary from "@/lib/cloudinary";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

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

interface RoomData {
  userId: string;
  status: "draft" | "published";
  currentStep: number;
  event: {
    selectedEvent: {
      id: string;
      name: string;
    };
    roomType: "open" | "inner" | "moment" | "reflection";
  };
  details: {
    title: string;
    description: string;
    thumbnail: string | null;
    capacity: number;
    primaryLanguage: string;
    tags: string[];
    moderators: string[];
    schedule: string;
  };
  content: {
    assets: Array<{
      type: "video" | "image" | "slide";
      url: string;
      name: string;
      size?: number;
    }>;
    roomFile?: {
      url: string;
      name: string;
      size: number;
      type: string;
    } | null;
  };
  pricing: {
    pricePerFan: number;
    currency: string;
  };
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

interface UpdatePayload {
  updatedAt: number;
  event?: RoomData["event"];
  currentStep?: number;
  "event.roomType"?: string;
  details?: Partial<RoomData["details"]>;
  content?: RoomData["content"];
  pricing?: Partial<RoomData["pricing"]>;
  status?: string;
  publishedAt?: number;
}

async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return { userId: decodedToken.uid, email: decodedToken.email };
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// ─────────────────────────────────────────────
// PUT: Complete update
// ─────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const formData = await req.formData();
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    const { id: roomId } = await params;
    if (!roomId) {
      return NextResponse.json(
        { success: false, error: "roomId is required" },
        { status: 400 }
      );
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const capacity = parseInt(formData.get("capacity") as string);
    const primaryLanguage = formData.get("primaryLanguage") as string;
    const tags = JSON.parse(formData.get("tags") as string || "[]");
    const moderators = JSON.parse(formData.get("moderators") as string || "[]");
    const schedule = formData.get("schedule") as string;
    const roomType = formData.get("roomType") as string;
    const pricePerFan = parseInt(formData.get("pricePerFan") as string);
    const currency = formData.get("currency") as string || "INR";
    const status = formData.get("status") as string;

    const thumbnailFile = formData.get("thumbnail") as File | null;
    const roomFile = formData.get("roomFile") as File | null;
    const assetFiles = formData.getAll("assets") as File[];

    let existingData: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: "ROOM#META" },
        })
      );
      if (getRes.Item) existingData = getRes.Item;
    } catch (e) {
      // fallback
    }

    if (!existingData) {
      const docRef = db.collection("rooms").doc(roomId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return NextResponse.json(
          { success: false, error: "Room not found" },
          { status: 404 }
        );
      }
      existingData = doc.data();
    }

    let thumbnailUrl = existingData?.details?.thumbnail || "";
    if (thumbnailFile) {
      const bytes = await thumbnailFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${thumbnailFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "rooms/thumbnails",
        public_id: `${Date.now()}-${thumbnailFile.name.replace(/\s/g, "_")}`,
      });
      thumbnailUrl = uploadRes.secure_url;
    }

    let assets = existingData?.content?.assets || [];
    if (assetFiles.length > 0) {
      const newAssets: any[] = [];
      for (const assetFile of assetFiles) {
        const bytes = await assetFile.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${assetFile.type};base64,${buffer.toString("base64")}`;
        
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: "rooms/assets",
          resource_type: "auto",
          public_id: `${Date.now()}-${assetFile.name.replace(/\s/g, "_")}`,
        });
        
        newAssets.push({
          type: assetFile.type.startsWith("video/") ? "video" : "image",
          url: uploadRes.secure_url,
          name: assetFile.name,
          size: assetFile.size,
        });
      }
      assets = [...assets, ...newAssets];
    }

    const uploadedRoomFile = roomFile && roomFile.size > 0
      ? await uploadHostRoomFile(roomFile)
      : existingData?.content?.roomFile || null;

    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (title) updateData.details = { ...existingData?.details, title };
    if (description) updateData.details = { ...existingData?.details, description };
    if (capacity) updateData.details = { ...existingData?.details, capacity };
    if (primaryLanguage) updateData.details = { ...existingData?.details, primaryLanguage };
    if (tags.length) updateData.details = { ...existingData?.details, tags };
    if (moderators.length) updateData.details = { ...existingData?.details, moderators };
    if (schedule) updateData.details = { ...existingData?.details, schedule };
    if (thumbnailUrl) updateData.details = { ...existingData?.details, thumbnail: thumbnailUrl };
    if (roomType && existingData) {
      updateData.event = {
        ...existingData.event,
        roomType,
      };
    }
    if (pricePerFan) updateData.pricing = { ...existingData?.pricing, pricePerFan };
    if (currency) updateData.pricing = { ...existingData?.pricing, currency };
    if (assets.length || uploadedRoomFile) {
      updateData.content = {
        ...existingData?.content,
        assets,
        roomFile: uploadedRoomFile,
      };
    }
    
    if (status) {
      updateData.status = status;
      if (status === "published") {
        updateData.publishedAt = Date.now();
      }
    }

    const finalRoom = {
      ...existingData,
      ...updateData,
      id: roomId,
    };

    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ROOM#${roomId}`,
        sk: "ROOM#META",
        ...finalRoom,
      },
      firestoreRef: db.collection("rooms").doc(roomId),
      firestoreData: updateData,
    });

    return NextResponse.json({
      success: true,
      room: finalRoom,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms PUT]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PATCH: Partial update (step-by-step)
// ─────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const formData = await req.formData();
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    const { id: roomId } = await params;
    if (!roomId) {
      return NextResponse.json(
        { success: false, error: "roomId is required" },
        { status: 400 }
      );
    }

    const step = parseInt(formData.get("step") as string);
    const status = formData.get("status") as string;

    let existingData: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: "ROOM#META" },
        })
      );
      if (getRes.Item) existingData = getRes.Item;
    } catch (e) {
      // fallback
    }

    if (!existingData) {
      const docRef = db.collection("rooms").doc(roomId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return NextResponse.json(
          { success: false, error: "Room not found" },
          { status: 404 }
        );
      }
      existingData = doc.data();
    }

    const updatePayload: any = {
      updatedAt: Date.now(),
    };

    if (step && !isNaN(step)) {
      switch (step) {
        case 1: {
          const eventId = formData.get("eventId") as string;
          const eventName = formData.get("eventName") as string;
          const roomType = formData.get("roomType") as string;
          
          if (eventId && eventName && existingData) {
            updatePayload.event = {
              selectedEvent: { id: eventId, name: eventName },
              roomType: roomType || existingData.event?.roomType,
            };
          } else if (roomType) {
            updatePayload["event.roomType"] = roomType;
          }
          updatePayload.currentStep = 1;
          break;
        }
        
        case 2: {
          const title = formData.get("title") as string;
          const description = formData.get("description") as string;
          const capacity = parseInt(formData.get("capacity") as string);
          const primaryLanguage = formData.get("primaryLanguage") as string;
          const tags = JSON.parse(formData.get("tags") as string || "[]");
          const moderators = JSON.parse(formData.get("moderators") as string || "[]");
          const schedule = formData.get("schedule") as string;
          const thumbnailFile = formData.get("thumbnail") as File | null;
          
          let thumbnailUrl = existingData?.details?.thumbnail || "";
          if (thumbnailFile) {
            const bytes = await thumbnailFile.arrayBuffer();
            const buffer = Buffer.from(bytes);
            const base64 = `data:${thumbnailFile.type};base64,${buffer.toString("base64")}`;
            const uploadRes = await cloudinary.uploader.upload(base64, {
              folder: "rooms/thumbnails",
              public_id: `${Date.now()}-${thumbnailFile.name.replace(/\s/g, "_")}`,
            });
            thumbnailUrl = uploadRes.secure_url;
          }
          
          updatePayload.details = {
            ...existingData?.details,
            ...(title && { title }),
            ...(description && { description }),
            ...(capacity && { capacity }),
            ...(primaryLanguage && { primaryLanguage }),
            ...(tags.length && { tags }),
            ...(moderators.length && { moderators }),
            ...(schedule && { schedule }),
            ...(thumbnailUrl && { thumbnail: thumbnailUrl }),
          };
          updatePayload.currentStep = 2;
          break;
        }
        
        case 3: {
          const assetFiles = formData.getAll("assets") as File[];
          const removeAssets = JSON.parse(formData.get("removeAssets") as string || "[]");
          
          let assets = existingData?.content?.assets || [];
          if (removeAssets.length) {
            assets = assets.filter((asset: any) => !removeAssets.includes(asset.url));
          }
          
          if (assetFiles.length > 0) {
            const newAssets: any[] = [];
            for (const assetFile of assetFiles) {
              const bytes = await assetFile.arrayBuffer();
              const buffer = Buffer.from(bytes);
              const base64 = `data:${assetFile.type};base64,${buffer.toString("base64")}`;
              
              const uploadRes = await cloudinary.uploader.upload(base64, {
                folder: "rooms/assets",
                resource_type: "auto",
                public_id: `${Date.now()}-${assetFile.name.replace(/\s/g, "_")}`,
              });
              
              newAssets.push({
                type: assetFile.type.startsWith("video/") ? "video" : "image",
                url: uploadRes.secure_url,
                name: assetFile.name,
                size: assetFile.size,
              });
            }
            assets = [...assets, ...newAssets];
          }
          
          updatePayload.content = { assets };
          updatePayload.currentStep = 3;
          break;
        }
        
        case 4: {
          const pricePerFan = parseInt(formData.get("pricePerFan") as string);
          const currency = formData.get("currency") as string;
          
          updatePayload.pricing = {
            ...existingData?.pricing,
            ...(pricePerFan && { pricePerFan }),
            ...(currency && { currency }),
          };
          updatePayload.currentStep = 4;
          break;
        }
      }
    }

    const roomFile = formData.get("roomFile") as File | null;
    if (roomFile && roomFile.size > 0) {
      updatePayload.content = {
        ...existingData?.content,
        ...(updatePayload.content || {}),
        roomFile: await uploadHostRoomFile(roomFile),
      };
    }

    if (status) {
      updatePayload.status = status;
      if (status === "published") {
        updatePayload.publishedAt = Date.now();
      }
    }

    const finalRoom = {
      ...existingData,
      ...updatePayload,
      id: roomId,
    };

    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ROOM#${roomId}`,
        sk: "ROOM#META",
        ...finalRoom,
      },
      firestoreRef: db.collection("rooms").doc(roomId),
      firestoreData: updatePayload,
    });

    return NextResponse.json({
      success: true,
      room: finalRoom,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms PATCH]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE: Remove a room 
// ─────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: roomId } = await params;
    if (!roomId) {
      return NextResponse.json(
        { success: false, error: "roomId is required" },
        { status: 400 }
      );
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: "ROOM#META" },
        })
      );
    } catch (e) {
      console.warn("[rooms DELETE] DynamoDB notice:", e);
    }

    // 2. Delete from Firestore
    try {
      await db.collection("rooms").doc(roomId).delete();
    } catch (e) {
      console.warn("[rooms DELETE] Firestore notice:", e);
    }

    return NextResponse.json({
      success: true,
      message: "Room deleted successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms DELETE]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
