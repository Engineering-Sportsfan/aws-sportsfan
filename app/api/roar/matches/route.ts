import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

// GET /api/roar/matches
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const snapshot = await db.collection("matches").orderBy("kickoff_time", "asc").get();
    const matches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ success: true, matches });
  } catch (error: any) {
    console.error("GET /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to load matches." }, { status: 500 });
  }
}

// POST /api/roar/matches
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sport, competition, team_a, team_b, kickoff_time, stage, status } = body;

    if (!sport || !team_a || !team_b || !kickoff_time) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const matchData = {
      sport,
      competition: competition || "",
      team_a,
      team_b,
      kickoff_time: Number(kickoff_time),
      stage: stage || "group",
      status: status || "upcoming",
      created_at: Date.now(),
      updated_at: Date.now()
    };

    const docRef = await db.collection("matches").add(matchData);
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error("POST /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to create match." }, { status: 500 });
  }
}

// PATCH /api/roar/matches
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing match ID parameter." }, { status: 400 });
    }

    const body = await req.json();
    const updateData = {
      sport: body.sport,
      competition: body.competition || "",
      team_a: body.team_a,
      team_b: body.team_b,
      kickoff_time: Number(body.kickoff_time),
      stage: body.stage || "group",
      status: body.status || "upcoming",
      updated_at: Date.now()
    };

    await db.collection("matches").doc(id).update(updateData);
    return NextResponse.json({ success: true, message: `Match ${id} updated successfully.` });
  } catch (error: any) {
    console.error("PATCH /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to update match." }, { status: 500 });
  }
}

// DELETE /api/roar/matches
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing match ID parameter." }, { status: 400 });
    }

    await db.collection("matches").doc(id).delete();
    return NextResponse.json({ success: true, message: `Match ${id} deleted successfully.` });
  } catch (error: any) {
    console.error("DELETE /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete match." }, { status: 500 });
  }
}
