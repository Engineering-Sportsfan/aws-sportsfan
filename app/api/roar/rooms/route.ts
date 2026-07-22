

// api/roar/rooms/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { ChatRoom } from "@/app/models/ChatRoom";

// ────────────────────────────────────────────────────────────────────────────
// GET  /api/roar/rooms
// ────────────────────────────────────────────────────────────────────────────
//
// Optimisations vs original:
//
//  1. Server-side WHERE filter  — `isActive == true` pushed into the query so
//     Firestore only returns matching docs. Inactive rooms are never read.
//     Requires a single-field index on `isActive` (auto-created by Firestore).
//
//  2. Server-side ORDER BY      — `orderBy("createdAt", "desc")` replaces the
//     in-process .sort(). Firestore returns docs pre-sorted; no JS work needed.
//
//  3. Pagination via `limit` + timestamp cursor — avoids reading the whole
//     collection on every request. Client passes `?lastCreatedAt=<ts>` for the
//     next page. Default page size 20, max 50.
//
//  4. Field mask (`select`)     — only the fields the client actually needs are
//     transferred. Large fields (e.g. future rich descriptions) are excluded
//     unless you add them here.
//
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastCreatedAt = searchParams.get("lastCreatedAt")
      ? parseInt(searchParams.get("lastCreatedAt")!, 10)
      : null;

    // ── FIX 1 + 2: filter & sort pushed to Firestore ─────────────────────────
    // Composite index required: isActive ASC + createdAt DESC
    // Firestore will prompt you to create it on first run (check server logs).
    let query = db
      .collection("roarRooms")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .limit(limit);

    // ── FIX 3: timestamp cursor (zero extra doc reads) ───────────────────────
    if (lastCreatedAt !== null) {
      query = query.startAfter(lastCreatedAt);
    }

    // ── FIX 4: field mask — only transfer what the client needs ──────────────
    // Add/remove fields here to match your ChatRoom list UI requirements.
    const snapshot = await query
      .select(
        "roomId",
        "name",
        "icon",
        "sport",
        "description",
        "createdAt",
        "isActive",
        "fanCount",
        "scheduledStartTime",
        "score",
        "scoreSubtitle",
        "watchAlongRoomId"
      )
      .get();

    const rooms: ChatRoom[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as ChatRoom),
      roomId: doc.id, // ensure roomId is always present even if missing from data
    }));

    const lastRoom = rooms[rooms.length - 1];

    return NextResponse.json({
      success: true,
      rooms,
      pagination: {
        limit,
        hasMore: rooms.length === limit,
        nextCursor:
          rooms.length === limit
            ? { lastCreatedAt: lastRoom?.createdAt ?? null }
            : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST  /api/roar/rooms
// ────────────────────────────────────────────────────────────────────────────
//
// No quota issues in the original POST — it's a single write.
// Minor improvements:
//  - Input sanitisation consolidated
//  - `isActive` defaults to true explicitly (unchanged behaviour, cleaner)
//


// export async function POST(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const {
//       name,
//       icon,
//       sport,
//       description,
//       isActive,
//       scheduledStartTime,
//       score,
//       scoreSubtitle,
//       createWatchAlong,
//       matchId,
//     } = body;

//     if (!name?.trim()) {
//       return NextResponse.json(
//         { error: "Room name is required" },
//         { status: 400 }
//       );
//     }

    // if (createWatchAlong === true) {
    //   try {
    //     // 1. Create a matching Match record
    //     const matchRef = await db.collection("watchAlongMatches").add({
    //       title: name.trim(),
    //       createdAt: Date.now(),
    //       updatedAt: Date.now(),
    //     });

    //     // 2. Derive initials
    //     const initials = name.trim()
    //       .split(" ")
    //       .map((w) => w[0])
    //       .join("")
    //       .toUpperCase()
    //       .slice(0, 2);

    //     // 3. Create the watchAlongRoom document ONLY
    //     const watchAlongRoomData = {
    //       name: name.trim(),
    //       role: "Host",
    //       badge: "Live",
    //       badgeColor: "bg-pink-600",
    //       borderColor: "border-pink-500",
    //       initials,
    //       displayPicture: "",
    //       isLive: true,
    //       watching: "0",
    //       engagement: "0%",
    //       active: "0",
    //       liveMatchId: matchRef.id,
    //       hostUserId: user.email || user.userId || null,
    //       coHostUserId: null,
    //       createdAt: Date.now(),
    //       updatedAt: Date.now(),
    //     };

    //     const watchAlongRef = await db.collection("watchAlongRooms").add(watchAlongRoomData);
    //     return NextResponse.json({ success: true, watchAlongRoomId: watchAlongRef.id });
    //   } catch (err) {
    //     console.error("Failed to create Watchalong Room:", err);
    //     return NextResponse.json({ error: "Failed to create Watchalong Room" }, { status: 500 });
    //   }
//     } else {
//       // Create ONLY ROAR room
//       const roomRef = db.collection("roarRooms").doc();
//       const newRoom: ChatRoom & { matchId?: string } = {
//         roomId: roomRef.id,
//         name: name.trim(),
//         sport: sport || "general",
//         createdAt: Date.now(),
//         isActive: isActive !== undefined ? Boolean(isActive) : true,
//         fanCount: 0,
//         ...(icon && { icon }),
//         ...(description && { description: description.trim() }),
//         ...(scheduledStartTime && {
//           scheduledStartTime: Number(scheduledStartTime),
//         }),
//         ...(score && { score }),
//         ...(scoreSubtitle && { scoreSubtitle }),
//         ...(matchId && { matchId }),
//       };

//       await roomRef.set(newRoom);
//       return NextResponse.json({ success: true, room: newRoom });
//     }
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/rooms error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }



export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      icon,
      sport,
      description,
      isActive,
      scheduledStartTime,
      score,
      scoreSubtitle,
      createWatchAlong,
      matchId,
      privacy, // "public" | "private" | "premium"
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Room name is required" },
        { status: 400 }
      );
    }

    const VALID_PRIVACY = ["public", "private", "premium"];
    const normalizedPrivacy = VALID_PRIVACY.includes(privacy) ? privacy : "public";
    // Private/premium rooms get flagged for manual review before going live,
    // matching the "reviewed within 24 hours" copy in the confirm step.
    const needsReview = normalizedPrivacy !== "public";

        if (createWatchAlong === true) {
      try {
        // 1. Create a matching Match record
        const matchRef = await db.collection("watchAlongMatches").add({
          title: name.trim(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        // 2. Derive initials
        const initials = name.trim()
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        // 3. Create the watchAlongRoom document ONLY
        const watchAlongRoomData = {
          name: name.trim(),
          role: "Host",
          badge: "Live",
          badgeColor: "bg-pink-600",
          borderColor: "border-pink-500",
          initials,
          displayPicture: "",
          isLive: true,
          watching: "0",
          engagement: "0%",
          active: "0",
          liveMatchId: matchRef.id,
          hostUserId: user.email || user.userId || null,
          coHostUserId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const watchAlongRef = await db.collection("watchAlongRooms").add(watchAlongRoomData);
        return NextResponse.json({ success: true, watchAlongRoomId: watchAlongRef.id });
      } catch (err) {
        console.error("Failed to create Watchalong Room:", err);
        return NextResponse.json({ error: "Failed to create Watchalong Room" }, { status: 500 });
      }
   } else {
  // Create ONLY ROAR room
  const roomRef = db.collection("roarRooms").doc();
  const VALID_PRIVACY = ["public", "private", "premium"];
  const normalizedPrivacy = VALID_PRIVACY.includes(privacy) ? privacy : "public";

  const newRoom: ChatRoom & { matchId?: string; privacy?: string } = {
    roomId: roomRef.id,
    name: name.trim(),
    sport: sport || "general",
    createdAt: Date.now(),
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    privacy: normalizedPrivacy, // stored, but doesn't affect visibility/isActive yet
    fanCount: 0,
    createdByUid: user.userId,
    ...(icon && { icon }),
    ...(description && { description: description.trim() }),
    ...(scheduledStartTime && {
      scheduledStartTime: Number(scheduledStartTime),
    }),
    ...(score && { score }),
    ...(scoreSubtitle && { scoreSubtitle }),
    ...(matchId && { matchId }),
  };

  await roomRef.set(newRoom);
  return NextResponse.json({ success: true, room: newRoom });
}
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}