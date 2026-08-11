// app/api/spotlight/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let data: any = null;

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: "SPOTLIGHT#CURRENT", sk: "SPOTLIGHT#META" },
        })
      );
      if (getRes.Item) data = getRes.Item;
    } catch (e) {
      console.warn("[spotlight GET] DynamoDB notice:", e);
    }

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
        data: { playersToWatch: [], impactPlayers: [], consistentPerformers: [] },
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error fetching spotlight data:", error.message);
    }
    return NextResponse.json({ success: false, message: "Fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const spotlightData = {
      playersToWatch: body.playersToWatch || [],
      impactPlayers: body.impactPlayers || [],
      consistentPerformers: body.consistentPerformers || [],
      updatedAt: Date.now(),
    };

    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: "SPOTLIGHT#CURRENT",
        sk: "SPOTLIGHT#META",
        ...spotlightData,
      },
      firestoreRef: db.collection("IPL_Pulse_Spotlight").doc("current"),
      firestoreData: spotlightData,
    });

    return NextResponse.json({ success: true, message: "Spotlight updated successfully" });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error updating spotlight data:", error.message);
    }
    return NextResponse.json({ success: false, message: "Update failed" }, { status: 500 });
  }
}
