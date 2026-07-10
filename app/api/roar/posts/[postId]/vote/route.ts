

// // api/roar/posts/[postId]/vote/route.ts
// //
// // Handles agree / disagree votes on ROAR posts.
// // After recording the vote it upserts a single grouped "like" notification
// // document per post so the author sees "X and N others liked your post"
// // instead of one document per voter.

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { getUserInfo } from "@/lib/userPoints";
// import { FieldValue } from "firebase-admin/firestore";

// // ─── Helper: build the grouped like message ──────────────────────────────────

// function buildLikeMessage(likerNames: string[], likerCount: number): string {
//   if (likerCount === 1) {
//     return `${likerNames[0]} liked your ROAR post`;
//   }
//   const othersCount = likerCount - 1;
//   return `${likerNames[0]} and ${othersCount} other${othersCount > 1 ? "s" : ""} liked your ROAR post`;
// }

// // ─── Helper: upsert the grouped notification ─────────────────────────────────
// // Uses a stable doc ID derived from the postId so all likes on the same post
// // accumulate in one document rather than creating a new document per vote.

// async function upsertLikeNotification({
//   postId,
//   postAuthorUid,
//   postAuthorEmail,
//   postPreview,
//   likerUsername,
//   likerUid,
// }: {
//   postId: string;
//   postAuthorUid: string;
//   postAuthorEmail: string;
//   postPreview: string;
//   likerUsername: string;
//   likerUid: string;
// }) {
//   // Don't notify if the author is voting on their own post
//   if (likerUid === postAuthorUid) return;

//   // One stable document per post — all likes merge here
//   const notifId = `roar_like_${postId}`;
//   const notifRef = db.collection("notifications").doc(notifId);

//   await db.runTransaction(async (tx) => {
//     const snap = await tx.get(notifRef);

//     if (!snap.exists) {
//       // ── First like on this post ──────────────────────────────────────────
//       tx.set(notifRef, {
//         recipientEmail: postAuthorEmail,
//         recipientUid: postAuthorUid,
//         type: "roar_post_like",
//         postId,
//         postPreview,
//         likerNames: [likerUsername],   // latest liker first
//         likerCount: 1,
//         message: buildLikeMessage([likerUsername], 1),
//         isRead: false,
//         createdAt: Date.now(),
//         updatedAt: Date.now(),
//       });
//     } else {
//       // ── Subsequent like ──────────────────────────────────────────────────
//       const data = snap.data()!;
//       const existing: string[] = data.likerNames ?? [];

//       // Skip if this user already appears (e.g. they un-voted then re-voted)
//       if (existing.includes(likerUsername)) return;

//       // Keep at most 3 names for the display; always show the newest first
//       const updatedNames = [likerUsername, ...existing].slice(0, 3);
//       const newCount = (data.likerCount ?? 1) + 1;

//       tx.update(notifRef, {
//         likerNames: updatedNames,
//         likerCount: newCount,
//         message: buildLikeMessage(updatedNames, newCount),
//         isRead: false,        // re-surface as unread on every new like
//         updatedAt: Date.now(),
//       });
//     }
//   });
// }

// // ─── POST /api/roar/posts/[postId]/vote ──────────────────────────────────────

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
//     // vote: "agree" | "disagree" | null  (null = remove vote)
//     const { vote }: { vote: "agree" | "disagree" | null } = body;

//     if (vote !== "agree" && vote !== "disagree" && vote !== null) {
//       return NextResponse.json(
//         { error: "vote must be 'agree', 'disagree', or null" },
//         { status: 400 },
//       );
//     }

//     // ── Resolve the voter ─────────────────────────────────────────────────────
//     const { actualUserId, userName: resolvedName } = await getUserInfo(
//       user.userId,
//       user.name,
//       user.email,
//     );

//     const postRef = db.collection("roarPosts").doc(postId);
//     const voteRef = postRef.collection("roarVotes").doc(actualUserId);

//     // ── Read current state ────────────────────────────────────────────────────
//     const [postSnap, voteSnap] = await Promise.all([
//       postRef.get(),
//       voteRef.get(),
//     ]);

