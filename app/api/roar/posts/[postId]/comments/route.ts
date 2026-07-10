

// // api/roar/posts/[postId]/comments/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { getUserInfo } from "@/lib/userPoints";

// // ── Shared user resolver ──────────────────────────────────────────────────────
// // Same resolveUser() pattern as roar/posts/route.ts: goes through
// // getUserInfo() instead of the old local email-then-uid fallback lookup.
// // This guarantees authorUid stamped on a comment is the same canonical
// // users/{uid} doc ID that roar/posts/route.ts's POST stamps on a post —
// // which is what makes the live avatar/badge join in GET below actually
// // reliable, instead of depending on which branch of an old fallback
// // happened to resolve for any given commenter.
// async function resolveUser(
//   email: string,
//   uid: string
// ): Promise<{
//   resolvedId: string;
//   snap: FirebaseFirestore.DocumentSnapshot;
// } | null> {
//   const info = await getUserInfo(uid, undefined, email);
//   if (!info.exists) return null;

//   const snap = await db.collection("users").doc(info.actualUserId).get();
//   if (!snap.exists) return null;

//   return { resolvedId: info.actualUserId, snap };
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // GET  /api/roar/posts/[postId]/comments
// // ─────────────────────────────────────────────────────────────────────────────
// //
// // CHANGED: same live-avatar-join fix as roar/posts/route.ts GET and
// // rooms/[roomId]/messages/route.ts GET. Comments never store
// // authorAvatarUrl at creation time, and authorBadge is only ever a
// // creation-time snapshot — neither field updates if the commenter's
// // profile changes later. Both are now resolved live here, using the same
// // dedupe-then-Promise.all batching pattern as the other two GETs.
// //
// // This join is now reliable for both new AND pre-existing comments whose
// // authorUid happened to resolve to a uid under the old fallback; any
// // comment whose authorUid is a legacy email-string (written before the
// // POST fix below) will still gracefully miss the join and fall back to
// // its stamped-at-creation badge with a null avatar.
// //
// export async function GET(
//   req: NextRequest,
//   { params }: { params: Promise<{ postId: string }> },
// ) {
//   try {
//     const { postId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const snapshot = await db
//       .collection("roarPosts")
//       .doc(postId)
//       .collection("comments")
//       .orderBy("createdAt", "asc")
//       .get();

//     if (snapshot.empty) {
//       return NextResponse.json({ success: true, comments: [] });
//     }

//     // ── Batch-fetch live avatarUrl/badge per unique commenter ────────────────
//     // Same dedupe-then-Promise.all pattern as roar/posts/route.ts GET.
//     const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
//     const uniqueAuthorUids = Array.from(
//       new Set(
//         snapshot.docs
//           .map((d) => (d.data() as any).authorUid as string | undefined)
//           .filter((uid): uid is string => !!uid)
//       )
//     );

//     const authorSnaps = await Promise.all(
//       uniqueAuthorUids.map((uid) => db.collection("users").doc(uid).get())
//     );

//     uniqueAuthorUids.forEach((uid, i) => {
//       const s = authorSnaps[i];
//       const data = s.exists ? (s.data() as any) : null;
//       authorMap.set(uid, {
//         avatarUrl: data?.avatarUrl ?? null,
//         badge: data?.badge ?? null,
//       });
//     });

//     // ── Assemble response ─────────────────────────────────────────────────────
//     const comments = snapshot.docs.map((doc) => {
//       const data = doc.data() as any;
//       const author = data.authorUid ? authorMap.get(data.authorUid) : undefined;

//       return {
//         commentId: doc.id,
//         ...data,
//         // Live-resolved, not stored-on-comment. Null (not a stale fallback)
//         // when the author's user doc has none set, or when authorUid on
//         // this comment doesn't resolve to a users/{uid} doc at all (legacy
//         // email-string authorUid from before the POST fix below).
//         authorAvatarUrl: author?.avatarUrl ?? null,
//         // Falls back to the stamped-at-creation badge only if the live
//         // lookup came back empty/missing, so an old or unresolvable
//         // comment doesn't lose its badge entirely.
//         authorBadge: author?.badge ?? data.authorBadge,
//       };
//     });

//     return NextResponse.json({ success: true, comments });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // export async function POST(
// //   req: NextRequest,
// //   { params }: { params: Promise<{ postId: string }> },
// // ) {
// //   try {
// //     const { postId } = await params;
// //     const user = await getUser(req);
// //     if (!user) {
// //       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// //     }

