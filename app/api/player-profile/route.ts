import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";


// export async function POST(req: NextRequest) {
//   try {
//     const formData = await req.formData();

//     const name = formData.get("name") as string;
//     const team = formData.get("team") as string;
//     const battingStyle = formData.get("battingStyle") as string;
//     const bowlingStyle = formData.get("bowlingStyle") as string;
//     const about = formData.get("about") as string;

//     // Stats
//     const statsRuns = formData.get("statsRuns") as string;
//     const statsSr = formData.get("statsSr") as string;
//     const statsAvg = formData.get("statsAvg") as string;

//     // Player Overview
//     const iplDebut = formData.get("iplDebut") as string;
//     const specialization = formData.get("specialization") as string;
//     const dob = formData.get("dob") as string;
//     const matches = formData.get("matches") as string;

//     // Files
//     const avatarFile = formData.get("avatar") as File | null;

//     if (!name || !team) {
//       return NextResponse.json(
//         { success: false, message: "name and team are required" },
//         { status: 400 }
//       );
//     }

//     // Upload avatar
//     let avatarUrl = "";
//     if (avatarFile) {
//       const bytes = await avatarFile.arrayBuffer();
//       const buffer = Buffer.from(bytes);
//       const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
//       const uploadRes = await cloudinary.uploader.upload(base64, {
//         folder: "club-profiles/avatars",
//         public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
//       });
//       avatarUrl = uploadRes.secure_url;
//     }

//     const profileData = {
//       name,
//       team,
//       battingStyle: battingStyle || "",
//       bowlingStyle: bowlingStyle || "",
//       about: about || "",
//       avatar: avatarUrl,
//       stats: {
//         runs: statsRuns || "0",
//         sr: statsSr || "0",
//         avg: statsAvg || "0",
//       },
//       overview: {
//         iplDebut: iplDebut || "",
//         specialization: specialization || "",
//         dob: dob || "",
//         matches: matches || "",
//       },
//       createdAt: Date.now(),
//       updatedAt: Date.now(),
//     };

//     const docRef = await db.collection("PlayerProfiles").add(profileData);

//     return NextResponse.json({
//       success: true,
//       profile: { id: docRef.id, ...profileData },
//     });
//   } catch (error) {
//     console.error("Create Player profile error:", error);
//     return NextResponse.json(
//       { success: false, message: "Create failed: " + (error as Error).message },
//       { status: 500 }
//     );
//   }
// }


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

    // Player Overview
    const iplDebut = formData.get("iplDebut") as string;
    const specialization = formData.get("specialization") as string;
    const dob = formData.get("dob") as string;
    const matches = formData.get("matches") as string;

    // Files
    const avatarFile = formData.get("avatar") as File | null;
    const avatarUrl = formData.get("avatarUrl") as string;

    if (!name || !team) {
      return NextResponse.json(
        { success: false, message: "name and team are required" },
        { status: 400 }
      );
    }

    // Upload avatar
    let resolvedAvatarUrl = "";
    if (avatarUrl) {
      resolvedAvatarUrl = avatarUrl;
    } else if (avatarFile) {
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "club-profiles/avatars",
        public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
      });
      resolvedAvatarUrl = uploadRes.secure_url;
    }

    const profileData = {
      name,
      team,
      battingStyle: battingStyle || "",
      bowlingStyle: bowlingStyle || "",
      about: about || "",
      avatar: resolvedAvatarUrl,
      stats: {
        runs: statsRuns || "0",
        sr: statsSr || "0",
        avg: statsAvg || "0",
      },
      overview: {
        iplDebut: iplDebut || "",
        specialization: specialization || "",
        dob: dob || "",
        matches: matches || "",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nameLower: name.toLowerCase(),
    };

    // Fix: Use set() with explicit document ID instead of add()
    // This sometimes works better with empty collections
    const docRef = db.collection("PlayerProfiles").doc(); // Auto-generate ID
    await docRef.set(profileData);

    return NextResponse.json({
      success: true,
      profile: { id: docRef.id, ...profileData },
    });
  } catch (error) {
    console.error("Create Player profile error:", error);
    
    // More detailed error handling
    let errorMessage = "Create failed";
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // If still getting NOT_FOUND, try alternative collection name
      if (errorMessage.includes("NOT_FOUND")) {
        return NextResponse.json(
          { 
            success: false, 
            message: "Database connection issue. Please ensure Firebase is properly configured.",
            details: errorMessage,
            suggestion: "Try creating the collection manually in Firebase Console first"
          },
          { status: 500 }
        );
      }
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

    const collectionRef = db.collection("PlayerProfiles");
    let query: FirebaseFirestore.Query = collectionRef;

    // Build query based on search or normal list
    if (search) {
      query = query
        .orderBy("nameLower")
        .where("nameLower", ">=", search)
        .where("nameLower", "<=", search + "\uf8ff");
      
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