import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserSessionAndRole } from "@/lib/auth";

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches
   List all matches (used by admin dropdown to
   pick a liveMatchId when creating/editing a room)
   ───────────────────────────────────────────── */
export async function GET() {
  try {
    const snapshot = await db
      .collection("watchAlongMatches")
      .orderBy("createdAt", "desc")
      .get();

    const matches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ success: true, matches });
  } catch (error) {
    console.error("[watch-along/matches GET]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch matches: " + (error as Error).message },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches
   Creates a new match record.
   Body: JSON
   //
   {
     matchNo: 23,
     tournament: "IPL 2026",
     team1: { name: "RCB", score: "156/3", overs: "15.2" },
     team2: { name: "MI",  score: "158/4", overs: "20"   },
     stadium: "M. Chinnaswamy Stadium, Bengaluru",
     isLive: true
   }
//    ───────────────────────────────────────────── */
// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();

//     const { matchNo, tournament, team1, team2, stadium, isLive } = body;

//     if (!matchNo || !team1?.name || !team2?.name) {
//       return NextResponse.json(
//         { success: false, message: "matchNo, team1.name, team2.name are required" },
//         { status: 400 }
//       );
//     }

//     const matchData = {
//       matchNo: Number(matchNo),
//       tournament: tournament || "",
//       team1: {
//         name: team1.name,
//         score: team1.score || "",
//         overs: team1.overs || "",
//       },
//       team2: {
//         name: team2.name,
//         score: team2.score || "",
//         overs: team2.overs || "",
//       },
//       stadium: stadium || "",
//       isLive: Boolean(isLive),
//       createdAt: Date.now(),
//       updatedAt: Date.now(),
//     };

//     const docRef = await db.collection("watchAlongMatches").add(matchData);

//     return NextResponse.json({
//       success: true,
//       match: { id: docRef.id, ...matchData },
//     });
//   } catch (error) {
//     console.error("[watch-along/matches POST]", error);
//     return NextResponse.json(
//       { success: false, message: "Create failed: " + (error as Error).message },
//       { status: 500 }
//     );
//   }
// }



export async function POST(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const { 
      matchNo, 
      tournament, 
      team1, 
      team2, 
      stadium, 
      isLive,
      videoUrl,
      videoType 
    } = body;

    if (!matchNo || !team1?.name || !team2?.name) {
      return NextResponse.json(
        { success: false, message: "matchNo, team1.name, team2.name are required" },
        { status: 400 }
      );
    }

    const matchData = {
      matchNo: Number(matchNo),
      tournament: tournament || "",
      team1: {
        name: team1.name,
        score: team1.score || "",
        overs: team1.overs || "",
      },
      team2: {
        name: team2.name,
        score: team2.score || "",
        overs: team2.overs || "",
      },
      stadium: stadium || "",
      isLive: Boolean(isLive),
      videoUrl: videoUrl || "",           // ← Add video URL
      videoType: videoType || "youtube",  // ← Add video type (youtube, vimeo, mp4, hls)
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("watchAlongMatches").add(matchData);

    return NextResponse.json({
      success: true,
      match: { id: docRef.id, ...matchData },
    });
  } catch (error) {
    console.error("[watch-along/matches POST]", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}