// //     const body = await req.json();
// //     const { text, roomId } = body;

// //     if (!text?.trim()) {
// //       return NextResponse.json({ error: "text is required" }, { status: 400 });
// //     }

// //     // ── Resolve commenter's user doc ──────────────────────────────────────────
// //     let userSnap = await db.collection("users").doc(user.email).get();
// //     let resolvedUserId = user.email;
// //     if (!userSnap.exists) {
// //       userSnap = await db.collection("users").doc(user.userId).get();
// //       if (userSnap.exists) resolvedUserId = user.userId;
// //     }
// //     if (!userSnap.exists) {
// //       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
// //     }
// //     const userData = userSnap.data() as { username: string; badge: string };

// //     // ── Fetch the post ────────────────────────────────────────────────────────
// //     const postRef = db.collection("roarPosts").doc(postId);
// //     let postSnap = await postRef.get();
// //     if (!postSnap.exists) {
// //       if (roomId) {
// //         const msgSnap = await db.collection("roarRooms").doc(roomId).collection("messages").doc(postId).get();
// //         if (msgSnap.exists) {
// //           const msgData = msgSnap.data() || {};
// //           await postRef.set({
// //             id: postId,
// //             authorUsername: msgData.authorUsername,
// //             authorBadge: msgData.authorBadge || "RISING_FAN",
// //             text: msgData.text,
// //             type: "room_message",
// //             createdAt: msgData.createdAt || Date.now(),
// //             replyCount: 0,
// //             likeCount: 0,
// //           });
// //           postSnap = await postRef.get();
// //         } else {
// //           await postRef.set({
// //             postId,
// //             type: "hot_take",
// //             text: "Mockup post",
// //             createdAt: Date.now(),
// //             updatedAt: Date.now(),
// //             replyCount: 0,
// //           });
// //           postSnap = await postRef.get();
// //         }
// //       } else {
// //         // Direct collectionGroup fallback (for compatibility)
// //         const msgQuery = await db.collectionGroup("messages").where("msgId", "==", postId).limit(1).get();
// //         if (!msgQuery.empty) {
// //           const msgDoc = msgQuery.docs[0];
// //           const msgData = msgDoc.data();
// //           await postRef.set({
// //             id: postId,
// //             authorUsername: msgData.authorUsername,
// //             authorBadge: msgData.authorBadge || "RISING_FAN",
// //             text: msgData.text,
// //             type: "room_message",
// //             createdAt: msgData.createdAt || Date.now(),
// //             replyCount: 0,
// //             likeCount: 0,
// //           });
// //           postSnap = await postRef.get();
// //         } else {
// //           await postRef.set({
// //             postId,
// //             type: "hot_take",
// //             text: "Mockup post",
// //             createdAt: Date.now(),
// //             updatedAt: Date.now(),
// //             replyCount: 0,
// //           });
// //           postSnap = await postRef.get();
// //         }
// //       }
// //     }
// //     const postData = postSnap.data() as {
// //       authorUid: string;
// //       text?: string;
// //     };

// //     // ── Save the comment ──────────────────────────────────────────────────────
// //     const commentRef = postRef.collection("comments").doc();
// //     const newComment = {
// //       commentId: commentRef.id,
// //       authorUid: resolvedUserId,
// //       authorUsername: userData.username,
// //       authorBadge: userData.badge,
// //       text: text.trim(),
// //       heartCount: 0,
// //       createdAt: Date.now(),
// //     };

// //     const batch = db.batch();
// //     batch.set(commentRef, newComment);
// //     batch.update(postRef, {
// //       replyCount: FieldValue.increment(1),
// //       updatedAt: Date.now(),
// //     });
// //     await batch.commit();

// //     // ── Send comment notification to post author (fire-and-forget) ────────────
// //     // Skip if the commenter IS the author
// //     if (postData.authorUid && postData.authorUid !== resolvedUserId) {
// //       (async () => {
// //         try {
// //           // Look up author's email so the notification page can query by email
// //           const authorSnap = await db
// //             .collection("users")
// //             .doc(postData.authorUid)
// //             .get();
// //           const authorEmail = (authorSnap.data() as { email?: string } | undefined)
// //             ?.email;

