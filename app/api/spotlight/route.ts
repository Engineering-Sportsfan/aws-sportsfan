import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const docRef = db.collection("IPL_Pulse_Spotlight").doc("current");
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({
        success: true,
        data: { playersToWatch: [], impactPlayers: [], consistentPerformers: [] },
      });
    }

    return NextResponse.json({ success: true, data: doc.data() });
  } catch (error:unknown) {
    if (error instanceof Error) {      console.error("Error fetching spotlight data:", error.message);
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

    await db.collection("IPL_Pulse_Spotlight").doc("current").set(spotlightData);
    return NextResponse.json({ success: true, message: "Spotlight updated successfully" });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error updating spotlight data:", error.message);
    }
    return NextResponse.json({ success: false, message: "Update failed" }, { status: 500 });
  }
}
