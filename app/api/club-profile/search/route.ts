// // app/api/club-profile/complete/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";


// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const teamName = searchParams.get("teamName");
    
//     if (!teamName) {
//       return NextResponse.json(
//         { success: false, message: "teamName is required" },
//         { status: 400 }
//       );
//     }
    
//     // ========== 1. Get Profile ==========
//     const profileSnapshot = await db
//       .collection("clubProfiles")
//       .where("name", "==", teamName)
//       .limit(1)
//       .get();
    
//     if (profileSnapshot.empty) {
//       return NextResponse.json(
//         { success: false, message: `Team "${teamName}" not found` },
//         { status: 404 }
//       );
//     }
    
//     const profileDoc = profileSnapshot.docs[0];
//     const profileId = profileDoc.id;
//     const profile = { id: profileId, ...profileDoc.data() };
    
//     // ========== 2. Get Seasons (using Promise) ==========
//     const seasonsSnapshot = await db
//       .collection("clubSeasons")
//       .where("clubProfileId", "==", profileId)
//       .orderBy("season.year", "desc")
//       .get();
    
//     const seasons = seasonsSnapshot.docs.map(doc => ({
//       id: doc.id,
//       ...doc.data().season
//     }));
    
//     // ========== 3. Get Insights & Strengths ==========
//     const insightsSnapshot = await db
//       .collection("clubInsights")
//       .where("clubProfileId", "==", profileId)
//       .limit(1)
//       .get();
    
//     let insights = [];
//     let strengths = [];
    
//     if (!insightsSnapshot.empty) {
//       const insightsData = insightsSnapshot.docs[0].data();
//       insights = insightsData.insights || [];
//       strengths = insightsData.strengths || [];
//     }
    
//     // ========== 4. Get Media ==========
//     const mediaSnapshot = await db
//       .collection("clubMedia")
//       .where("clubProfileId", "==", profileId)
//       .orderBy("createdAt", "desc")
//       .limit(1)
//       .get();
    
//     let media = [];
//     if (!mediaSnapshot.empty) {
//       const mediaData = mediaSnapshot.docs[0].data();
//       media = mediaData.mediaItems || [];
//     }
    
//     // ========== 5. Return Complete Team Data ==========
//     const completeTeamData = {
//       ...profile,
//       seasons: seasons,
//       insights: insights,
//       strengths: strengths,
//       media: media,
//     };
    
//     return NextResponse.json({
//       success: true,
//       data: completeTeamData,
//     });
    
//   } catch (error) {
//     console.error("Error fetching complete team data:", error);
//     return NextResponse.json(
//       { success: false, message: "Failed to fetch team data" },
//       { status: 500 }
//     );
//   }
// }




// app/api/club-profile/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamName = searchParams.get("teamName");
    const seasonsLimit = parseInt(searchParams.get("seasonsLimit") || "5"); // Limit seasons
    
    if (!teamName) {
      return NextResponse.json(
        { success: false, message: "teamName is required" },
        { status: 400 }
      );
    }
    
    // ========== 1. Get Profile (1 read) ==========
    const profileSnapshot = await db
      .collection("clubProfiles")
      .where("name", "==", teamName)
      .limit(1)
      .get();
    
    if (profileSnapshot.empty) {
      return NextResponse.json(
        { success: false, message: `Team "${teamName}" not found` },
        { status: 404 }
      );
    }
    
    const profileDoc = profileSnapshot.docs[0];
    const profileId = profileDoc.id;
    const profile = { id: profileId, ...profileDoc.data() };
    
    // ========== 2. Get Seasons (LIMITED - only last 5) ==========
    const seasonsSnapshot = await db
      .collection("clubSeasons")
      .where("clubProfileId", "==", profileId)
      .orderBy("season.year", "desc")
      .limit(seasonsLimit) // Added limit!
      .get();
    
    const seasons = seasonsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data().season
    }));
    
    // Get hasMore for seasons
    const hasMoreSeasons = seasonsSnapshot.docs.length === seasonsLimit;
    
    // ========== 3. Get Insights & Strengths (1 read) ==========
    const insightsSnapshot = await db
      .collection("clubInsights")
      .where("clubProfileId", "==", profileId)
      .limit(1)
      .get();
    
    let insights = [];
    let strengths = [];
    
    if (!insightsSnapshot.empty) {
      const insightsData = insightsSnapshot.docs[0].data();
      insights = insightsData.insights || [];
      strengths = insightsData.strengths || [];
    }
    
    // ========== 4. Get Media (1 read) ==========
    const mediaSnapshot = await db
      .collection("clubMedia")
      .where("clubProfileId", "==", profileId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    
    let media = [];
    if (!mediaSnapshot.empty) {
      const mediaData = mediaSnapshot.docs[0].data();
      media = mediaData.mediaItems || [];
    }
    
    // ========== 5. Return Complete Team Data ==========
    const completeTeamData = {
      ...profile,
      seasons: seasons,
      seasonsHasMore: hasMoreSeasons,
      insights: insights,
      strengths: strengths,
      media: media,
    };
    
    return NextResponse.json({
      success: true,
      data: completeTeamData,
    });
    
  } catch (error) {
    console.error("Error fetching complete team data:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch team data" },
      { status: 500 }
    );
  }
}