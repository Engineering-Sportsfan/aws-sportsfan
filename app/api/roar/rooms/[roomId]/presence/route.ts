// // api/roar/rooms/[roomId]/presence/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { getUserInfo } from "@/lib/userPoints";

// const PRESENCE_TTL_MS = 60_000;

// async function resolveUser(
//   email: string,
//   userId: string
// ): Promise<{ id: string; snap: FirebaseFirestore.DocumentSnapshot } | null> {
//   const info = await getUserInfo(userId, undefined, email);
//   if (!info.exists) return null;

//   const snap = await db.collection("users").doc(info.actualUserId).get();
//   if (!snap.exists) return null;

//   return { id: info.actualUserId, snap };
// }

// // POST — join / heartbeat
// //
// // FIX: previously this never returned pinnedPost, but the client's join()
// // handler unconditionally did setPinnedPost(res.data.pinnedPost ?? null) —
// // since the field was always undefined here, the pin got reset to null on
// // every single page load/refresh, even though it still existed in
// // Firestore. Now resolves the user's pin doc in parallel with the rest of
// // this handler and includes it in the response, so the banner is correct
// // immediately instead of waiting ~2s for the GET refresh.
// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> },
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }
//     const { id: resolvedUserId, snap: userSnap } = resolved;
//     const userData = userSnap.data() as { username: string; badge?: string; avatarUrl?: string };

//     const roomRef = db.collection("roarRooms").doc(roomId);
//     const presenceRef = roomRef.collection("presence").doc(resolvedUserId);
//     const joinedRef = roomRef.collection("joinedUsers").doc(resolvedUserId);
//     const pinRef = roomRef.collection("userPins").doc(resolvedUserId);

//     const [joinedSnap, pinSnap] = await Promise.all([
//       joinedRef.get(),
//       pinRef.get(),
//     ]);
//     const isFirstJoin = !joinedSnap.exists;

//     await presenceRef.set(
//       {
//         uid: resolvedUserId,
//         username: userData.username,
//         avatarUrl: userData.avatarUrl ?? null,
//         badge: userData.badge ?? null,
//         joinedAt: Date.now(),
//         lastSeenAt: Date.now(),
//       },
//       { merge: true },
//     );

//     if (isFirstJoin) {
//       await db.runTransaction(async (tx) => {
//         const roomSnap = await tx.get(roomRef);
//         const prev = roomSnap.exists ? (roomSnap.data()?.totalJoinCount ?? 0) : 0;

//         tx.set(joinedRef, {
//           uid: resolvedUserId,
//           firstJoinedAt: Date.now(),
//         });

//         tx.set(roomRef, { totalJoinCount: prev + 1 }, { merge: true });
//       });
//     }

//     // const cutoff = Date.now() - PRESENCE_TTL_MS;
//     // const activeSnap = await presenceRef.parent
//     //   .where("lastSeenAt", ">=", cutoff)
//     //   .get();

//     // const roomSnap = await roomRef.get();
//     // const totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;

//     // return NextResponse.json({
//     //   success: true,
//     //   fanCount: activeSnap.size,
//     //   totalJoinCount,
//     //   pinnedPost: pinSnap.exists ? pinSnap.data() : null,
//     // });
//     const cutoff = Date.now() - PRESENCE_TTL_MS;
//     const activeSnap = await presenceRef.parent
//       .where("lastSeenAt", ">=", cutoff)
//       .orderBy("lastSeenAt", "desc")
//       .limit(3)
//       .get();

//     const fans = activeSnap.docs.map((d) => {
//       const data = d.data();
//       return {
//         uid: data.uid,
//         username: data.username,
//         avatarUrl: data.avatarUrl ?? null,
//         badge: data.badge ?? null,
//       };
//     });

//     const roomSnap = await roomRef.get();
//     const totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;

//     return NextResponse.json({
//       success: true,
//       fanCount: activeSnap.size, 
//       totalJoinCount,
//       fans,
//       pinnedPost: pinSnap.exists ? pinSnap.data() : null,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // DELETE — explicit leave
// export async function DELETE(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> },
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     await db
//       .collection("roarRooms")
//       .doc(roomId)
//       .collection("presence")
//       .doc(resolved.id)
//       .delete();

//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // GET — list currently active users in the room (most recent first)
// //
// // Also returns the caller's private pinned post for this room
// // (`pinnedPost`, or null). Piggybacks on the request the client already
// // fires (refreshActiveFans, ~2s after join, then every 120s) — no
// // dedicated GET /pin endpoint. Pin doc lives at
// // roarRooms/{roomId}/userPins/{uid}, keyed by the resolved canonical user
// // id, and is only ever read for the requesting user — never exposed in the
// // `fans` list or any other shared response.
// export async function GET(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> },
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const cutoff = Date.now() - PRESENCE_TTL_MS;
//     const snap = await db
//       .collection("roarRooms")
//       .doc(roomId)
//       .collection("presence")
//       .where("lastSeenAt", ">=", cutoff)
//       .orderBy("lastSeenAt", "desc")
//       .get();