// //           if (authorEmail) {
// //             await db.collection("notifications").add({
// //               recipientEmail: authorEmail,
// //               recipientUid: postData.authorUid,
// //               type: "roar_post_comment",
// //               postId,                          // ← used for the redirect
// //               commenterUsername: userData.username,
// //               commenterUid: resolvedUserId,
// //               // Short snippet of the post so the card can preview it
// //               postPreview: (postData.text ?? "").slice(0, 80),
// //               message: `${userData.username} commented on your ROAR post`,
// //               isRead: false,
// //               createdAt: Date.now(),
// //               updatedAt: Date.now(),
// //             });
// //           }
// //         } catch (notifErr) {
// //           // Notification failure must never break the comment response
// //           console.error("[roar/comments] Failed to send notification:", notifErr);
// //         }
// //       })();
// //     }

// //     return NextResponse.json({ success: true, comment: newComment });
// //   } catch (error: unknown) {
// //     const msg = error instanceof Error ? error.message : "Unexpected error";
// //     return NextResponse.json({ error: msg }, { status: 500 });
// //   }
// // }



// // ─────────────────────────────────────────────────────────────────────────────
// // POST  /api/roar/posts/[postId]/comments
// // ─────────────────────────────────────────────────────────────────────────────
// //
// // CHANGED: user resolution now goes through resolveUser() (getUserInfo())
// // instead of the old local email-then-uid fallback lookup — same helper
// // roar/posts/route.ts's POST uses. This means a comment's authorUid is now
// // the same canonical users/{uid} doc ID that posts and room messages use,
// // which is what makes GET's live avatar/badge join above actually
// // reliable for comments written from this point forward (pre-existing
// // comments written under the old lookup may still have an email-string
// // authorUid and will gracefully fall back in GET, as noted above).
// //
// // This also fixes a secondary bug: the "skip notification if commenter is
// // the author" check (authorUid !== resolvedUserId) could previously
// // misfire if one side resolved to an email and the other to a uid for the
// // same person. Both sides now resolve the same way, so that comparison is
// // reliable too.
// //
// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ postId: string }> },
// ) {
//   try {
//     const { postId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const { text, roomId } = body;

//     console.log(`[DEBUG] === POST /comments ===`);
//     console.log(`[DEBUG] postId: ${postId}`);
//     console.log(`[DEBUG] roomId: ${roomId}`);
//     console.log(`[DEBUG] text: ${text?.substring(0, 50)}`);

//     if (!text?.trim()) {
//       return NextResponse.json({ error: "text is required" }, { status: 400 });
//     }

//     // ── Resolve commenter's user doc ──────────────────────────────────────────
//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }
//     const { resolvedId: resolvedUserId, snap: userSnap } = resolved;
//     const userData = userSnap.data() as { username: string; badge: string };

//     // ── Fetch the post ────────────────────────────────────────────────────────
//     const postRef = db.collection("roarPosts").doc(postId);
//     let postSnap = await postRef.get();
//     if (!postSnap.exists) {
//       console.log(`[DEBUG] Post ${postId} doesn't exist, creating...`);
//       if (roomId) {
//         const msgSnap = await db.collection("roarRooms").doc(roomId).collection("messages").doc(postId).get();
//         if (msgSnap.exists) {
//           const msgData = msgSnap.data() || {};
//           await postRef.set({
//             id: postId,
//             authorUsername: msgData.authorUsername,
//             authorBadge: msgData.authorBadge || "RISING_FAN",
//             text: msgData.text,
//             type: "room_message",
//             createdAt: msgData.createdAt || Date.now(),
//             replyCount: 0,
//             likeCount: 0,
//           });
//           console.log(`[DEBUG] Created post from room message`);
//         } else {
//           await postRef.set({
//             postId,
//             type: "hot_take",
//             text: "Mockup post",
//             createdAt: Date.now(),
//             updatedAt: Date.now(),
//             replyCount: 0,
//           });
//           console.log(`[DEBUG] Created mock post`);
//         }
//         postSnap = await postRef.get();
//       } else {
//         const msgQuery = await db.collectionGroup("messages").where("msgId", "==", postId).limit(1).get();
//         if (!msgQuery.empty) {
//           const msgDoc = msgQuery.docs[0];
//           const msgData = msgDoc.data();
//           await postRef.set({
//             id: postId,
//             authorUsername: msgData.authorUsername,
//             authorBadge: msgData.authorBadge || "RISING_FAN",
//             text: msgData.text,
//             type: "room_message",
//             createdAt: msgData.createdAt || Date.now(),
//             replyCount: 0,
//             likeCount: 0,
//           });
//           console.log(`[DEBUG] Created post from collectionGroup`);
//         } else {
//           await postRef.set({
//             postId,
//             type: "hot_take",
//             text: "Mockup post",
//             createdAt: Date.now(),
//             updatedAt: Date.now(),
//             replyCount: 0,
//           });
//           console.log(`[DEBUG] Created mock post (fallback)`);
//         }
//         postSnap = await postRef.get();
//       }
//     }
//     const postData = postSnap.data() as {
//       authorUid?: string;
//       text?: string;
//       replyCount?: number;
//     };

