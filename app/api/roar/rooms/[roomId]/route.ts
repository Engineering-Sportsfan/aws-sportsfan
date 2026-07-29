//rooms/[roomId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { ChatRoom } from "@/app/models/ChatRoom";

// export async function GET(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> },
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     // Mirror the fallback pattern used in the presence route — some rooms
//     // live in `watchAlongRooms` instead of `roarRooms`.
//     let roomRef = db.collection("roarRooms").doc(roomId);
//     let snap = await roomRef.get();
//     if (!snap.exists) {
//       const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
//       const fallbackSnap = await fallbackRef.get();
//       if (fallbackSnap.exists) {
//         roomRef = fallbackRef;
//         snap = fallbackSnap;
//       }
//     }

//     if (!snap.exists) {
//       return NextResponse.json({ error: "Room not found" }, { status: 404 });
//     }

//     const room: ChatRoom = {
//       ...(snap.data() as ChatRoom),
//       roomId: snap.id,
//     };

//     return NextResponse.json({ success: true, room });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }


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

    // Mirror the fallback pattern used in the presence route — some rooms
    // live in `watchAlongRooms` instead of `roarRooms`.
    let roomRef = db.collection("roarRooms").doc(roomId);
    let snap = await roomRef.get();
    if (!snap.exists) {
      const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
      const fallbackSnap = await fallbackRef.get();
      if (fallbackSnap.exists) {
        roomRef = fallbackRef;
        snap = fallbackSnap;
      }
    }

    if (!snap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room: ChatRoom = {
      ...(snap.data() as ChatRoom),
      roomId: snap.id,
    };

    // matchStartAt/matchEndAt only ever get written onto the predictions_live
    // message doc (see POST /messages route), never onto the room doc itself —
    // fetch it directly rather than making callers scan paginated messages.
    try {
      const predictionsSnap = await roomRef
        .collection("messages")
        .where("type", "==", "predictions_live")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!predictionsSnap.empty) {
        const predictionsData = predictionsSnap.docs[0].data() as any;
        (room as any).matchStartAt = predictionsData.matchStartAt ?? null;
        (room as any).matchEndAt = predictionsData.matchEndAt ?? null;
      }
    } catch (predictionsErr) {
      // Don't fail the whole room fetch if this lookup has issues (e.g.
      // missing composite index) — just log and return the room without it.
      console.error(`Failed to fetch predictions_live for room ${roomId}:`, predictionsErr);
    }

    return NextResponse.json({ success: true, room });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Optional: add admin role check if desired, e.g., if user.role !== "admin"

    await db.collection("roarRooms").doc(roomId).delete();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
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
    const updateData: Record<string, any> = {};

    if (body.matchId !== undefined) {
      updateData.matchId = body.matchId;
    }

    await db.collection("roarRooms").doc(roomId).update(updateData);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
