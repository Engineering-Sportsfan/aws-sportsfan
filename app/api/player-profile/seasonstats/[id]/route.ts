// app/api/player-profile/seasonstats/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

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

    let season: any = null;

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :sPrefix) AND (entityId = :fullId OR id = :pureId)",
          ExpressionAttributeValues: {
            ":sPrefix": "PLAYER_SEASON#",
            ":fullId": `PLAYER_SEASON#${id}`,
            ":pureId": id,
          },
          Limit: 1,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        season = {
          id: scanRes.Items[0].id || (scanRes.Items[0].entityId as string).replace(/^PLAYER_SEASON#/, ""),
          ...scanRes.Items[0],
        };
      }
    } catch (e) {
      console.warn("[player-profile seasonstats [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!season && db) {
      const doc = await db.collection("playerSeasons").doc(id).get();
      if (doc.exists) {
        season = { id: doc.id, ...doc.data() };
      }
    }

    if (!season) {
      return NextResponse.json(
        { success: false, message: "Season not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, season });
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

    let existing: any = null;
    let existingSk = `SEASON#${season?.year || "META"}`;

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :sPrefix) AND (entityId = :fullId OR id = :pureId)",
          ExpressionAttributeValues: {
            ":sPrefix": "PLAYER_SEASON#",
            ":fullId": `PLAYER_SEASON#${id}`,
            ":pureId": id,
          },
          Limit: 1,
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        existing = scanRes.Items[0];
        existingSk = existing.sk || existingSk;
      }
    } catch {}

    if (!existing && db) {
      const doc = await db.collection("playerSeasons").doc(id).get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Season not found" },
        { status: 404 }
      );
    }

    const existingSeason = (existing.season || {}) as Record<string, unknown>;

    const updateData = {
      season: {
        year: season?.year ?? existingSeason.year ?? "",
        runs: season?.runs ?? existingSeason.runs ?? "0",
        strikeRate: season?.strikeRate ?? existingSeason.strikeRate ?? "0",
        average: season?.average ?? existingSeason.average ?? "0",
        jerseyNo: season?.jerseyNo ?? existingSeason.jerseyNo ?? "",
        fiftiesAndHundreds: season?.fiftiesAndHundreds ?? existingSeason.fiftiesAndHundreds ?? "",
        highestScore: season?.highestScore ?? existingSeason.highestScore ?? "",
        fours: season?.fours !== undefined ? Number(season.fours) : (existingSeason.fours ?? 0),
        sixes: season?.sixes !== undefined ? Number(season.sixes) : (existingSeason.sixes ?? 0),
        award: season?.award ?? existingSeason.award ?? "",
        awardSub: season?.awardSub ?? existingSeason.awardSub ?? "",
        wickets: season?.wickets !== undefined ? Number(season.wickets) : (existingSeason.wickets ?? 0),
        deliveries: season?.deliveries !== undefined ? Number(season.deliveries) : (existingSeason.deliveries ?? 0),
        bowlingAvg: season?.bowlingAvg ?? existingSeason.bowlingAvg ?? "0",
        bowlingSR: season?.bowlingSR ?? existingSeason.bowlingSR ?? "0",
        economy: season?.economy ?? existingSeason.economy ?? "0",
        bestBowling: season?.bestBowling ?? existingSeason.bestBowling ?? "",
        threeW_fiveW_Hauls: season?.threeW_fiveW_Hauls ?? existingSeason.threeW_fiveW_Hauls ?? "",
        foursConceded: season?.foursConceded !== undefined ? Number(season.foursConceded) : (existingSeason.foursConceded ?? 0),
        sixesConceded: season?.sixesConceded !== undefined ? Number(season.sixesConceded) : (existingSeason.sixesConceded ?? 0),
      },
      updatedAt: Date.now(),
    };

    const updatedDoc = {
      ...existing,
      ...updateData,
      id,
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `PLAYER_SEASON#${id}`,
        sk: existingSk,
        ...updatedDoc,
      },
      firestoreRef: db.collection("playerSeasons").doc(id),
      firestoreData: updateData,
    });

    return NextResponse.json({
      success: true,
      season: updatedDoc,
    });
  } catch (error) {
    console.error("Update season error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete Season 
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :sPrefix) AND (entityId = :fullId OR id = :pureId)",
          ExpressionAttributeValues: {
            ":sPrefix": "PLAYER_SEASON#",
            ":fullId": `PLAYER_SEASON#${id}`,
            ":pureId": id,
          },
        })
      );
      if (scanRes.Items) {
        for (const item of scanRes.Items) {
          await docClient.send(
            new DeleteCommand({
              TableName: "SportsData",
              Key: {
                entityId: item.entityId,
                sk: item.sk,
              },
            })
          );
        }
      }
    } catch (e) {
      console.warn("[player-profile seasonstats [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("playerSeasons").doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Season deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}