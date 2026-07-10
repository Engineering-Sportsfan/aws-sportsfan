
// // app/api/roar/posts/[postId]/likesection/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { getUser } from "@/lib/getUser";
// import { notifyPostReaction, notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";

// type ReactionType = "heart" | "fire" | "mindblown" | "goat" | "clap" | "nochance" | string;

// function getTargetRef(postId: string, roomId?: string) {
//   if (roomId) {
//     return db.collection("roarRooms").doc(roomId).collection("messages").doc(postId);
//   }
//   return db.collection("roarPosts").doc(postId);
// }

// function reactionCountField(reaction: string): string {
//   const map: Record<string, string> = {
//     heart: "heartCount", fire: "fireCount", mindblown: "mindblownCount",
//     goat: "goatCount", clap: "clapCount", nochance: "nochanceCount",
//     laugh: "laughCount", sad: "sadCount", thumb: "thumbCount",
//   };
//   return map[reaction] ?? `${reaction}Count`;
// }

// // ─── POST — add or switch reaction ───────────────────────────────────────────

// export async function POST(
//   req: NextRequest,
//   { params }: { params: { postId: string } }
// ) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const reaction: ReactionType = body.reaction;
//     const roomId: string | undefined = body.roomId;

//     if (!reaction) return NextResponse.json({ error: "reaction is required" }, { status: 400 });

//     const { postId } = params;
//     // userId here is your app's userId (may be email-derived or Firebase UID
//     // depending on how your JWT was minted — used as the reactions map key)
//     const userId = user.userId;
//     const targetRef = getTargetRef(postId, roomId);

//     const snap = await targetRef.get();
//     if (!snap.exists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

//     const data = snap.data()!;
//     const reactions: Record<string, string> = data.reactions ?? {};
//     const previousReaction = reactions[userId] ?? null;
//     const isSameReaction = previousReaction === reaction;

//     // if (isSameReaction) {
//     //   const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
//     //   await targetRef.update({
//     //     [`reactions.${userId}`]: FieldValue.delete(),
//     //     likeCount: newLikeCount,
//     //     [reactionCountField(previousReaction)]: Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1),
//     //   });
//     //   return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });
//     // }

//     if (isSameReaction) {
//       const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
//       await targetRef.update({
//         [`reactions.${userId}`]: FieldValue.delete(),
//         likeCount: newLikeCount,
//         [reactionCountField(previousReaction)]: Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1),
//       });
//       if (roomId) await targetRef.collection("likes").doc(userId).delete();
//       return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });
//     }

//     const update: Record<string, any> = {
//       [`reactions.${userId}`]: reaction,
//       [reactionCountField(reaction)]: (data[reactionCountField(reaction)] ?? 0) + 1,
//     };

//     if (previousReaction) {
//       update[reactionCountField(previousReaction)] = Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1);
//     }

//     const newLikeCount = (data.likeCount ?? 0) + (previousReaction ? 0 : 1);
//     update.likeCount = newLikeCount;

//     await targetRef.update(update);
//     if (roomId) {
//       await targetRef.collection("likes").doc(userId).set({
//         reaction: reaction,
//         reactedAt: Date.now(),
//         userId,
//       });
//     }

//     // Fire notification non-blocking (posts only, not room messages)
//     // if (!roomId) {
//     //   notifyPostReaction(postId, userId, reaction).catch(() => {});
//     // }
//     if (roomId) {
//       notifyRoomMessageReaction(roomId, postId, userId, reaction).catch(() => { });
//     } else {
//       notifyPostReaction(postId, userId, reaction).catch(() => { });
//     }

//     return NextResponse.json({
//       success: true,
//       action: previousReaction ? "switched" : "added",
//       reaction,
//       likeCount: newLikeCount,
//     });
//   } catch (err) {
//     const msg = err instanceof Error ? err.message : "Unexpected error";
//     console.error("[likesection POST]", err);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── DELETE — remove reaction ─────────────────────────────────────────────────

// export async function DELETE(
//   req: NextRequest,
//   { params }: { params: { postId: string } }
// ) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const { searchParams } = new URL(req.url);
//     const roomId = searchParams.get("roomId") ?? undefined;
//     const { postId } = params;
//     const userId = user.userId;
//     const targetRef = getTargetRef(postId, roomId);

//     const snap = await targetRef.get();
//     if (!snap.exists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

//     const data = snap.data()!;
//     const reactions: Record<string, string> = data.reactions ?? {};
//     const previousReaction = reactions[userId] ?? null;

//     if (!previousReaction) {
//       return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: data.likeCount ?? 0 });
//     }

//     // const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
//     // await targetRef.update({
//     //   [`reactions.${userId}`]: FieldValue.delete(),
//     //   likeCount: newLikeCount,
//     //   [reactionCountField(previousReaction)]: Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1),
//     // });

//     // return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });
//     const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
// await targetRef.update({
//   [`reactions.${userId}`]: FieldValue.delete(),
//   likeCount: newLikeCount,
//   [reactionCountField(previousReaction)]: Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1),
// });
// if (roomId) await targetRef.collection("likes").doc(userId).delete();

// return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });

//   } catch (err) {
//     const msg = err instanceof Error ? err.message : "Unexpected error";
//     console.error("[likesection DELETE]", err);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }






// app/api/roar/posts/[postId]/likesection/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { notifyPostReaction, notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";
import { awardRoarPointsByReason } from "@/lib/roarPoints";

type ReactionType = "heart" | "fire" | "mindblown" | "goat" | "clap" | "nochance" | string;

function getTargetRef(postId: string, roomId?: string) {
  if (roomId) {
    return db.collection("roarRooms").doc(roomId).collection("messages").doc(postId);
  }
  return db.collection("roarPosts").doc(postId);
}

