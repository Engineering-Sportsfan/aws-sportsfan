import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// ─── GET: Single Season 
export async function GET(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const doc = await db.collection("playerSeasons").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Season not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, season: { id: doc.id, ...doc.data() } });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Fetch failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── PUT: Update Season 
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const body = await req.json();
    const { season } = body;

    const existing = await db.collection("playerSeasons").doc(id).get();
    if (!existing.exists) {
      return NextResponse.json(
        { success: false, message: "Season not found" },
        { status: 404 }
      );
    }

    const existingData = existing.data() as Record<string, unknown>;
    const existingSeason = existingData.season as Record<string, unknown>;

   const updateData = {
  season: {
    year: season?.year ?? existingSeason.year,
    runs: season?.runs ?? existingSeason.runs,
    strikeRate: season?.strikeRate ?? existingSeason.strikeRate,
    average: season?.average ?? existingSeason.average,
    jerseyNo: season?.jerseyNo ?? existingSeason.jerseyNo ?? "", 

    // ✅ NEW combined fields
    fiftiesAndHundreds: season?.fiftiesAndHundreds ?? existingSeason.fiftiesAndHundreds ?? "",
    highestScore: season?.highestScore ?? existingSeason.highestScore,
    fours: season?.fours !== undefined ? Number(season.fours) : existingSeason.fours,
    sixes: season?.sixes !== undefined ? Number(season.sixes) : existingSeason.sixes,
    award: season?.award ?? existingSeason.award,
    awardSub: season?.awardSub ?? existingSeason.awardSub,

    wickets: season?.wickets !== undefined ? Number(season.wickets) : existingSeason.wickets,
    deliveries: season?.deliveries !== undefined ? Number(season.deliveries) : existingSeason.deliveries,
    bowlingAvg: season?.bowlingAvg ?? existingSeason.bowlingAvg,
    bowlingSR: season?.bowlingSR ?? existingSeason.bowlingSR,
    economy: season?.economy ?? existingSeason.economy,
    bestBowling: season?.bestBowling ?? existingSeason.bestBowling,

    //  NEW combined field
    threeW_fiveW_Hauls: season?.threeW_fiveW_Hauls ?? existingSeason.threeW_fiveW_Hauls ?? "",
    foursConceded: season?.foursConceded !== undefined ? Number(season.foursConceded) : existingSeason.foursConceded,
    sixesConceded: season?.sixesConceded !== undefined ? Number(season.sixesConceded) : existingSeason.sixesConceded,
  },
  updatedAt: Date.now(),
};
    await db.collection("playerSeasons").doc(id).update(updateData);

    return NextResponse.json({
      success: true,
      season: { id: id, ...existingData, ...updateData },
    });
  } catch (error) {
    console.error("Update season error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove Season 
export async function DELETE(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const doc = await db.collection("playerSeasons").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Season not found" },
        { status: 404 }
      );
    }
    await db.collection("playerSeasons").doc(id).delete();
    return NextResponse.json({ success: true, message: "Season deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}