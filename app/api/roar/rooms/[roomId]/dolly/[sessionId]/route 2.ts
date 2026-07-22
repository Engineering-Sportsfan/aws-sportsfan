// api\roar\rooms\[roomId]\dolly\[sessionId]\route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

async function resolveUser(email: string, userId: string) {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;
  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;
  return { id: info.actualUserId, username: (snap.data() as any)?.username ?? "Fan" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string; sessionId: string }> }) {
  try {
    const { roomId, sessionId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists || sessionDoc.data()?.userId !== resolved.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const snap = await sessionRef.collection("replies").orderBy("createdAt", "asc").limit(100).get();
    const replies = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, replies });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string; sessionId: string }> }) {
  try {
    const { roomId, sessionId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const question = (body?.question as string | undefined)?.trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    if (question.length > 300) return NextResponse.json({ error: "Question too long" }, { status: 400 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists || sessionDoc.data()?.userId !== resolved.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
    if (!PYTHON_AI_URL) return NextResponse.json({ error: "AI service not configured" }, { status: 500 });

    const recentSnap = await sessionRef.collection("replies").orderBy("createdAt", "desc").limit(6).get();
    const history = recentSnap.docs.map(d => d.data()).reverse()
      .flatMap(d => [{ role: "user", content: d.question }, { role: "assistant", content: d.answer }]);

    let answer = "";
    try {
      const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.PYTHON_AI_KEY ?? "" },
        body: JSON.stringify({
          query: question,
          conversation_history: history,
          user_id: resolved.id,
          session_id: sessionId,
        }),
      });
      if (!aiRes.ok) throw new Error(`Python service returned ${aiRes.status}`);
      const data = await aiRes.json();
      answer = data.answer ?? "Sorry, I couldn't find an answer for that.";
    } catch (err) {
      console.error("[dolly] AI call failed:", err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const now = Date.now();
    const replyRef = sessionRef.collection("replies").doc();
    const doc = { question, answer, createdAt: now };
    await replyRef.set(doc);

    // Bump session recency (drives both 7-day windowing and 20-day expiry)
    // and set the title from the first question if this is the first reply.
    const isFirstReply = recentSnap.empty;
    await sessionRef.set(
      { updatedAt: now, ...(isFirstReply ? { title: question.slice(0, 60) } : {}) },
      { merge: true }
    );

    return NextResponse.json({ success: true, reply: { id: replyRef.id, ...doc } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


// PATCH — rename a session
export async function PATCH(req: NextRequest, { params }: { params: { roomId: string; sessionId: string } }) {
  try {
    const { roomId, sessionId } = params;
    const { customTitle } = await req.json();
    if (!customTitle?.trim()) {
      return NextResponse.json({ success: false, error: "customTitle is required" }, { status: 400 });
    }
    await db.collection("roarRooms").doc(roomId)
      .collection("dollySessions").doc(sessionId)
      .update({ customTitle: customTitle.trim(), title: customTitle.trim() });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[dolly] Failed to rename session:", err);
    return NextResponse.json({ success: false, error: "Failed to rename session" }, { status: 500 });
  }
}

// DELETE — soft-delete a session so it drops out of history immediately
export async function DELETE(req: NextRequest, { params }: { params: { roomId: string; sessionId: string } }) {
  try {
    const { roomId, sessionId } = params;
    await db.collection("roarRooms").doc(roomId)
      .collection("dollySessions").doc(sessionId)
      .update({ softDeleted: true, softDeletedAt: Date.now() });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[dolly] Failed to delete session:", err);
    return NextResponse.json({ success: false, error: "Failed to delete session" }, { status: 500 });
  }
}