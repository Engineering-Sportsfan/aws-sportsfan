import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserSessionAndRole } from "@/lib/auth";

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}
// GET Request
export async function GET(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const doc = await db.collection("watchAlongMatches").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, match: { id: doc.id, ...doc.data() } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}


// // GET Request
// export async function PUT(req: NextRequest) {
//   try {
//     const id   = getIdFromUrl(req);

//     if (!id) {
//       return NextResponse.json({ error: "ID required" }, { status: 400 });
//     }
//     const docRef = db.collection("watchAlongMatches").doc(id);
//     const existing = await docRef.get();

//     if (!existing.exists) {
//       return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
//     }

//     const body = await req.json();
//     const updates: Record<string, unknown> = { updatedAt: Date.now() };

//     if (body.matchNo !== undefined) updates.matchNo = Number(body.matchNo);
//     if (body.tournament !== undefined) updates.tournament = body.tournament;
//     if (body.stadium !== undefined) updates.stadium = body.stadium;
//     if (body.isLive !== undefined) updates.isLive = Boolean(body.isLive);

//     if (body.team1) {
//       const prev = (existing.data()?.team1 || {}) as Record<string, string>;
//       updates.team1 = { ...prev, ...body.team1 };
//     }
//     if (body.team2) {
//       const prev = (existing.data()?.team2 || {}) as Record<string, string>;
//       updates.team2 = { ...prev, ...body.team2 };
//     }

//     await docRef.update(updates);
//     const updated = await docRef.get();

//     return NextResponse.json({ success: true, match: { id: updated.id, ...updated.data() } });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: (error as Error).message },
//       { status: 500 }
//     );
//   }
// }


// app/api/watch-along/matches/[id]/route.ts
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
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

    const matchRef = db.collection("watchAlongMatches").doc(id);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Match not found" },
        { status: 404 }
      );
    }

    const updates = {
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
      videoType: videoType || "youtube",  // ← Add video type
      updatedAt: Date.now(),
    };

    await matchRef.update(updates);
    const updatedDoc = await matchRef.get();

    return NextResponse.json({
      success: true,
      match: { id: updatedDoc.id, ...updatedDoc.data() },
    });
  } catch (error) {
    console.error("[watch-along/matches PUT]", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// GET Request
export async function DELETE(req: NextRequest) {
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

    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const docRef = db.collection("watchAlongMatches").doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
    }

    // Detach this match from any room that references it
    const roomsSnap = await db
      .collection("watchAlongRooms")
      .where("liveMatchId", "==", id)
      .get();

    const batch = db.batch();
    roomsSnap.docs.forEach((roomDoc) =>
      batch.update(roomDoc.ref, { liveMatchId: null, isLive: false, updatedAt: Date.now() })
    );
    batch.delete(docRef);
    await batch.commit();

    return NextResponse.json({ success: true, message: "Match deleted and rooms updated" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}












