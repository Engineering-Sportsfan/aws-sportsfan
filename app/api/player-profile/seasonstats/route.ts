// app/api/player-profile/seasonstats/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── POST: Create Season Stats 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerProfilesId, season } = body;

    const now = Date.now();
    const id = `pseason_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const seasonData = {
      id,
      playerProfilesId,
      playerProfileId: playerProfilesId,
      season: {
        year: season?.year || "",
        runs: season?.runs || "0",
        strikeRate: season?.strikeRate || "0",
        average: season?.average || "0",
        fiftiesAndHundreds: season?.fiftiesAndHundreds || "",
        highestScore: season?.highestScore || "",
        fours: Number(season?.fours) || 0,
        sixes: Number(season?.sixes) || 0,
        award: season?.award || "",
        awardSub: season?.awardSub || "",
        wickets: Number(season?.wickets) || 0,
        deliveries: Number(season?.deliveries) || 0,
        bowlingAvg: season?.bowlingAvg || "0",
        bowlingSR: season?.bowlingSR || "0",
        economy: season?.economy || "0",
        bestBowling: season?.bestBowling || "",
        threeW_fiveW_Hauls: season?.threeW_fiveW_Hauls || "",
        foursConceded: Number(season?.foursConceded) || 0,
        sixesConceded: Number(season?.sixesConceded) || 0,
        jerseyNo: season?.jerseyNo || "",
      },
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `PLAYER_SEASON#${id}`,
        sk: `SEASON#${season?.year || "META"}`,
        ...seasonData,
      },
      firestoreRef: db.collection("playerSeasons").doc(id),
      firestoreData: seasonData,
    });

    return NextResponse.json({
      success: true,
      seasonStats: seasonData,
    });
  } catch (error) {
    console.error("Create season error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── GET: Fetch Seasons 
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerProfileId = searchParams.get("playerProfilesId") || searchParams.get("playerProfileId");
    const year = searchParams.get("year");
    const limit = parseInt(searchParams.get("limit") || "20");

    let seasons: any[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :sPrefix)";
      const exprVals: Record<string, any> = {
        ":sPrefix": "PLAYER_SEASON#",
      };

      if (playerProfileId) {
        filterExpr += " AND (playerProfilesId = :ppId OR playerProfileId = :ppId)";
        exprVals[":ppId"] = playerProfileId;
      }
      if (year) {
        filterExpr += " AND season.#yr = :yr";
        exprVals[":yr"] = year;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: year ? { "#yr": "year" } : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        seasons = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PLAYER_SEASON#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[player-profile seasonstats GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (seasons.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("playerSeasons");

      if (playerProfileId) {
        query = query.where("playerProfileId", "==", playerProfileId);
      }
      if (year) {
        query = query.where("season.year", "==", year);
      }

      query = query.orderBy("createdAt", "desc").limit(limit);
      const snapshot = await query.get();

      seasons = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    seasons.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = seasons.slice(0, limit);

    return NextResponse.json({
      success: true,
      seasons: paged,
      total: seasons.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Fetch failed: " + (error as Error).message,
      },
      { status: 500 }
    );
  }
}