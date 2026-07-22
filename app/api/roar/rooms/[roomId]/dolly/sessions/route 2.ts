// api/roar/rooms/[roomId]/dolly/sessions/route.ts
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

async function sweepExpiredSessions(roomId: string, userId: string) {
  const cutoff = Date.now() - 20 * 24 * 60 * 60 * 1000;
  const staleSnap = await db
    .collection("roarRooms").doc(roomId).collection("dollySessions")
    .where("userId", "==", userId)
    .where("softDeleted", "==", false)
    .where("updatedAt", "<", cutoff)
    .get();
  if (staleSnap.empty) return;
  const batch = db.batch();
  staleSnap.docs.forEach(doc => batch.update(doc.ref, { softDeleted: true, softDeletedAt: Date.now() }));
  await batch.commit();
}

// Query params:
//   before   — cursor: fetch sessions updated before this timestamp (for "load more")
//   windowDays — defaults to 7; caller widens the window on each scroll page
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    await sweepExpiredSessions(roomId, resolved.id);

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before"); // ms timestamp, exclusive upper bound
    const windowDays = Number(searchParams.get("windowDays") ?? "7");

    const upperBound = before ? Number(before) : Date.now();
    const lowerBound = upperBound - windowDays * 24 * 60 * 60 * 1000;

    const snap = await db
      .collection("roarRooms").doc(roomId).collection("dollySessions")
      .where("userId", "==", resolved.id)
      .where("softDeleted", "==", false)
      .where("updatedAt", "<", upperBound)
      .where("updatedAt", ">=", lowerBound)
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();

    const sessions = snap.docs.map(doc => {
      const d = doc.data();
      return {
        sessionId: doc.id,
        title: d.title ?? "New chat",
        updatedAt: d.updatedAt,
        dateLabel: new Date(d.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }),
      };
    });

    // Tell the client whether this window had anything, so it knows to
    // keep widening (older windows) vs stop.
    const oldestInWindow = sessions.length > 0 ? sessions[sessions.length - 1].updatedAt : lowerBound;

    return NextResponse.json({
      success: true,
      sessions,
      nextBefore: oldestInWindow,   // pass this back as `before` for the next page
      windowDays,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET dolly sessions error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}




export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const now = Date.now();
    const ref = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc();
    await ref.set({
      userId: resolved.id,
      roomId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      softDeleted: false,
      softDeletedAt: null,
    });

    return NextResponse.json({ success: true, sessionId: ref.id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}