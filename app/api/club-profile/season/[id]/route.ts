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
    const doc = await db.collection("clubSeasons").doc(id).get();
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
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const body = await req.json();
    const { season } = body;

    const existing = await db.collection("clubSeasons").doc(id).get();
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
        wins: season?.wins ?? existingSeason.wins,
        losses: season?.losses ?? existingSeason.losses,
        points: season?.points ?? existingSeason.points,
        position: season?.position ?? existingSeason.position,
        matchesPlayed: season?.matchesPlayed ?? existingSeason.matchesPlayed,
        netRunRate: season?.netRunRate ?? existingSeason.netRunRate,
        highestTotal: season?.highestTotal ?? existingSeason.highestTotal,
        lowestTotal: season?.lowestTotal ?? existingSeason.lowestTotal,
        runs: season?.runs ?? existingSeason.runs,
        strikeRate: season?.strikeRate ?? existingSeason.strikeRate,
        average: season?.average ?? existingSeason.average,
        fifties: season?.fifties !== undefined ? Number(season.fifties) : existingSeason.fifties,
        hundreds: season?.hundreds !== undefined ? Number(season.hundreds) : existingSeason.hundreds,
        highestScore: season?.highestScore ?? existingSeason.highestScore,
        fours: season?.fours !== undefined ? Number(season.fours) : existingSeason.fours,
        sixes: season?.sixes !== undefined ? Number(season.sixes) : existingSeason.sixes,
        award: season?.award ?? existingSeason.award,
        awardSub: season?.awardSub ?? existingSeason.awardSub,
      },
      updatedAt: Date.now(),
    };

    await db.collection("clubSeasons").doc(id).update(updateData);

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
    const doc = await db.collection("clubSeasons").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Season not found" },
        { status: 404 }
      );
    }
    await db.collection("clubSeasons").doc(id).delete();
    return NextResponse.json({ success: true, message: "Season deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}