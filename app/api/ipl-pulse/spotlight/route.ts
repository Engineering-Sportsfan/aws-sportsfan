import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const docRef = db.collection("IPL_Pulse_Spotlight").doc("current");
    const doc = await docRef.get();

    if (!doc.exists) {
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
      data: doc.data(),
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

    await db.collection("IPL_Pulse_Spotlight").doc("current").set(spotlightData);

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
