// // api/roar/posts/[postId]/reactions/route.ts
// // GET  /api/roar/posts/:postId/reactions
// //
// // Returns the list of users who reacted and what reaction they gave,
// // sorted most-recent first. Used by ReactionsDialog (LinkedIn-style viewer).
// //
// // Firestore structure:
// //   roarPosts/{postId}/likes/{userId}
// //     { reaction: "heart"|"fire"|"laugh"|"sad"|"thumb", reactedAt: number, userId: string }
// //
// // Quota cost per request:
// //   1      — user auth
// //   1      — roarPost doc (existence check)
// //   N      — likes subcollection docs (up to `limit`, default 100)
// //   M      — user profile docs (batch, parallel)
// //   ─────────────────────────────────────────────
// //   2 + N + M  reads total

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";

// export async function GET(
//   req: NextRequest,
//   { params }: { params: { postId: string } }
// ) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const { postId } = params;
//     if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

//     const { searchParams } = new URL(req.url);
//     const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

//     // Existence check — one read, also lets us return 404 cleanly
//     const postSnap = await db.collection("roarPosts").doc(postId).get();
//     if (!postSnap.exists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

//     // ── Fetch likes, newest first ─────────────────────────────────────────────
//     // orderBy("reactedAt", "desc") requires a single-field index on reactedAt
//     // (auto-created by Firestore on first query).
//     const likesSnap = await db
//       .collection("roarPosts")
//       .doc(postId)
//       .collection("likes")
//       .orderBy("reactedAt", "desc")
//       .limit(limit)
//       .get();

//     if (likesSnap.empty) return NextResponse.json({ success: true, reactors: [], total: 0 });

//     // ── Batch-fetch user profiles in parallel ─────────────────────────────────
//     const userIds = likesSnap.docs.map((d) => d.id);
//     const profileSnaps = await Promise.all(
//       userIds.map((uid) => db.collection("users").doc(uid).get())
//     );

//     const reactors = likesSnap.docs.map((likeDoc, idx) => {
//       const likeData = likeDoc.data() as { reaction?: string; reactedAt?: number };
//       const profile  = profileSnaps[idx].data() as { username?: string; avatarUrl?: string; badge?: string } | undefined;

//       return {
//         userId:     likeDoc.id,
//         username:   profile?.username  ?? likeDoc.id,
//         avatarUrl:  profile?.avatarUrl ?? undefined,
//         badge:      profile?.badge     ?? "RISING_FAN",
//         reaction:   likeData.reaction  ?? "heart",  // legacy docs default to heart
//         reactedAt:  likeData.reactedAt ?? 0,
//       };
//     });

//     return NextResponse.json({ success: true, reactors, total: reactors.length });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error(`GET /api/roar/posts/${params.postId}/reactions error:`, error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }






// api/roar/posts/[postId]/reactions/route.ts
// GET  /api/roar/posts/:postId/reactions
// GET  /api/roar/posts/:postId/reactions?roomId=xyz   (NEW — room messages)
//
// Returns the list of users who reacted and what reaction they gave,
// sorted most-recent first. Used by ReactionsDialog (LinkedIn-style viewer).
//
// Firestore structure (post, default):
//   roarPosts/{postId}/likes/{userId}
//     { reaction: "heart"|"fire"|"laugh"|"sad"|"thumb", reactedAt: number, userId: string }
//
// Firestore structure (room message, when roomId is provided):
//   roarRooms/{roomId}/messages/{postId}/likes/{userId}
//     same shape as above — only the parent doc differs.
//
// Quota cost per request:
//   1      — user auth
//   1      — parent doc (post or room message) existence check
//   N      — likes subcollection docs (up to `limit`, default 100)
//   M      — user profile docs (batch, parallel)
//   ─────────────────────────────────────────────
//   2 + N + M  reads total

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

export async function GET(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { postId } = params;
    if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);
    const roomId = searchParams.get("roomId") || undefined;

    // ── Resolve parent doc — post or room message ───────────────────────────
    const parentRef = roomId
      ? db.collection("roarRooms").doc(roomId).collection("messages").doc(postId)
      : db.collection("roarPosts").doc(postId);

    // Existence check — one read, also lets us return 404 cleanly
    const parentSnap = await parentRef.get();
    if (!parentSnap.exists) {
      return NextResponse.json({ error: roomId ? "Message not found" : "Post not found" }, { status: 404 });
    }

    // ── Fetch likes, newest first ─────────────────────────────────────────────
    // orderBy("reactedAt", "desc") requires a single-field index on reactedAt
    // (auto-created by Firestore on first query).
    const likesSnap = await parentRef
      .collection("likes")
      .orderBy("reactedAt", "desc")
      .limit(limit)
      .get();

    if (likesSnap.empty) return NextResponse.json({ success: true, reactors: [], total: 0 });

    // ── Batch-fetch user profiles in parallel ─────────────────────────────────
    const userIds = likesSnap.docs.map((d) => d.id);
    const profileSnaps = await Promise.all(
      userIds.map((uid) => db.collection("users").doc(uid).get())
    );

    const reactors = likesSnap.docs.map((likeDoc, idx) => {
      const likeData = likeDoc.data() as { reaction?: string; reactedAt?: number };
      const profile  = profileSnaps[idx].data() as { username?: string; avatarUrl?: string; badge?: string } | undefined;

      return {
        userId:     likeDoc.id,
        username:   profile?.username  ?? likeDoc.id,
        avatarUrl:  profile?.avatarUrl ?? undefined,
        badge:      profile?.badge     ?? "RISING_FAN",
        reaction:   likeData.reaction  ?? "heart",  // legacy docs default to heart
        reactedAt:  likeData.reactedAt ?? 0,
      };
    });

    return NextResponse.json({ success: true, reactors, total: reactors.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error(`GET /api/roar/posts/${params.postId}/reactions error:`, error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}