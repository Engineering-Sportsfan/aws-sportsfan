import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Base fallback system bots
    const baseBots = [
      { id: "dolly-dolphin-bot", name: "Dolly", role: "neutral", active: true, avatarUrl: "", bio: "", affiliations: {} },
      { id: "krishna-india-bot", name: "Krishna", role: "partisan", active: true, avatarUrl: "", bio: "", affiliations: {} },
      { id: "radha-england-bot", name: "Radha", role: "partisan", active: true, avatarUrl: "", bio: "", affiliations: {} }
    ];

    // Fetch from Firestore to overlay user-defined properties (avatar, bio, active status, affiliations)
    const snapshot = await db.collection("users").where("isBot", "==", true).get();
    const dbBots = new Map();
    snapshot.docs.forEach(doc => {
      dbBots.set(doc.id, doc.data());
    });

    const bots = baseBots.map(base => {
      const dbData = dbBots.get(base.id);
      if (dbData) {
        return {
          ...base,
          active: dbData.isBotActive !== undefined ? dbData.isBotActive : base.active,
          avatarUrl: dbData.avatarUrl || base.avatarUrl,
          bio: dbData.bio || base.bio,
          affiliations: dbData.affiliations || base.affiliations
        };
      }
      return base;
    });

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

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { botId, avatarUrl, bio, affiliations } = await req.json();
    if (!botId) return NextResponse.json({ error: "Missing botId" }, { status: 400 });

    const updateData: any = { isBot: true };
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (bio !== undefined) updateData.bio = bio;
    if (affiliations !== undefined) updateData.affiliations = affiliations; // merges the whole map

    await db.collection("users").doc(botId).set(updateData, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("POST /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to update bot profile" }, { status: 500 });
  }
}
