import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const bots = [
      { id: "dolly-dolphin-bot", name: "Dolly", role: "Neutral Analyst", active: true },
      { id: "krishna-india-bot", name: "Krishna", role: "Partisan India Fan", active: true },
      { id: "radha-england-bot", name: "Radha", role: "Partisan England Fan", active: true }
    ];

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

    await db.collection("users").doc(botId).set({
      isBotActive: active,
      isBot: true
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PUT /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to update bot status" }, { status: 500 });
  }
}
