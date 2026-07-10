import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const name = formData.get("name") as string;
    const team = formData.get("team") as string;
    const battingStyle = formData.get("battingStyle") as string;
    const bowlingStyle = formData.get("bowlingStyle") as string;
    const about = formData.get("about") as string;

    // Stats
    const statsRuns = formData.get("statsRuns") as string;
    const statsSr = formData.get("statsSr") as string;
    const statsAvg = formData.get("statsAvg") as string;

    // Overview
    const overviewCaptain = formData.get("overviewCaptain") as string;
    const overviewCoach = formData.get("overviewCoach") as string;
    const overviewOwner = formData.get("overviewOwner") as string;
    const overviewVenue = formData.get("overviewVenue") as string;

    // Files
    const avatarFile = formData.get("avatar") as File | null;

    if (!name || !team) {
      return NextResponse.json(
        { success: false, message: "name and team are required" },
        { status: 400 }
      );
    }

    // Upload avatar
    let avatarUrl = "";
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
      team,
      battingStyle: battingStyle || "",
      bowlingStyle: bowlingStyle || "",
      about: about || "",
      avatar: avatarUrl,
      stats: {
        runs: statsRuns || "0",
        sr: statsSr || "0",
        avg: statsAvg || "0",
      },
      overview: {
        captain: overviewCaptain || "",
        coach: overviewCoach || "",
        owner: overviewOwner || "",
        venue: overviewVenue || "",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("clubProfiles").add(profileData);

    return NextResponse.json({
      success: true,
      profile: { id: docRef.id, ...profileData },
    });
  } catch (error) {
    console.error("Create club profile error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}




export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    const collectionRef = db.collection("clubProfiles");
    
    let query = collectionRef
      .orderBy("createdAt", "desc")
      .limit(limit);
    
    // Use cursor-based pagination instead of offset (no count needed)
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("clubProfiles").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const snapshot = await query.get();
    
    const profiles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    return NextResponse.json({
      success: true,
      profiles,
      pagination: {
        limit,
        hasMore: profiles.length === limit,
        nextCursor: profiles.length === limit ? {
          lastDocId: lastDoc?.id,
          lastDocCreatedAt: lastDoc?.data()?.createdAt
        } : null
      },
    });
  } catch (error) {
    console.error("Fetch club profiles error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}