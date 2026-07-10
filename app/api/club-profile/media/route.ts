import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";

// ─── POST: Create Media Item(s) 
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const clubProfileId = formData.get("clubProfileId") as string;

    // Support uploading multiple media items at once
    const titles = formData.getAll("titles") as string[];
    const viewsCounts = formData.getAll("views") as string[];
    const times = formData.getAll("times") as string[];
    const thumbnailFiles = formData.getAll("thumbnails") as File[];

    if (!clubProfileId) {
      return NextResponse.json(
        { success: false, message: "clubProfileId is required" },
        { status: 400 }
      );
    }

    if (titles.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one media item is required" },
        { status: 400 }
      );
    }

    const mediaItems = [];

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i] || `Media ${i + 1}`;
      const views = viewsCounts[i] || "0";
      const time = times[i] || "";

      // Upload thumbnail to Cloudinary
      let thumbnailUrl = "";
      if (thumbnailFiles[i] && thumbnailFiles[i].size > 0) {
        const bytes = await thumbnailFiles[i].arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${thumbnailFiles[i].type};base64,${buffer.toString("base64")}`;
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `club-profiles/${clubProfileId}/media/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${thumbnailFiles[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = uploadRes.secure_url;
      }

      mediaItems.push({
        title,
        views,
        time,
        thumbnail: thumbnailUrl,
      });
    }

    const mediaData = {
      clubProfileId,
      mediaItems,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("clubMedia").add(mediaData);

    return NextResponse.json({
      success: true,
      media: { id: docRef.id, ...mediaData },
    });
  } catch (error) {
    console.error("Create media error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clubProfileId = searchParams.get("clubProfileId");
    const limit = parseInt(searchParams.get("limit") || "12");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query: FirebaseFirestore.Query = db.collection("clubMedia");

    if (clubProfileId) {
      query = query.where("clubProfileId", "==", clubProfileId);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    // Use cursor-based pagination instead of offset
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("clubMedia").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const mediaDocs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      mediaDocs,
      pagination: {
        limit,
        hasMore: mediaDocs.length === limit,
        nextCursor: mediaDocs.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch media error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}