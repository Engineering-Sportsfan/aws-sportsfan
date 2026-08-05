// app/api/club-profile/season/route.ts — Migrated to AWS DynamoDB (SportsData Table)
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
    const { clubProfileId, season } = body;

    if (!clubProfileId || !season?.year) {
      return NextResponse.json(
        { success: false, message: "clubProfileId and season.year are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `club_season_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const seasonData = {
      id,
      clubProfileId,
      season: {
        year: season.year || "",
        wins: season.wins || "0",
        losses: season.losses || "0",
        points: season.points || "0",
        position: season.position || "",
        matchesPlayed: season.matchesPlayed || "0",
        netRunRate: season.netRunRate || "0",
        highestTotal: season.highestTotal || "",
        lowestTotal: season.lowestTotal || "",
        runs: season.runs || "0",
        strikeRate: season.strikeRate || "0",
        average: season.average || "0",
        fifties: Number(season.fifties) || 0,
        hundreds: Number(season.hundreds) || 0,
        highestScore: season.highestScore || "",
        fours: Number(season.fours) || 0,
        sixes: Number(season.sixes) || 0,
        award: season.award || "",
        awardSub: season.awardSub || "",
      },
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      entityId: `CLUB_SEASON#${id}`,
      sk: `SEASON#${season.year}`,
      ...seasonData,
    };

    await dualWrite("clubSeasons", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      seasonStats: { ...seasonData, id },
    });
  } catch (error) {
    console.error("Create season error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── GET: List Seasons
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clubProfileId = searchParams.get("clubProfileId");
    const year = searchParams.get("year");
    const limit = parseInt(searchParams.get("limit") || "20");

    let seasons: any[] = [];

    // 1. Scan DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "CLUB_SEASON#",
      };

      if (clubProfileId) {
        filterExpr += " AND clubProfileId = :cpId";
        exprVals[":cpId"] = clubProfileId;
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
          id: item.id || (item.entityId as string).replace(/^CLUB_SEASON#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[club-profile season GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (seasons.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("clubSeasons");

      if (clubProfileId) {
        query = query.where("clubProfileId", "==", clubProfileId);
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
    const lastDoc = paged[paged.length - 1];

    return NextResponse.json({
      success: true,
      seasons: paged,
      pagination: {
        limit,
        hasMore: seasons.length > limit,
        nextCursor: seasons.length > limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.createdAt,
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