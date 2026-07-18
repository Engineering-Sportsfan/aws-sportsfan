

// // api/roar/rooms/[roomId]/messages/[msgId]/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import type { RoomMessage } from "@/app/models/RoomMessage";

// // ── Room-level type counters (mirrors of fanCount) ────────────────────────────
// // Kept in sync with the POST route's increment so category badge counts
// // (Posts/Debates/Predictions) stay accurate after a message is deleted.
// const COUNT_FIELD_BY_TYPE: Partial<Record<string, "postCount" | "debateCount" | "predictionCount" | "triviaCount" | "battleCount">> = {
//   post: "postCount",
//   chat: "postCount",
//   debate: "debateCount",
//   prediction: "predictionCount",
//   trivia: "triviaCount",
//   battle: "battleCount",
// };

// export async function DELETE(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; msgId: string }> },
// ) {
//   try {
//     const { roomId, msgId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const roomRef = db.collection("roarRooms").doc(roomId);
//     const msgRef = roomRef.collection("messages").doc(msgId);

//     const snap = await msgRef.get();
//     if (!snap.exists) {
//       return NextResponse.json({ error: "Message not found" }, { status: 404 });
//     }

//     // ── Ownership check ─────────────────────────────────────────────────────
//     // Previously this deleted unconditionally — any authenticated user could
//     // delete any other user's room message by ID. Mirrors the same check
//     // already enforced on feed posts (app/api/posts/[postId]/route.ts):
//     // author or admin only, with the same RESTRICTED_USERS escape hatch for
//     // consistency across both delete paths.
//     const RESTRICTED_USERS = [
//       // "venkyiimb@gmail.com",
//       // "sethi.anshul39@gmail.com"
//       ""
//     ];
//     const message = snap.data() as RoomMessage;
//     if (message.authorUid !== user.userId && user.role !== "admin") {
//       const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
//       if (!isAdmin) {
//         return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//       }
//     }

//     // Atomic batch: delete message + decrement room fan count + type-specific count
//     const countField = COUNT_FIELD_BY_TYPE[message.type];

//     const batch = db.batch();
//     batch.delete(msgRef);
//     batch.update(roomRef, {
//       fanCount: FieldValue.increment(-1),
//       ...(countField && { [countField]: FieldValue.increment(-1) }),
//     });
//     await batch.commit();

//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }


// api/roar/rooms/[roomId]/messages/[msgId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import type { RoomMessage } from "@/app/models/RoomMessage";

// ── Room-level type counters ──
const COUNT_FIELD_BY_TYPE: Partial<Record<string, "postCount" | "debateCount" | "predictionCount" | "triviaCount" | "battleCount">> = {
  post: "postCount",
  chat: "postCount",
  debate: "debateCount",
  prediction: "predictionCount",
  trivia: "triviaCount",
  battle: "battleCount",
};

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> },
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roomRef = db.collection("roarRooms").doc(roomId);
    const msgRef = roomRef.collection("messages").doc(msgId);

    const snap = await msgRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const message = snap.data() as RoomMessage;
    if (message.authorUid !== user.userId && user.role !== "admin") {
      const RESTRICTED_USERS: string[] = [];
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const countField = COUNT_FIELD_BY_TYPE[message.type];

    const batch = db.batch();
    batch.delete(msgRef);
    batch.update(roomRef, {
      fanCount: FieldValue.increment(-1),
      ...(countField && { [countField]: FieldValue.increment(-1) }),
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}