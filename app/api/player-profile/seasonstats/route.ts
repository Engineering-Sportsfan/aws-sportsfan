import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ─── POST: Create Season Stats 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerProfilesId, season } = body;

    // if (!playerProfilesId || !season?.year) {
    //   return NextResponse.json(
    //     { success: false, message: "playerProfileId and season.year are required" },
    //     { status: 400 }
    //   );
    // }

    // Check if a season for this year already exists for this club
    const existing = await db
      .collection("playerSeasons")
      .where("playerProfileId", "==", playerProfilesId)
      .where("season.year", "==", season.year)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { success: false, message: `Season ${season.year} already exists for this club. Use PUT to update.` },
        { status: 409 }
      );
    }

  const seasonData = {
  playerProfilesId,
  season: {
    year: season.year || "",
    runs: season.runs || "0",
    strikeRate: season.strikeRate || "0",
    average: season.average || "0",


    // ✅ NEW combined fields
    fiftiesAndHundreds: season.fiftiesAndHundreds || "",
    highestScore: season.highestScore || "",
    fours: Number(season.fours) || 0,
    sixes: Number(season.sixes) || 0,
    award: season.award || "",
    awardSub: season.awardSub || "",

    wickets: Number(season.wickets) || 0,
    deliveries: Number(season.deliveries) || 0,
    bowlingAvg: season.bowlingAvg || "0",
    bowlingSR: season.bowlingSR || "0",
    economy: season.economy || "0",
    bestBowling: season.bestBowling || "",

    // ✅ NEW combined field
    threeW_fiveW_Hauls: season.threeW_fiveW_Hauls || "",
    foursConceded: Number(season.foursConceded) || 0,
    sixesConceded: Number(season.sixesConceded) || 0,
   jerseyNo: season.jerseyNo || "", 
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

    const docRef = await db.collection("playerSeasons").add(seasonData);

    return NextResponse.json({
      success: true,
      seasonStats: { id: docRef.id, ...seasonData },
    });
  } catch (error) {
    console.error("Create season error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// // ─── GET: Fetch Seasons (by clubProfileId, optional year filter) 
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const playerProfileId = searchParams.get("playerProfilesId");
//     const year = searchParams.get("year");
//     const limit = parseInt(searchParams.get("limit") || "20");
//     const page = parseInt(searchParams.get("page") || "1");

//     let query: FirebaseFirestore.Query = db.collection("playerSeasons");

//     if (playerProfileId) {
//       query = query.where("playerProfileId", "==", playerProfileId);
//     }
//     if (year) {
//       query = query.where("season.year", "==", year);
//     }

//     const countSnapshot = await query.count().get();
//     const totalItems = countSnapshot.data().count;

//     const startAt = (page - 1) * limit;
//     const snapshot = await query
//       .orderBy("createdAt", "desc")
//       .limit(limit)
//       .offset(startAt)
//       .get();

//     const seasons = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

//     return NextResponse.json({
//       success: true,
//       seasons,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(totalItems / limit),
//         totalItems,
//         itemsPerPage: limit,
//       },
//     });
//   } catch (error) {
//     console.error("Fetch seasons error:", error);
//     return NextResponse.json(
//       { success: false, message: "Fetch failed" },
//       { status: 500 }
//     );
//   }
// }



export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerProfileId = searchParams.get("playerProfilesId");
    const year = searchParams.get("year");
    const limit = parseInt(searchParams.get("limit") || "20");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query: FirebaseFirestore.Query = db.collection("playerSeasons");

    if (playerProfileId) {
      query = query.where("playerProfilesId", "==", playerProfileId);
    }
    if (year) {
      query = query.where("season.year", "==", year);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    // Use cursor-based pagination instead of offset
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("playerSeasons").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const seasons = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      seasons,
      pagination: {
        limit,
        hasMore: seasons.length === limit,
        nextCursor: seasons.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch seasons error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}