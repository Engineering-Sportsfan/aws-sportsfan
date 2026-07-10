
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import cloudinary from "@/lib/cloudinary";

// ─── Types ──────────────────────────────────────────────────────────────
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

// ─── Helper: Get authenticated user ─────────────────────────────────────
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

// ─── PUT: Complete update ───────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const formData = await req.formData();

    // Auth
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

    // Get all form fields
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

    // Files
    const thumbnailFile = formData.get("thumbnail") as File | null;
    const assetFiles = formData.getAll("assets") as File[];

    const docRef = db.collection("rooms").doc(roomId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: "Room not found" },
        { status: 404 }
      );
    }

    const existingData = doc.data() as RoomData | undefined;

    // Verify ownership
    if (existingData?.userId !== user.userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - You don't own this room" },
        { status: 403 }
      );
    }

    // Upload new thumbnail if provided
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

    // Upload new assets if provided
    let assets = existingData?.content?.assets || [];
    if (assetFiles.length > 0) {
      const newAssets: RoomData["content"]["assets"] = [];
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
          type: (assetFile.type.startsWith("video/") ? "video" : "image") as "video" | "image",
          url: uploadRes.secure_url,
          name: assetFile.name,
          size: assetFile.size,
        });
      }
      assets = [...assets, ...newAssets];
    }

    // Prepare update data
    const updateData: Partial<RoomData> = {
      updatedAt: Date.now(),
    };

    if (title) updateData.details = { ...existingData?.details, title } as RoomData["details"];
    if (description) updateData.details = { ...existingData?.details, description } as RoomData["details"];
    if (capacity) updateData.details = { ...existingData?.details, capacity } as RoomData["details"];
    if (primaryLanguage) updateData.details = { ...existingData?.details, primaryLanguage } as RoomData["details"];
    if (tags.length) updateData.details = { ...existingData?.details, tags } as RoomData["details"];
    if (moderators.length) updateData.details = { ...existingData?.details, moderators } as RoomData["details"];
    if (schedule) updateData.details = { ...existingData?.details, schedule } as RoomData["details"];
    if (thumbnailUrl) updateData.details = { ...existingData?.details, thumbnail: thumbnailUrl } as RoomData["details"];
    if (roomType && existingData) {
      updateData.event = {
        ...existingData.event,
        roomType: roomType as RoomData["event"]["roomType"],
      };
    }
    if (pricePerFan) updateData.pricing = { ...existingData?.pricing, pricePerFan } as RoomData["pricing"];
    if (currency) updateData.pricing = { ...existingData?.pricing, currency } as RoomData["pricing"];
    if (assets.length) updateData.content = { assets };
    
    if (status) {
      updateData.status = status as "draft" | "published";
      if (status === "published") {
        updateData.publishedAt = Date.now();
      }
    }

    await docRef.update(updateData as unknown as Record<string, unknown>);

    const updatedDoc = await docRef.get();
    return NextResponse.json({
      success: true,
      room: { id: updatedDoc.id, ...updatedDoc.data() },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms PUT]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PATCH: Partial update (step-by-step) ──────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const formData = await req.formData();

    // Auth
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

    const docRef = db.collection("rooms").doc(roomId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: "Room not found" },
        { status: 404 }
      );
    }

    const existingData = doc.data() as RoomData | undefined;

    // Verify ownership
    if (existingData?.userId !== user.userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - You don't own this room" },
        { status: 403 }
      );
    }

    const updatePayload: UpdatePayload = {
      updatedAt: Date.now(),
    };

    // Handle step-based updates with file uploads
    if (step && !isNaN(step)) {
      switch (step) {
        case 1: {
          // Step 1: Event & Room Type
          const eventId = formData.get("eventId") as string;
          const eventName = formData.get("eventName") as string;
          const roomType = formData.get("roomType") as string;
          
          if (eventId && eventName && existingData) {
            updatePayload.event = {
              selectedEvent: { id: eventId, name: eventName },
              roomType: (roomType || existingData.event?.roomType) as RoomData["event"]["roomType"],
            };
          } else if (roomType) {
            updatePayload["event.roomType"] = roomType;
          }
          updatePayload.currentStep = 1;
          break;
        }
        
        case 2: {
          // Step 2: Details with thumbnail upload
          const title = formData.get("title") as string;
          const description = formData.get("description") as string;
          const capacity = parseInt(formData.get("capacity") as string);
          const primaryLanguage = formData.get("primaryLanguage") as string;
          const tags = JSON.parse(formData.get("tags") as string || "[]");
          const moderators = JSON.parse(formData.get("moderators") as string || "[]");
          const schedule = formData.get("schedule") as string;
          const thumbnailFile = formData.get("thumbnail") as File | null;
          
          // Upload thumbnail if provided
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
          // Step 3: Content assets
          const assetFiles = formData.getAll("assets") as File[];
          const removeAssets = JSON.parse(formData.get("removeAssets") as string || "[]");
          
          let assets = existingData?.content?.assets || [];
          
          // Remove specified assets
          if (removeAssets.length) {
            assets = assets.filter((asset) => !removeAssets.includes(asset.url));
          }
          
          // Upload new assets
          if (assetFiles.length > 0) {
            const newAssets: RoomData["content"]["assets"] = [];
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
                type: (assetFile.type.startsWith("video/") ? "video" : "image") as "video" | "image",
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
          // Step 4: Pricing
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

    // Update status (for publishing)
    if (status) {
      updatePayload.status = status;
      if (status === "published") {
        updatePayload.publishedAt = Date.now();
      }
    }

    await docRef.update(updatePayload as unknown as Record<string, unknown>);

    const updatedDoc = await docRef.get();
    return NextResponse.json({
      success: true,
      room: { id: updatedDoc.id, ...updatedDoc.data() },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[rooms PATCH]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}


// ─── DELETE: Remove a room 
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: roomId } = await params;

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: "roomId is required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("rooms").doc(roomId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, error: "Room not found" },
        { status: 404 }
      );
    }

    await docRef.delete();

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