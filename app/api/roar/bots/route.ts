import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snapshot = await db.collection("users").where("isBot", "==", true).get();
    const bots = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().username || doc.data().name || "Unknown Bot",
      role: doc.data().botRole || "AI Agent",
      active: doc.data().isBotActive !== false // Defaults to true unless explicitly disabled
    }));

    return NextResponse.json({ success: true, bots });
  } catch (error: unknown) {
    console.error("GET /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to fetch bots" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { botId, active } = await req.json();
    if (!botId) return NextResponse.json({ error: "Missing botId" }, { status: 400 });

    // Update the bot's global kill switch status in the database
    await db.collection("users").doc(botId).update({
      isBotActive: active
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PUT /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to update bot status" }, { status: 500 });
  }
}
