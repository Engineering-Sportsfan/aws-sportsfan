import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";

// Define the Drop type
interface Drop {
  id: string;
  title: string;
  url: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const name = formData.get("name") as string; 
    const about = formData.get("about") as string;
    const dropsJson = formData.get("drops") as string;
    const existingAvatar = formData.get("existingAvatar") as string;

    // Parse drops from JSON string
    let drops: Drop[] = [];
    if (dropsJson) {
      try {
        drops = JSON.parse(dropsJson);
      } catch (e) {
        console.error("Failed to parse drops JSON", e);
      }
    }

    // Files
    const avatarFile = formData.get("avatar") as File | null;

    if (!name) {
      return NextResponse.json(
        { success: false, message: "name is required" },
        { status: 400 }
      );
    }

    // Upload avatar or use existing
    let avatarUrl = existingAvatar || "";
    if (avatarFile) {
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "club-profiles/avatars",
        public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
      });
      avatarUrl = uploadRes.secure_url;
    }

    const profileData = {
      name,
      about: about || "",
      avatar: avatarUrl,
      drops: drops || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = db.collection("Sportsfan360Profile").doc();
    await docRef.set(profileData);

    return NextResponse.json({
      success: true,
      profile: { id: docRef.id, ...profileData },
    });
  } catch (error) {
    console.error("Create Sportsfan360 profile error:", error);
    
    let errorMessage = "Create failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { success: false, message: `Create failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50); // Cap at 50
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const lastDocId = searchParams.get("lastDocId");
    const lastDocValue = searchParams.get("lastDocValue"); // For name or createdAt

    const collectionRef = db.collection("Sportsfan360Profile");
    let query: FirebaseFirestore.Query = collectionRef;

    // Build query based on search or normal list
    if (search) {
      query = query
        .orderBy("nameLower")
        .startAt(search)
        .endAt(search + "\uf8ff");
      
      // Apply cursor for search results
      if (lastDocId && lastDocValue) {
        const lastDocRef = collectionRef.doc(lastDocId);
        const lastDoc = await lastDocRef.get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }
    } else {
      query = query.orderBy("createdAt", "desc");
      
      // Apply cursor for normal list
      if (lastDocId && lastDocValue) {
        const lastDocRef = collectionRef.doc(lastDocId);
        const lastDoc = await lastDocRef.get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }
    }

    // Fetch one extra doc to know if there's more
    const snapshot = await query.limit(limit + 1).get();

    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const profiles = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get last document for next cursor
    const lastDoc = docs[docs.length - 1];
    const nextCursor = hasMore ? {
      lastDocId: lastDoc?.id,
      lastDocValue: search ? lastDoc?.data()?.nameLower : lastDoc?.data()?.createdAt
    } : null;

    return NextResponse.json({
      success: true,
      profiles,
      pagination: {
        limit,
        hasMore,
        nextCursor, // Use this for next page
      },
    });
  } catch (error) {
    console.error("Fetch player profiles error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}