// api/roar/rooms/[roomId]/dolly/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

// ── Same canonical resolution pattern as messages/route.ts's resolveUser ──
// Ensures Dolly replies are filed under the same users/{actualUserId} that
// ROAR posts, room messages, and votes all use — so "private to this user"
// means the same user across every ROAR surface, not a divergent ID.
async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; username: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  const data = snap.data() as { username?: string };
  return { id: info.actualUserId, username: data?.username ?? "Fan" };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — load this user's private Dolly history for a room
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Scoped to roarRooms/{roomId}/dollyReplies, filtered by resolved userId —
    // server-side filter is the entire privacy boundary, never client-passed.
    const snap = await db
      .collection("roarRooms")
      .doc(roomId)
      .collection("dollyReplies")
      .where("userId", "==", resolved.id)
      .orderBy("createdAt", "asc")
      .limit(100)
      .get();

    const replies = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        question: d.question,
        answer: d.answer,
        createdAt: d.createdAt,
      };
    });

    return NextResponse.json({ success: true, replies });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET dolly replies error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — ask Dolly, get a private answer, persist it
// ─────────────────────────────────────────────────────────────────────────────
//
// Reuses the same PYTHON_AI_URL service that /api/ask-ai/route.ts calls,
// so Dolly answers come from the same RAG/cricket-knowledge backend as the
// standalone Ask AI page — just scoped here to a roomId + private storage
// instead of a global askaiConversations session.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const question = (body?.question as string | undefined)?.trim();
    if (!question) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }
    if (question.length > 300) {
      return NextResponse.json({ error: "Question too long" }, { status: 400 });
    }

   const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
    if (!PYTHON_AI_URL) {
      console.error("[dolly] PYTHON_AI_URL not configured");
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    // const roomData = roomSnap.data() as { name?: string; score?: string; scoreSubtitle?: string };

    // ── Pull a small amount of recent history for this user+room so follow-up
    // questions ("what about powerplay?") have context, same shape as
    // ask-ai's `conversation_history`.
    const recentSnap = await db
      .collection("roarRooms")
      .doc(roomId)
      .collection("dollyReplies")
      .where("userId", "==", resolved.id)
      .orderBy("createdAt", "desc")
      .limit(6)
      .get();

    const history = recentSnap.docs
      .map((d) => d.data())
      .reverse()
      .flatMap((d) => [
        { role: "user", content: d.question },
        { role: "assistant", content: d.answer },
      ]);

    let answer = "";
    try {
      const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.PYTHON_AI_KEY ?? "",
        },
        body: JSON.stringify({
          query: question,
          conversation_history: history,
          user_id: resolved.id,
          session_id: `roar_room_${roomId}_${resolved.id}`,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => "");
        console.error(`[dolly] Python service returned ${aiRes.status}: ${errText}`);
        throw new Error(`Python service returned ${aiRes.status}`);
      }

      const data = await aiRes.json();
      answer = data.answer ?? "Sorry, I couldn't find an answer for that.";
    } catch (err) {
      console.error("[dolly] AI call failed:", err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const now = Date.now();
    const replyRef = db
      .collection("roarRooms")
      .doc(roomId)
      .collection("dollyReplies")
      .doc();

    const doc = {
      userId: resolved.id,
      question,
      answer,
      createdAt: now,
    };

    await replyRef.set(doc);

    return NextResponse.json({
      success: true,
      reply: { id: replyRef.id, ...doc },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST dolly reply error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}