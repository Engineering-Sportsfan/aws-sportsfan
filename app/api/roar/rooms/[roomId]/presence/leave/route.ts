// // api/roar/[roomId]/presence/leave/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";

// // Handles sendBeacon on tab close (POST only)
// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> },
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     // 1 write only
//     await db.collection("roarRooms").doc(roomId).update({
//       fanCount: FieldValue.increment(-1),
//     });

//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// api/roar/rooms/[roomId]/presence/leave/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";

// Same resolveUser pattern as the parent presence/route.ts and
// messages/route.ts — getUser(req) is auth identity only, the canonical
// doc ID for the presence subcollection has to come from getUserInfo so
// it matches the doc written/deleted by POST and DELETE in presence/route.ts.
async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;
  return { id: info.actualUserId };
}

// Handles sendBeacon on tab close (POST only).
// sendBeacon can't carry auth headers reliably across all browsers, so if
// getUser(req) can't resolve a user here (e.g. cookie not sent on beacon),
// this silently no-ops and the presence doc just expires via the TTL
// cutoff used in GET/POST instead. That's an acceptable fallback — it's
// the same reason the old version also guarded on `if (!user)`.
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

    await db
      .collection("roarRooms")
      .doc(roomId)
      .collection("presence")
      .doc(resolved.id)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}