import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// GET: Read active session settings
export async function GET(req: NextRequest) {
  try {
    const docRef = db.collection("multipliers").doc("streakSettings");
    const doc = await docRef.get();

    let minSessionSeconds = 60; // Default fallback
    if (doc.exists) {
      minSessionSeconds = doc.data()!.minSessionSeconds ?? minSessionSeconds;
    } else {
      // Initialize in database if missing
      await docRef.set({ minSessionSeconds, updatedAt: Date.now() });
    }

    return NextResponse.json({
      success: true,
      minSessionSeconds,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching streak settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Update active session settings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { minSessionSeconds } = body;

    if (typeof minSessionSeconds !== "number" || minSessionSeconds < 0) {
      return NextResponse.json(
        { error: "minSessionSeconds must be a non-negative number" },
        { status: 400 }
      );
    }

    const docRef = db.collection("multipliers").doc("streakSettings");
    await docRef.set({
      minSessionSeconds,
      updatedAt: Date.now()
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Streak session settings updated successfully",
      minSessionSeconds
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating streak settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
