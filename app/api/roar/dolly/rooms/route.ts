import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

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
// GET — list every room this user has a private Dolly thread in,
// most-recently-asked first. Powers the Dolly "Chat History" panel.
// ─────────────────────────────────────────────────────────────────────────────
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

    // Collection-group query across every roarRooms/*/dollyReplies —
    // requires a composite index (userId ASC, createdAt DESC) on the
    // "dollyReplies" collection group. Firestore will throw
    // FAILED_PRECONDITION with a console link the first time this runs
    // if the index doesn't exist yet.
    const snap = await db
      .collectionGroup("dollyReplies")
      .where("userId", "==", resolved.id)
      .orderBy("createdAt", "desc")
      .limit(500) // generous cap; we only need the latest per room
      .get();

    // Group by parent room, keep only the most recent reply per room
    // (docs already arrive newest-first thanks to the orderBy above).
    const latestByRoom = new Map<string, { question: string; createdAt: number }>();
    for (const doc of snap.docs) {
      const roomId = doc.ref.parent.parent?.id;
      if (!roomId || latestByRoom.has(roomId)) continue;
      const d = doc.data();
      latestByRoom.set(roomId, { question: d.question, createdAt: d.createdAt });
    }

    const roomIds = Array.from(latestByRoom.keys());
    if (roomIds.length === 0) {
      return NextResponse.json({ success: true, rooms: [] });
    }

    // Firestore 'in' queries cap at 30 — chunk if a user is ever in more
    // rooms than that.
    const chunks: string[][] = [];
    for (let i = 0; i < roomIds.length; i += 30) chunks.push(roomIds.slice(i, i + 30));

    const roomDocs = (
      await Promise.all(
        chunks.map((chunk) =>
          db.collection("roarRooms").where("__name__", "in", chunk).get()
        )
      )
    ).flatMap((s) => s.docs);

    // Carry both name AND sport through so the history UI can show the
    // correct icon (cricket vs football vs general) per past match.
    const roomInfoById = new Map<string, { name: string; sport: string }>();
    roomDocs.forEach((doc) => {
      const data = doc.data() as { name?: string; sport?: string };
      roomInfoById.set(doc.id, {
        name: data?.name ?? "Match",
        sport: data?.sport ?? "general",
      });
    });

    const rooms = roomIds
      .map((roomId) => ({
        roomId,
        title: roomInfoById.get(roomId)?.name ?? "Match",
        sport: roomInfoById.get(roomId)?.sport ?? "general",
        lastQuestion: latestByRoom.get(roomId)!.question,
        lastAskedAt: latestByRoom.get(roomId)!.createdAt,
      }))
      .sort((a, b) => b.lastAskedAt - a.lastAskedAt);

    return NextResponse.json({ success: true, rooms });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET dolly rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}