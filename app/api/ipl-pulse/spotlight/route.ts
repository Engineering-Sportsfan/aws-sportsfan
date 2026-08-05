// app/api/ipl-pulse/spotlight/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let data: any = null;

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: "IPL_PULSE_SPOTLIGHT#current",
            sk: "SPOTLIGHT#META",
          },
        })
      );
      if (getRes.Item) {
        data = getRes.Item;
      }
    } catch (e) {
      console.warn("[ipl-pulse spotlight GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!data && db) {
      const docRef = db.collection("IPL_Pulse_Spotlight").doc("current");
      const doc = await docRef.get();
      if (doc.exists) {
        data = doc.data();
      }
    }

    if (!data) {
      return NextResponse.json({
        success: true,
        data: {
          playersToWatch: [],
          impactPlayers: [],
          consistentPerformers: [],
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        playersToWatch: data.playersToWatch || [],
        impactPlayers: data.impactPlayers || [],
        consistentPerformers: data.consistentPerformers || [],
        updatedAt: data.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching Spotlight data:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playersToWatch, impactPlayers, consistentPerformers } = body;

    const spotlightData = {
      playersToWatch: playersToWatch || [],
      impactPlayers: impactPlayers || [],
      consistentPerformers: consistentPerformers || [],
      updatedAt: Date.now(),
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: "IPL_PULSE_SPOTLIGHT#current",
        sk: "SPOTLIGHT#META",
        ...spotlightData,
      },
      firestoreRef: db.collection("IPL_Pulse_Spotlight").doc("current"),
      firestoreData: spotlightData,
    });

    return NextResponse.json({
      success: true,
      message: "Spotlight updated successfully",
    });
  } catch (error) {
    console.error("Error updating Spotlight data:", error);
    return NextResponse.json(
      { success: false, message: "Update failed" },
      { status: 500 }
    );
  }
}