//     console.log(`[DEBUG] Current post replyCount: ${postData?.replyCount || 0}`);

//     // ── Save the comment ──────────────────────────────────────────────────────
//     const commentRef = postRef.collection("comments").doc();
//     const newComment = {
//       commentId: commentRef.id,
//       authorUid: resolvedUserId,
//       authorUsername: userData.username,
//       authorBadge: userData.badge,
//       text: text.trim(),
//       heartCount: 0,
//       createdAt: Date.now(),
//     };

//     const batch = db.batch();
//     batch.set(commentRef, newComment);
//     batch.update(postRef, {
//       replyCount: FieldValue.increment(1),
//       updatedAt: Date.now(),
//     });
//     console.log(`[DEBUG] Added post update to batch (replyCount +1)`);

//     // ✅ Update the room message's replyCount if roomId exists
//     if (roomId) {
//       console.log(`[DEBUG] Updating room message...`);
//       const messageRef = db
//         .collection("roarRooms")
//         .doc(roomId)
//         .collection("messages")
//         .doc(postId);

//       const messageSnap = await messageRef.get();
//       console.log(`[DEBUG] Message exists: ${messageSnap.exists}`);

//       if (messageSnap.exists) {
//         const currentData = messageSnap.data();
//         console.log(`[DEBUG] Current room message replyCount: ${currentData?.replyCount || 0}`);
//         batch.update(messageRef, {
//           replyCount: FieldValue.increment(1),
//         });
//         console.log(`[DEBUG] Added room message update to batch (replyCount +1)`);
//       } else {
//         console.log(`[DEBUG] Room message NOT found - creating from post data`);
//         // Create the message document if it doesn't exist
//         const postDataForMessage = postSnap.data();
//         batch.set(messageRef, {
//           msgId: postId,
//           roomId: roomId,
//           authorUid: postDataForMessage?.authorUid || resolvedUserId,
//           authorUsername: postDataForMessage?.authorUsername || userData.username,
//           authorBadge: postDataForMessage?.authorBadge || userData.badge,
//           text: postDataForMessage?.text || text,
//           type: postDataForMessage?.type || "post",
//           fireCount: 0,
//           noChanceCount: 0,
//           heartCount: 0,
//           agreeCount: 0,
//           disagreeCount: 0,
//           replyCount: 1,
//           createdAt: postDataForMessage?.createdAt || Date.now(),
//         });
//         console.log(`[DEBUG] Created new room message with replyCount: 1`);
//       }
//     } else {
//       console.log(`[DEBUG] No roomId provided - skipping room message update`);
//     }

//     console.log(`[DEBUG] Committing batch...`);
//     await batch.commit();
//     console.log(`[DEBUG] Batch committed successfully!`);

//     // ── Send comment notification to post author (fire-and-forget) ────────────
//     // authorUid !== resolvedUserId is now a reliable comparison since both
//     // are resolved via the same getUserInfo()-based path.
//     const authorUid = postData.authorUid;
//     if (authorUid && authorUid !== resolvedUserId) {
//       (async () => {
//         try {
//           const authorSnap = await db
//             .collection("users")
//             .doc(authorUid)
//             .get();
//           const authorEmail = (authorSnap.data() as { email?: string } | undefined)
//             ?.email;

