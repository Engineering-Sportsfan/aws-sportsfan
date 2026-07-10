// api/roar/rooms/presence-preview/route.ts
//
// Batch lookup used by RoomsHome: given a list of roomIds, returns the
// top 3 active fans + total active count per room, so the room list can
// render stacked avatars without firing one request per room card.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

const PRESENCE_TTL_MS = 60_000;
const PREVIEW_COUNT = 3;

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomIds } = await req.json();
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return NextResponse.json({ success: true, rooms: {} });
    }

    const cutoff = Date.now() - PRESENCE_TTL_MS;

    const entries = await Promise.all(
      roomIds.map(async (roomId: string) => {
        const snap = await db
          .collection("roarRooms")
          .doc(roomId)
          .collection("presence")
          .where("lastSeenAt", ">=", cutoff)
          .orderBy("lastSeenAt", "desc")
          .limit(PREVIEW_COUNT)
          .get();

        // A second, count-only query would be more correct for fanCount
        // when active users exceed PREVIEW_COUNT, but Firestore doesn't
        // give us a free count from the limited query above, so we run
        // a lightweight aggregate count() query instead of pulling all docs.
        const countSnap = await db
          .collection("roarRooms")
          .doc(roomId)
          .collection("presence")
          .where("lastSeenAt", ">=", cutoff)
          .count()
          .get();

          const roomSnap = await db.collection("roarRooms").doc(roomId).get();
const totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;




        const fans = snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: data.uid,
            username: data.username,
            avatarUrl: data.avatarUrl ?? null,
            badge: data.badge ?? null,
          };
        });

        // return [roomId, { fanCount: countSnap.data().count, fans }] as const;
        return [roomId, { fanCount: countSnap.data().count, fans, totalJoinCount }] as const;
      }),
    );

    return NextResponse.json({
      success: true,
      rooms: Object.fromEntries(entries),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}