//     const fans = snap.docs.map((d) => {
//       const data = d.data();
//       return {
//         uid: data.uid,
//         username: data.username,
//         avatarUrl: data.avatarUrl ?? null,
//         badge: data.badge ?? null,
//       };
//     });

//     const resolved = await resolveUser(user.email, user.userId);
//     const [roomSnap, pinSnap] = await Promise.all([
//       db.collection("roarRooms").doc(roomId).get(),
//       resolved
//         ? db.collection("roarRooms").doc(roomId).collection("userPins").doc(resolved.id).get()
//         : Promise.resolve(null),
//     ]);

//     return NextResponse.json({
//       success: true,
//       fanCount: fans.length,
//       fans,
//       totalJoinCount: roomSnap.data()?.totalJoinCount ?? 0,
//       pinnedPost: pinSnap?.exists ? pinSnap.data() : null,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }





// api/roar/rooms/[roomId]/presence/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import {
  PRESENCE_TTL_MS,
  buildPresencePayload,
  type FanRecord,
} from "./presence.contract";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; snap: FirebaseFirestore.DocumentSnapshot } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  return { id: info.actualUserId, snap };
}

async function getRoomRef(roomId: string) {
  let roomRef = db.collection("roarRooms").doc(roomId);
  let snap = await roomRef.get();
  if (!snap.exists) {
    const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
    const fallbackSnap = await fallbackRef.get();
    if (fallbackSnap.exists) {
      roomRef = fallbackRef;
    }
  }
  return roomRef;
}

// Fetches the full active-presence set for a room (TTL-filtered, no
// `.limit()`) and maps it to FanRecord[] for buildPresencePayload. Both
// POST and GET call this exact function so fanCount/fans can't diverge
// between the two routes, and neither route can accidentally reintroduce
// a `.limit()` before counting (that was the bug: the old POST query
// capped fanCount at 3 by limiting before reading `.size`).
async function fetchActiveFanRecords(
  roomRef: FirebaseFirestore.DocumentReference,
  now: number,
): Promise<FanRecord[]> {
  const cutoff = now - PRESENCE_TTL_MS;
  const snap = await roomRef
    .collection("presence")
    .where("lastSeenAt", ">=", cutoff)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: data.uid,
      username: data.username,
      avatarUrl: data.avatarUrl ?? null,
      badge: data.badge ?? null,
      lastSeenAt: data.lastSeenAt,
    };
  });
}

// POST — join / heartbeat
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const { id: resolvedUserId, snap: userSnap } = resolved;
    const userData = userSnap.data() as { username: string; badge?: string; avatarUrl?: string };

    const roomRef = await getRoomRef(roomId);
    const presenceRef = roomRef.collection("presence").doc(resolvedUserId);
    const joinedRef = roomRef.collection("joinedUsers").doc(resolvedUserId);
    const pinRef = roomRef.collection("userPins").doc(resolvedUserId);

    const [joinedSnap, pinSnap] = await Promise.all([
      joinedRef.get(),
      pinRef.get(),
    ]);
    const isFirstJoin = !joinedSnap.exists;
    const now = Date.now();

    await presenceRef.set(
      {
        uid: resolvedUserId,
        username: userData.username,
        avatarUrl: userData.avatarUrl ?? null,
        badge: userData.badge ?? null,
        joinedAt: now,
        lastSeenAt: now,
      },
      { merge: true },
    );

    if (isFirstJoin) {
      await db.runTransaction(async (tx) => {
        const roomSnap = await tx.get(roomRef);
        const prev = roomSnap.exists ? (roomSnap.data()?.totalJoinCount ?? 0) : 0;

        tx.set(joinedRef, {
          uid: resolvedUserId,
          firstJoinedAt: now,
        });

        if (roomSnap.exists) {
          tx.set(roomRef, { totalJoinCount: prev + 1 }, { merge: true });
        }
      });
    }

    const [activeRecords, roomSnap] = await Promise.all([
      fetchActiveFanRecords(roomRef, now),
      roomRef.get(),
    ]);
    const totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;

    const payload = buildPresencePayload(activeRecords, {
      totalJoinCount,
      pinnedPost: pinSnap.exists ? pinSnap.data() : null,
    });

    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — explicit leave
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const roomRef = await getRoomRef(roomId);
    await roomRef
      .collection("presence")
      .doc(resolved.id)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET — list currently active users in the room (most recent first), plus
// the caller's private pinned post for this room. Pin doc lives at
// roarRooms/{roomId}/userPins/{uid}, keyed by the resolved canonical user
// id, and is only ever read for the requesting user — never exposed in
// the shared `fans` list.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = Date.now();
    const resolved = await resolveUser(user.email, user.userId);
    const roomRef = await getRoomRef(roomId);

    const [activeRecords, roomSnap, pinSnap] = await Promise.all([
      fetchActiveFanRecords(roomRef, now),
      roomRef.get(),
      resolved
        ? roomRef.collection("userPins").doc(resolved.id).get()
        : Promise.resolve(null),
    ]);

    const payload = buildPresencePayload(activeRecords, {
      totalJoinCount: roomSnap.data()?.totalJoinCount ?? 0,
      pinnedPost: pinSnap?.exists ? pinSnap.data() : null,
    });

    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}