//           if (authorEmail) {
//             await db.collection("notifications").add({
//               recipientEmail: authorEmail,
//               recipientUid: authorUid,
//               type: "roar_post_comment",
//               postId,
//               commenterUsername: userData.username,
//               commenterUid: resolvedUserId,
//               postPreview: (postData.text ?? "").slice(0, 80),
//               message: `${userData.username} commented on your ROAR post`,
//               isRead: false,
//               createdAt: Date.now(),
//               updatedAt: Date.now(),
//             });
//             console.log(`[DEBUG] Notification sent to ${authorEmail}`);
//           }
//         } catch (notifErr) {
//           console.error("[roar/comments] Failed to send notification:", notifErr);
//         }
//       })();
//     } else {
//       console.log(`[DEBUG] No notification sent (authorUid: ${authorUid || 'missing'}, same user: ${authorUid === resolvedUserId})`);
//     }

//     return NextResponse.json({ success: true, comment: newComment });
//   } catch (error: unknown) {
//     console.error(`[ERROR] in POST /comments:`, error);
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }







// app/api/roar/posts/[postId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { notifyPostComment, notifyRoomMessageComment } from "@/lib/roarNotifyHelpers";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const { postId } = params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const lastCreatedAt = searchParams.get("lastCreatedAt")
      ? parseInt(searchParams.get("lastCreatedAt")!)
      : null;

    let query = db
      .collection("roarPosts")
      .doc(postId)
      .collection("comments")
      .orderBy("createdAt", "desc")
      .limit(limit) as FirebaseFirestore.Query;

    if (lastCreatedAt) query = query.startAfter(lastCreatedAt);

    const snap = await query.get();
    const comments = snap.docs.map((doc) => ({ id: doc.id, commentId: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, comments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const text: string = (body.text ?? "").trim();
    const roomId: string | undefined = body.roomId;
    const parentCommentId: string | undefined = body.parentCommentId;

    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const { postId } = params;

    // Resolve username from roarProfile, fall back to name or email prefix
    const username = await resolveUsername(user.userId, user.name, user.email);

    const now = Date.now();
    // const commentRef = db
    //   .collection("roarPosts")
    //   .doc(postId)
    //   .collection("comments")
    //   .doc();

    // await commentRef.set({
    //   commentId: commentRef.id,
    //   text,
    //   authorUid: user.userId,
    //   authorEmail: user.email,
    //   authorUsername: username,
    //   createdAt: now,
    //   ...(roomId ? { roomId } : {}),
    //   ...(parentCommentId ? { parentCommentId } : {}),
    // });

    // // Increment replyCount on the post (non-fatal if it fails)
    // db.collection("roarPosts")
    //   .doc(postId)
    //   .update({ replyCount: FieldValue.increment(1) })
    //   .catch(() => { });


    const isRoomMessage = !!roomId;

const commentRef = isRoomMessage
  ? db.collection("roarRooms").doc(roomId).collection("messages").doc(postId).collection("comments").doc()
  : db.collection("roarPosts").doc(postId).collection("comments").doc();

await commentRef.set({
  text,
  authorUid: user.userId,
  authorEmail: user.email,
  authorUsername: username,
  createdAt: now,
  ...(roomId ? { roomId } : {}),
});

// Increment replyCount on the correct parent doc
const parentRef = isRoomMessage
  ? db.collection("roarRooms").doc(roomId).collection("messages").doc(postId)
  : db.collection("roarPosts").doc(postId);

parentRef.update({ replyCount: FieldValue.increment(1) }).catch(() => {});


    // Notify post author (non-blocking)
    // notifyPostComment(postId, user.userId, user.email, username, text.slice(0, 80)).catch(() => {});
    if (roomId) {
      notifyRoomMessageComment(roomId, postId, user.userId, user.email, username, text.slice(0, 80)).catch(() => { });
    } else {
      notifyPostComment(postId, user.userId, user.email, username, text.slice(0, 80)).catch(() => { });
    }

    return NextResponse.json({
      success: true,
      commentId: commentRef.id,
      comment: {
        id: commentRef.id,
        commentId: commentRef.id,
        text,
        authorUid: user.userId,
        authorUsername: username,
        parentCommentId: parentCommentId || null,
        roomId,
        createdAt: now,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[comments POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveUsername(userId: string, name: string, email: string): Promise<string> {
  try {
    const snap = await db.collection("roarProfiles").doc(userId).get();
    if (snap.exists) {
      const d = snap.data()!;
      if (d.username) return d.username as string;
    }
  } catch { /* ignore */ }
  return name || email.split("@")[0];
}
