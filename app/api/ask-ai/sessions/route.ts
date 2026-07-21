// app/api/ask-ai/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

// ── Same canonical resolution pattern used across ROAR (dolly, messages,
// votes) — ensures Ask AI sessions are filed under the same
// users/{actualUserId} as everything else, not a divergent/spoofable ID.
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

// GET: list every Ask AI session for this user, most-recently-updated first.
// Powers the Ask AI "Chat History" panel (mirrors /api/roar/dolly/rooms).
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    const sessionsSnap = await db
      .collection("askaiConversations")
      .doc(resolved.id)
      .collection("sessions")
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();

    if (sessionsSnap.empty) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    // For each session, pull its first user message (title) and last
    // message (subtitle preview) — two small queries per session, but
    // capped at 50 sessions so it stays cheap.
  
const sessions = await Promise.all(
  sessionsSnap.docs.map(async (doc) => {
    const data = doc.data();
    const msgCol = doc.ref.collection("messages");

    const [firstSnap, lastSnap] = await Promise.all([
      msgCol.where("role", "==", "user").orderBy("timestamp", "asc").limit(1).get(),
      msgCol.orderBy("timestamp", "desc").limit(1).get(),
    ]);

    const firstQuestion = firstSnap.docs[0]?.data()?.content as string | undefined;
    const lastMessage = lastSnap.docs[0]?.data()?.content as string | undefined;
    const updatedAtMs = data.updatedAt?.toMillis?.() ?? Date.now();
    const customTitle = data.customTitle as string | undefined;

    return {
      sessionId: doc.id,
      title: customTitle || firstQuestion?.slice(0, 60) || "New chat",
      subtitle: lastMessage?.slice(0, 80) || "",
      dateLabel: new Date(updatedAtMs).toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  })
);

    return NextResponse.json({ success: true, sessions });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[ask-ai GET sessions] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}