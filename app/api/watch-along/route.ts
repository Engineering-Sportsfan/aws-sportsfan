import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";
import { getUserSessionAndRole } from "@/lib/auth";

/* ─────────────────────────────────────────────
   GET  /api/watch-along
   Returns all rooms with their related live match
   Query params:
     ?isLive=true        → filter live rooms only
     ?limit=10&page=1    → pagination
   ───────────────────────────────────────────── */
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const isLiveFilter = searchParams.get("isLive");
//     const limit = parseInt(searchParams.get("limit") || "20");
//     const page = parseInt(searchParams.get("page") || "1");

//     let query: FirebaseFirestore.Query = db.collection("watchAlongRooms");

//     if (isLiveFilter === "true") {
//       query = query.where("isLive", "==", true);
//     }

//     // Total count
//     const countSnap = await query.count().get();
//     const totalItems = countSnap.data().count;

//     // Paginated rooms
//     const snapshot = await query
//       .orderBy("createdAt", "desc")
//       .limit(limit)
//       .offset((page - 1) * limit)
//       .get();

//     // For each room, fetch its related live match (if any) in parallel
//     const rooms = await Promise.all(
//       snapshot.docs.map(async (doc) => {
//         const data = doc.data();

//         let liveMatch = null;
//         if (data.liveMatchId) {
//           const matchDoc = await db
//             .collection("watchAlongMatches")
//             .doc(data.liveMatchId)
//             .get();
//           if (matchDoc.exists) {
//             liveMatch = { id: matchDoc.id, ...matchDoc.data() };
//           }
//         }

//         return {
//           id: doc.id,
//           ...data,
//           liveMatch, // nested relation
//         };
//       })
//     );

//     return NextResponse.json({
//       success: true,
//       rooms,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(totalItems / limit),
//         totalItems,
//         itemsPerPage: limit,
//       },
//     });
//   } catch (error) {
//     console.error("[watch-along GET]", error);
//     return NextResponse.json(
//       { success: false, message: "Failed to fetch rooms: " + (error as Error).message },
//       { status: 500 }
//     );
//   }
// }

// Define types for the data structures
interface WatchAlongRoom {
  id: string;
  liveMatchId?: string;
  isLive?: boolean;
  createdAt?: number;
  [key: string]: unknown; // For other dynamic fields
}

interface LiveMatch {
  id: string;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isLiveFilter = searchParams.get("isLive");
    const limit = parseInt(searchParams.get("limit") || "20");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query: FirebaseFirestore.Query = db.collection("watchAlongRooms");

    if (isLiveFilter === "true") {
      query = query.where("isLive", "==", true);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    // Use cursor-based pagination instead of offset
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("watchAlongRooms").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const roomsData: WatchAlongRoom[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as WatchAlongRoom[];

    // Batch fetch all related matches in ONE query instead of N queries
    const liveMatchIds = roomsData
      .map((room) => room.liveMatchId)
      .filter((id): id is string => Boolean(id));

    const matchesMap = new Map<string, LiveMatch>(); // Changed to const
    if (liveMatchIds.length > 0) {
      // Firestore 'in' limit is 30, so batch if needed
      const batchSize = 30;
      for (let i = 0; i < liveMatchIds.length; i += batchSize) {
        const batch = liveMatchIds.slice(i, i + batchSize);
        const matchesSnapshot = await db
          .collection("watchAlongMatches")
          .where("__name__", "in", batch)
          .get();

        matchesSnapshot.docs.forEach((doc) => {
          matchesMap.set(doc.id, { id: doc.id, ...doc.data() } as LiveMatch);
        });
      }
    }

    // Attach matches to rooms
    const rooms = roomsData.map((room) => ({
      ...room,
      liveMatch: room.liveMatchId ? matchesMap.get(room.liveMatchId) || null : null,
    }));

    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      rooms,
      pagination: {
        limit,
        hasMore: rooms.length === limit,
        nextCursor: rooms.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[watch-along GET]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch rooms: " + (error as Error).message },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along
   Creates a new Watch Along room (expert card)
   Body: multipart/form-data
   ───────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin", "host"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const formData = await req.formData();

    // ── Required fields ──
    const name = formData.get("name") as string;
    const role = formData.get("role") as string;
    const badge = formData.get("badge") as string;

    if (!name || !role || !badge) {
      return NextResponse.json(
        { success: false, message: "name, role, and badge are required" },
        { status: 400 }
      );
    }

    // ── Optional fields ──
    const badgeColor = (formData.get("badgeColor") as string) || "bg-pink-600";
    const borderColor = (formData.get("borderColor") as string) || "border-pink-500";
    const isLive = formData.get("isLive") === "true";
    const watching = (formData.get("watching") as string) || "0";
    const engagement = (formData.get("engagement") as string) || "0%";
    const active = (formData.get("active") as string) || "0";
    const liveMatchId = (formData.get("liveMatchId") as string) || null;
    const hostUserId = (formData.get("hostUserId") as string) || user.userId || null;  // Default to authenticated user ID
    const coHostUserId = (formData.get("coHostUserId") as string) || null;  // Optional co-host
    const sport = (formData.get("sport") as string) || "cricket";

    // ── Upload display picture ──
    let displayPicture = "";
    const dpFile = formData.get("displayPicture") as File | null;
    if (dpFile && dpFile.size > 0) {
      const bytes = await dpFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${dpFile.type};base64,${buffer.toString("base64")}`;

      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "watchAlong/experts",
        public_id: `${Date.now()}-${dpFile.name.replace(/\s/g, "_")}`,
      });
      displayPicture = uploaded.secure_url;
    }

    // ── Derive initials from name ──
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    // ── Validate liveMatchId if provided ──
    if (liveMatchId) {
      const matchDoc = await db.collection("watchAlongMatches").doc(liveMatchId).get();
      if (!matchDoc.exists) {
        return NextResponse.json(
          { success: false, message: `liveMatchId "${liveMatchId}" does not exist in watchAlongMatches` },
          { status: 400 }
        );
      }
    }

    // ── Auto-create a Match record if no liveMatchId provided ──
    let resolvedMatchId = liveMatchId;
    if (!resolvedMatchId) {
      const matchRef = await db.collection("watchAlongMatches").add({
        title: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      resolvedMatchId = matchRef.id;
    }

    const roomData = {
      name,
      role,
      badge,
      badgeColor,
      borderColor,
      initials,
      displayPicture,
      isLive,
      watching,
      engagement,
      active,
      liveMatchId: resolvedMatchId,
      hostUserId: hostUserId || null,  // Store creator's user ID
      coHostUserId: coHostUserId || null,  // Optional co-host
      sport,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("watchAlongRooms").add(roomData);

    return NextResponse.json({
      success: true,
      room: { id: docRef.id, ...roomData },
    });
  } catch (error) {
    console.error("[watch-along POST]", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}