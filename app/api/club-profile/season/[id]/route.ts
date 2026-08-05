// app/api/club-profile/season/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// ─── GET: Single Season 
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `CLUB_SEASON#${id}`,
            sk: "SEASON#META",
          },
        })
      );
      if (getRes.Item) {
        const item = getRes.Item;
        return NextResponse.json({
          success: true,
          season: {
            id: item.id || id,
            ...item,
          },
        });
      }
    } catch (e) {
      console.warn("[club-profile season [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const doc = await db.collection("clubSeasons").doc(id).get();
      if (doc.exists) {
        return NextResponse.json({
          success: true,
          season: { id: doc.id, ...doc.data() },
        });
      }
    }

    return NextResponse.json(
      { success: false, message: "Season not found" },
      { status: 404 }
    );
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

    let existingData: Record<string, unknown> = {};

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `CLUB_SEASON#${id}`,
            sk: "SEASON#META",
          },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[club-profile season [id] PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      const existing = await db.collection("clubSeasons").doc(id).get();
      if (existing.exists) {
        existingData = existing.data() as Record<string, unknown>;
      }
    }

    const existingSeason = (existingData.season as Record<string, unknown>) || {};

    const updatedSeasonObj = {
      year: season?.year ?? existingSeason.year ?? "",
      wins: season?.wins ?? existingSeason.wins ?? "0",
      losses: season?.losses ?? existingSeason.losses ?? "0",
      points: season?.points ?? existingSeason.points ?? "0",
      position: season?.position ?? existingSeason.position ?? "",
      matchesPlayed: season?.matchesPlayed ?? existingSeason.matchesPlayed ?? "0",
      netRunRate: season?.netRunRate ?? existingSeason.netRunRate ?? "0",
      highestTotal: season?.highestTotal ?? existingSeason.highestTotal ?? "",
      lowestTotal: season?.lowestTotal ?? existingSeason.lowestTotal ?? "",
      runs: season?.runs ?? existingSeason.runs ?? "0",
      strikeRate: season?.strikeRate ?? existingSeason.strikeRate ?? "0",
      average: season?.average ?? existingSeason.average ?? "0",
      fifties: season?.fifties !== undefined ? Number(season.fifties) : Number(existingSeason.fifties || 0),
      hundreds: season?.hundreds !== undefined ? Number(season.hundreds) : Number(existingSeason.hundreds || 0),
      highestScore: season?.highestScore ?? existingSeason.highestScore ?? "",
      fours: season?.fours !== undefined ? Number(season.fours) : Number(existingSeason.fours || 0),
      sixes: season?.sixes !== undefined ? Number(season.sixes) : Number(existingSeason.sixes || 0),
      award: season?.award ?? existingSeason.award ?? "",
      awardSub: season?.awardSub ?? existingSeason.awardSub ?? "",
    };

    const updateData = {
      ...existingData,
      id,
      season: updatedSeasonObj,
      updatedAt: Date.now(),
    };

    const yr = updatedSeasonObj.year || "META";
    const dynamoItem = {
      entityId: `CLUB_SEASON#${id}`,
      sk: `SEASON#${yr}`,
      ...updateData,
    };

    await dualWrite("clubSeasons", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      season: { ...updateData, id },
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
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await dualDelete("clubSeasons", id, "SportsData", {
      entityId: `CLUB_SEASON#${id}`,
      sk: "SEASON#META",
    });

    return NextResponse.json({ success: true, message: "Season deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}