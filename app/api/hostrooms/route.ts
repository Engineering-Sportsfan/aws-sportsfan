import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
// import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";


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
      const docRef = db.collection("rooms").doc(roomId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return NextResponse.json(
          { success: false, error: "Room not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        room: { id: doc.id, ...doc.data() },
      });
    }

    // Fetch all rooms for a user
    if (userId) {
      const snapshot = await db
        .collection("rooms")
        .where("userId", "==", userId)
        .orderBy("updatedAt", "desc")
        .get();

      const rooms = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

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

// // ─── POST: Create new room (draft) 
// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();

//     // Auth
//     const authHeader = req.headers.get("authorization");
//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return NextResponse.json(
//         { success: false, error: "Unauthorized" },
//         { status: 401 }
//       );
//     }

//     const token = authHeader.split("Bearer ")[1];
//     const decodedToken = await getAuth().verifyIdToken(token);
//     const userId = decodedToken.uid;

//     // Step 1: Event & Room Type
//     const eventId = formData.get("eventId") as string;
//     const eventName = formData.get("eventName") as string;
//     const roomType = formData.get("roomType") as string;

//     // Step 2: Details
//     const title = formData.get("title") as string;
//     const description = formData.get("description") as string;
//     const capacity = parseInt(formData.get("capacity") as string);
//     const primaryLanguage = formData.get("primaryLanguage") as string;
//     const tags = JSON.parse(formData.get("tags") as string || "[]");
//     const moderators = JSON.parse(formData.get("moderators") as string || "[]");
//     const schedule = formData.get("schedule") as string;
    
//     // Step 2: Thumbnail
//     const thumbnailFile = formData.get("thumbnail") as File | null;

//     // Step 3: Content Assets (multiple files)
//     const assetFiles = formData.getAll("assets") as File[];

//     // Step 4: Pricing
//     const pricePerFan = parseInt(formData.get("pricePerFan") as string);
//     const currency = formData.get("currency") as string || "INR";

//     // Validation
//     if (!eventId || !eventName || !roomType || !title) {
//       return NextResponse.json(
//         { success: false, error: "Missing required fields" },
//         { status: 400 }
//       );
//     }

//     // Upload thumbnail to Cloudinary
//     let thumbnailUrl = "";
//     if (thumbnailFile) {
//       const bytes = await thumbnailFile.arrayBuffer();
//       const buffer = Buffer.from(bytes);
//       const base64 = `data:${thumbnailFile.type};base64,${buffer.toString("base64")}`;
//       const uploadRes = await cloudinary.uploader.upload(base64, {
//         folder: "hostrooms/thumbnails",
//         public_id: `${Date.now()}-${thumbnailFile.name.replace(/\s/g, "_")}`,
//       });
//       thumbnailUrl = uploadRes.secure_url;
//     }

//     // Upload content assets to Cloudinary
//     const assets = [];
//     for (const assetFile of assetFiles) {
//       const bytes = await assetFile.arrayBuffer();
//       const buffer = Buffer.from(bytes);
//       const base64 = `data:${assetFile.type};base64,${buffer.toString("base64")}`;
      
//       const uploadRes = await cloudinary.uploader.upload(base64, {
//         folder: "rooms/assets",
//         resource_type: "auto", // Automatically detect video/image
//         public_id: `${Date.now()}-${assetFile.name.replace(/\s/g, "_")}`,
//       });
      
//       assets.push({
//         type: assetFile.type.startsWith("video/") ? "video" : "image",
//         url: uploadRes.secure_url,
//         name: assetFile.name,
//         size: assetFile.size,
//       });
//     }

//     const now = Date.now();
//     const newRoom = {
//       userId,
//       status: "published", // or "draft" if you want to save as draft
//       currentStep: 4,
//       event: {
//         selectedEvent: { id: eventId, name: eventName },
//         roomType: roomType,
//       },
//       details: {
//         title,
//         description: description || "",
//         thumbnail: thumbnailUrl,
//         capacity: capacity || 0,
//         primaryLanguage: primaryLanguage || "",
//         tags,
//         moderators,
//         schedule: schedule || "",
//       },
//       content: {
//         assets,
//       },
//       pricing: {
//         pricePerFan: pricePerFan || 0,
//         currency,
//       },
//       createdAt: now,
//       updatedAt: now,
//       publishedAt: now,
//     };

//     const docRef = await db.collection("rooms").add(newRoom);

//     return NextResponse.json({
//       success: true,
//       roomId: docRef.id,
//       room: { id: docRef.id, ...newRoom },
//     }, { status: 201 });

//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("[rooms POST]", error);
//     return NextResponse.json({ success: false, error: msg }, { status: 500 });
//   }
// }




export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Option 1: Get token from Authorization header (if sent)
    const authHeader = req.headers.get("authorization");
    let token: string | null = null;
    
    // Option 2: Get token from cookie (fallback)
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

    // Step 1: Event & Room Type
    const eventId = formData.get("eventId") as string;
    const eventName = formData.get("eventName") as string;
    const roomType = formData.get("roomType") as string;

    // Step 2: Details
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const capacity = parseInt(formData.get("capacity") as string);
    const primaryLanguage = formData.get("primaryLanguage") as string;
    const tags = JSON.parse(formData.get("tags") as string || "[]");
    const moderators = JSON.parse(formData.get("moderators") as string || "[]");
    const schedule = formData.get("schedule") as string;
    
    const thumbnailFile = formData.get("thumbnail") as File | null;
    const assetFiles = formData.getAll("assets") as File[];
    const pricePerFan = parseInt(formData.get("pricePerFan") as string);
    const currency = formData.get("currency") as string || "INR";

    if (!eventId || !eventName || !roomType || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Upload thumbnail to Cloudinary
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

    // Upload content assets to Cloudinary
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

    const now = Date.now();
    const newRoom = {
      userId: userEmail, // ✅ Use email as userId (matches your users collection)
      firebaseUid: firebaseUid, // Store Firebase UID for reference
      status: "published",
      currentStep: 4,
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
      },
      pricing: {
        pricePerFan: pricePerFan || 0,
        currency,
      },
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };

    const docRef = await db.collection("rooms").add(newRoom);

    return NextResponse.json({
      success: true,
      roomId: docRef.id,
      room: { id: docRef.id, ...newRoom },
    }, { status: 201 });

  } catch (error: unknown) {
  const msg = error instanceof Error ? error.message : "Unexpected error";
  console.error("[rooms POST] Full error:", error); // ← already there
  console.error("[rooms POST] Message:", msg);       // see exact message
  return NextResponse.json({ success: false, error: msg }, { status: 500 });
}
}