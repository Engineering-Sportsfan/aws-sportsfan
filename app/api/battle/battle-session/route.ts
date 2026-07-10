import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

interface BattleSession {
  id: string;
  battleId: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: "in_progress" | "completed";
  totalVotes: number;
  totalPointsEarned: number;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
}

// ─── GET /api/fanbattle/battle-session 
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const battleId = searchParams.get("battleId");
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const sessionsRef = db.collection("battleSessions");
    
    // If battleId is provided, fetch specific battle session
    if (battleId) {
      const query = sessionsRef
        .where("battleId", "==", battleId)
        .where("userId", "==", userId)
        .limit(1);

      const snapshot = await query.get();

      if (snapshot.empty) {
        return NextResponse.json(
          { success: true, data: null, message: "No session found" },
          { status: 200 }
        );
      }

      const sessionDoc = snapshot.docs[0];
      return NextResponse.json({
        success: true,
        data: { id: sessionDoc.id, ...sessionDoc.data() },
      });
    }
    
    // If only userId is provided, fetch all sessions for the user
    const query = sessionsRef
      .where("userId", "==", userId)
      .orderBy("completedAt", "desc");

    const snapshot = await query.get();
    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      data: sessions,
      total: sessions.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching battle session:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/fanbattle/battle-session ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { battleId, userId, userName, userEmail } = body;

    if (!battleId || !userId) {
      return NextResponse.json(
        { error: "battleId and userId are required" },
        { status: 400 }
      );
    }

    // Check if session already exists
    const existingQuery = await db
      .collection("battleSessions")
      .where("battleId", "==", battleId)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      // Update existing session to completed
      const existingSession = existingQuery.docs[0];
      await existingSession.ref.update({
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      const updatedData = (await existingSession.ref.get()).data() as Omit<BattleSession, 'id'>;
      return NextResponse.json({
        success: true,
        data: { id: existingSession.id, ...updatedData },
      });
    }

    // Create new session
    const newSession: Omit<BattleSession, 'id'> = {
      battleId,
      userId,
      userName: userName || "",
      userEmail: userEmail || "",
      status: "completed",
      totalVotes: 0,
      totalPointsEarned: 0,
      startedAt: Date.now(),
      completedAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sessionRef = await db.collection("battleSessions").add(newSession);

    return NextResponse.json({
      success: true,
      data: { id: sessionRef.id, ...newSession },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating battle session:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}