//     if (!postSnap.exists) {
//       return NextResponse.json({ error: "Post not found" }, { status: 404 });
//     }

//     const postData = postSnap.data() as {
//       authorUid: string;
//       agreeCount: number;
//       disagreeCount: number;
//       text?: string;
//     };

//     const previousVote = voteSnap.exists
//       ? (voteSnap.data() as { vote: string }).vote
//       : null;

//     const postType = (postData as any).type;
//     if (postType === "debate" && previousVote !== null && vote !== null) {
//       return NextResponse.json(
//         { success: false, error: "Already voted on this debate", userVote: previousVote },
//         { status: 409 },
//       );
//     }

//     // ── Build Firestore counter deltas ────────────────────────────────────────
//     const agreeData =
//       (vote === "agree" ? 1 : 0) - (previousVote === "agree" ? 1 : 0);
//     const disagreeData =
//       (vote === "disagree" ? 1 : 0) - (previousVote === "disagree" ? 1 : 0);

//     // ── Persist vote + post counters atomically ───────────────────────────────
//     const batch = db.batch();

//     if (vote === null) {
//       batch.delete(voteRef);
//     } else {
//       batch.set(voteRef, { vote, votedAt: now }, { merge: true });
//     }

//     batch.update(postRef, {
//       agreeCount: FieldValue.increment(agreeData),
//       disagreeCount: FieldValue.increment(disagreeData),
//       updatedAt: Date.now(),
//     });

//     await batch.commit();

//     // ── Grouped like notification (fire-and-forget, only on "agree") ──────────
//     if (vote === "agree" && previousVote !== "agree") {
//       (async () => {
//         try {
//           // Fetch author email for the notification query key
//           const authorSnap = await db
//             .collection("users")
//             .doc(postData.authorUid)
//             .get();
//           const authorEmail = (
//             authorSnap.data() as { email?: string } | undefined
//           )?.email;

//           if (authorEmail) {
//             await upsertLikeNotification({
//               postId,
//               postAuthorUid: postData.authorUid,
//               postAuthorEmail: authorEmail,
//               postPreview: (postData.text ?? "").slice(0, 80),
//               likerUsername: resolvedName,
//               likerUid: actualUserId,
//             });
//           }
//         } catch (notifErr) {
//           console.error("[roar/vote] Failed to upsert like notification:", notifErr);
//         }
//       })();
//     }

//     return NextResponse.json({
//       success: true,
//       vote,
//       agreeCount: (postData.agreeCount ?? 0) + agreeData,
//       disagreeCount: (postData.disagreeCount ?? 0) + disagreeData,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/posts/[postId]/vote error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }





// api/roar/posts/[postId]/vote/route.ts
//
// Handles agree / disagree votes on ROAR posts.
// After recording the vote it upserts a single grouped "like" notification
// document per post so the author sees "X and N others liked your post"
// instead of one document per voter.
//
// It also awards ROAR_DEBATE_PARTICIPATE points (separate from the
// ROAR_DEBATE points a user gets for CREATING a debate) the first time a
// user casts a vote on a debate-type post. These are tracked as two
// distinct activityCounts keys — see lib/userPoints.ts / lib/roarPoints.ts.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { awardRoarPointsByReason, ROAR_EVENT_POINTS } from "@/lib/roarPoints";
import { FieldValue } from "firebase-admin/firestore";

// ─── Helper: build the grouped like message ──────────────────────────────────

function buildLikeMessage(likerNames: string[], likerCount: number): string {
  if (likerCount === 1) {
    return `${likerNames[0]} liked your ROAR post`;
  }
  const othersCount = likerCount - 1;
  return `${likerNames[0]} and ${othersCount} other${othersCount > 1 ? "s" : ""} liked your ROAR post`;
}

// ─── Helper: upsert the grouped notification ─────────────────────────────────
// Uses a stable doc ID derived from the postId so all likes on the same post
// accumulate in one document rather than creating a new document per vote.