function reactionCountField(reaction: string): string {
  const map: Record<string, string> = {
    heart: "heartCount", fire: "fireCount", mindblown: "mindblownCount",
    goat: "goatCount", clap: "clapCount", nochance: "nochanceCount",
    laugh: "laughCount", sad: "sadCount", thumb: "thumbCount",
  };
  return map[reaction] ?? `${reaction}Count`;
}

// ─── POST — add or switch reaction ───────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const reaction: ReactionType = body.reaction;
    const roomId: string | undefined = body.roomId;

    if (!reaction) return NextResponse.json({ error: "reaction is required" }, { status: 400 });

    const { postId } = params;

    // Resolve to the canonical users/{id} doc — same source of truth used by
    // rooms/messages (via resolveUser -> getUserInfo) — so the reactions map
    // key and the likes/{id} doc ID always match the real Firestore user
    // doc, regardless of auth provider (Google vs custom, email-derived vs
    // sanitized-ID accounts, etc). Previously this used the raw user.userId
    // straight off the session, which for some accounts (e.g. Google-auth
    // users where the doc ID doesn't match the JWT's userId field) produced
    // an unresolved ID. That ID then flowed into likes/{userId} and got
    // returned to the client as reactor.userId, which downstream broke
    // "view profile" clicks from the reactions dialog (404 Profile not found).
    const info = await getUserInfo(user.userId, undefined, user.email);
    if (!info.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const userId = info.actualUserId;

    const targetRef = getTargetRef(postId, roomId);

    const snap = await targetRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const data = snap.data()!;
    const reactions: Record<string, string> = data.reactions ?? {};
    const previousReaction = reactions[userId] ?? null;
    const isSameReaction = previousReaction === reaction;
    const postOwnerId: string | undefined = data.authorUid;

    if (isSameReaction) {
      const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
      await targetRef.update({
        [`reactions.${userId}`]: FieldValue.delete(),
        likeCount: newLikeCount,
        [reactionCountField(previousReaction)]: Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1),
      });
      if (roomId) await targetRef.collection("likes").doc(userId).delete();
      if (postOwnerId && postOwnerId !== userId) {
        db.collection("users").doc(postOwnerId).set(
          { [`activityCounts.likesReceived`]: FieldValue.increment(-1) },
          { merge: true }
        ).catch(() => { });
      }
      return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });
    }

    const update: Record<string, any> = {
      [`reactions.${userId}`]: reaction,
      [reactionCountField(reaction)]: (data[reactionCountField(reaction)] ?? 0) + 1,
    };

    if (previousReaction) {
      update[reactionCountField(previousReaction)] = Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1);
    }

    const newLikeCount = (data.likeCount ?? 0) + (previousReaction ? 0 : 1);
    update.likeCount = newLikeCount;

    await targetRef.update(update);
    if (roomId) {
      await targetRef.collection("likes").doc(userId).set({
        reaction: reaction,
        reactedAt: Date.now(),
        userId,
      });
    }



    // ── 1. Reactor's own points (participation: React) ──────────────────────
    // Only on a genuinely new reaction, not a switch or repeat of the same one.
    if (!previousReaction) {
      const info = await getUserInfo(user.userId, undefined, user.email);
      awardRoarPointsByReason({
        actualUserId: userId, // already resolved above
        authUserId: user.userId,
        userName: info.userName,
        userEmail: user.email,
        userExists: info.exists,
        reason: "REACT",
        points: 3, // §3 updated React value
        transactionId: `react_${postId}_${userId}_${roomId ?? "post"}`,
        metadata: { postId, roomId, reaction },
      }).catch(() => { });
    }

    // ── 2. Post owner's Community-ladder counter (likes received) ───────────
    // Separate write, separate doc — not something awardUserPoints touches.
    // Only increment when this reaction is brand new (not a same-reaction
    // toggle-off, and not a reaction-type switch, which is still "1 like" not 2).
    if (postOwnerId && postOwnerId !== userId && !previousReaction) {
      db.collection("users").doc(postOwnerId).set(
        { [`activityCounts.likesReceived`]: FieldValue.increment(1) },
        { merge: true }
      ).catch(() => { });
    }

    // Fire notification non-blocking
    if (roomId) {
      notifyRoomMessageReaction(roomId, postId, userId, reaction).catch(() => { });
    } else {
      notifyPostReaction(postId, userId, reaction).catch(() => { });
    }

    return NextResponse.json({
      success: true,
      action: previousReaction ? "switched" : "added",
      reaction,
      likeCount: newLikeCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[likesection POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — remove reaction ─────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId") ?? undefined;
    const { postId } = params;

    // Same resolution as POST — see comment there.
    const info = await getUserInfo(user.userId, undefined, user.email);
    if (!info.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const userId = info.actualUserId;

    const targetRef = getTargetRef(postId, roomId);

    const snap = await targetRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const data = snap.data()!;
    const reactions: Record<string, string> = data.reactions ?? {};
    const previousReaction = reactions[userId] ?? null;


    if (!previousReaction) {
      return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: data.likeCount ?? 0 });
    }

    const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
    await targetRef.update({
      [`reactions.${userId}`]: FieldValue.delete(),
      likeCount: newLikeCount,
      [reactionCountField(previousReaction)]: Math.max(0, (data[reactionCountField(previousReaction)] ?? 0) - 1),
    });
    if (roomId) await targetRef.collection("likes").doc(userId).delete();
    const postOwnerId: string | undefined = data.authorUid;
    if (postOwnerId && postOwnerId !== userId) {
      db.collection("users").doc(postOwnerId).set(
        { [`activityCounts.likesReceived`]: FieldValue.increment(-1) },
        { merge: true }
      ).catch(() => { });
    }

    return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[likesection DELETE]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}