async function upsertLikeNotification({
  postId,
  postAuthorUid,
  postAuthorEmail,
  postPreview,
  likerUsername,
  likerUid,
}: {
  postId: string;
  postAuthorUid: string;
  postAuthorEmail: string;
  postPreview: string;
  likerUsername: string;
  likerUid: string;
}) {
  // Don't notify if the author is voting on their own post
  if (likerUid === postAuthorUid) return;

  // One stable document per post — all likes merge here
  const notifId = `roar_like_${postId}`;
  const notifRef = db.collection("notifications").doc(notifId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(notifRef);

    if (!snap.exists) {
      // ── First like on this post ──────────────────────────────────────────
      tx.set(notifRef, {
        recipientEmail: postAuthorEmail,
        recipientUid: postAuthorUid,
        type: "roar_post_like",
        postId,
        postPreview,
        likerNames: [likerUsername],   // latest liker first
        likerCount: 1,
        message: buildLikeMessage([likerUsername], 1),
        isRead: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      // ── Subsequent like ──────────────────────────────────────────────────
      const data = snap.data()!;
      const existing: string[] = data.likerNames ?? [];

      // Skip if this user already appears (e.g. they un-voted then re-voted)
      if (existing.includes(likerUsername)) return;

      // Keep at most 3 names for the display; always show the newest first
      const updatedNames = [likerUsername, ...existing].slice(0, 3);
      const newCount = (data.likerCount ?? 1) + 1;

      tx.update(notifRef, {
        likerNames: updatedNames,
        likerCount: newCount,
        message: buildLikeMessage(updatedNames, newCount),
        isRead: false,        // re-surface as unread on every new like
        updatedAt: Date.now(),
      });
    }
  });
}

// ─── POST /api/roar/posts/[postId]/vote ──────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    // vote: "agree" | "disagree" | "option_N" | null  (null = remove vote)
    const { vote }: { vote: string | null } = body;

    if (vote !== null && typeof vote !== "string") {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    // ── Resolve the voter ─────────────────────────────────────────────────────
    const { actualUserId, authUserId, userName: resolvedName, userEmail, exists: userExists } =
      await getUserInfo(user.userId, user.name, user.email);

    const postRef = db.collection("roarPosts").doc(postId);
    const voteRef = postRef.collection("roarVotes").doc(actualUserId);

    // ── Read current state ────────────────────────────────────────────────────
    const [postSnap, voteSnap] = await Promise.all([
      postRef.get(),
      voteRef.get(),
    ]);

    if (!postSnap.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const postData = postSnap.data() as {
      authorUid: string;
      agreeCount: number;
      disagreeCount: number;
      text?: string;
      type?: string;
      closesAt?: number;
      closedAt?: number;
      resolvedAt?: number;
      predictionOptions?: string[];
    };

    const previousVote = voteSnap.exists
      ? (voteSnap.data() as { vote: string }).vote
      : null;
    const postType = postData.type;
    const optionVoteMatch = typeof vote === "string" ? /^option_(\d+)$/.exec(vote) : null;
    if (vote !== null && vote !== "agree" && vote !== "disagree" && !optionVoteMatch) {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }
    if (optionVoteMatch) {
      const optionIndex = Number(optionVoteMatch[1]);
      if (postType !== "prediction" || !Array.isArray(postData.predictionOptions) || optionIndex < 2 || optionIndex >= postData.predictionOptions.length) {
        return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
      }
    }
    const now = Date.now();
    if (postType === "prediction" && (postData.resolvedAt || postData.closedAt || (postData.closesAt && postData.closesAt <= now)) && vote !== null) {
      if (!postData.closedAt && postData.closesAt && postData.closesAt <= now) {
        await postRef.update({ closedAt: now, updatedAt: now });
      }
      return NextResponse.json({ success: false, error: "Prediction poll is closed" }, { status: 409 });
    }

    if (postType === "debate" && previousVote !== null && vote !== null) {
      return NextResponse.json(
        { success: false, error: "Already voted on this debate", userVote: previousVote },
        { status: 409 },
      );
    }

    // ── Build Firestore counter deltas ────────────────────────────────────────
    const agreeData =
      (vote === "agree" ? 1 : 0) - (previousVote === "agree" ? 1 : 0);
    const disagreeData =
      (vote === "disagree" ? 1 : 0) - (previousVote === "disagree" ? 1 : 0);
    const predictionOptionCountUpdates: Record<string, unknown> = {};
    if (typeof previousVote === "string" && previousVote.startsWith("option_")) {
      predictionOptionCountUpdates[`predictionOptionCounts.${previousVote}`] = FieldValue.increment(-1);
    }
    if (typeof vote === "string" && vote.startsWith("option_")) {
      predictionOptionCountUpdates[`predictionOptionCounts.${vote}`] = FieldValue.increment(1);
    }

    // ── Persist vote + post counters atomically ───────────────────────────────
    const batch = db.batch();

    if (vote === null) {
      batch.delete(voteRef);
    } else {
      batch.set(voteRef, { vote, votedAt: now }, { merge: true });
    }

    batch.update(postRef, {
      agreeCount: FieldValue.increment(agreeData),
      disagreeCount: FieldValue.increment(disagreeData),
      ...predictionOptionCountUpdates,
      updatedAt: Date.now(),
    });

    await batch.commit();

    // ── Award debate-participation points (fire-and-forget) ───────────────────
    // ROAR_DEBATE_PARTICIPATE is a SEPARATE counter from ROAR_DEBATE (the
    // points/count a user gets for CREATING a debate, awarded elsewhere at
    // post-creation time via awardRoarPoints). Both feed into the same
    // "Debates" total on the Profile screen, but are tracked independently
    // in activityCounts so create vs. participate can still be told apart
    // if ever needed.
    //
    // Fires only on the transition into a user's first (and, per the 409
    // guard above, only) vote on a given debate post. transactionId is
    // stable per (user, post), so even if this block somehow ran twice for
    // the same vote, awardUserPoints' idempotency guard (checks for an
    // existing userPointTransactions/{transactionId} doc) would make the
    // second call a no-op — un-voting never reaches this branch at all.
    if (postType === "debate" && previousVote === null && vote !== null) {
      (async () => {
        try {
          await awardRoarPointsByReason({
            actualUserId,
            authUserId,
            userName: resolvedName,
            userEmail,
            userExists,
            reason: "ROAR_DEBATE_PARTICIPATE",
            points: ROAR_EVENT_POINTS.ROAR_DEBATE_PARTICIPATE,
            transactionId: `roar_debate_vote_${postId}_${actualUserId}`,
            metadata: { postId, vote },
          });
        } catch (pointsErr) {
          console.error("[roar/vote] Failed to award debate participation points:", pointsErr);
        }
      })();
    }

    // ── Award prediction-participation points (fire-and-forget) ──────────────────
    if (postType === "prediction" && previousVote === null && vote !== null) {
      (async () => {
        try {
          await awardRoarPointsByReason({
            actualUserId,
            authUserId,
            userName: resolvedName,
            userEmail,
            userExists,
            reason: "ROAR_PREDICTION_PARTICIPATE",
            points: ROAR_EVENT_POINTS.ROAR_PREDICTION_PARTICIPATE,
            transactionId: `roar_prediction_vote_${postId}_${actualUserId}`,
            metadata: { postId, vote },
          });
        } catch (pointsErr) {
          console.error("[roar/vote] Failed to award prediction participation points:", pointsErr);
        }
      })();
    }

    // ── Grouped like notification (fire-and-forget, only on "agree") ──────────
    if (vote === "agree" && previousVote !== "agree") {
      (async () => {
        try {
          // Fetch author email for the notification query key
          const authorSnap = await db
            .collection("users")
            .doc(postData.authorUid)
            .get();
          const authorEmail = (
            authorSnap.data() as { email?: string } | undefined
          )?.email;

          if (authorEmail) {
            await upsertLikeNotification({
              postId,
              postAuthorUid: postData.authorUid,
              postAuthorEmail: authorEmail,
              postPreview: (postData.text ?? "").slice(0, 80),
              likerUsername: resolvedName,
              likerUid: actualUserId,
            });
          }
        } catch (notifErr) {
          console.error("[roar/vote] Failed to upsert like notification:", notifErr);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      vote,
      agreeCount: (postData.agreeCount ?? 0) + agreeData,
      disagreeCount: (postData.disagreeCount ?? 0) + disagreeData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts/[postId]/vote error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
