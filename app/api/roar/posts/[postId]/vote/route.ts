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
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── Helper: build the grouped like message ──────────────────────────────────
function buildLikeMessage(likerNames: string[], likerCount: number): string {
  if (likerCount === 1) {
    return `${likerNames[0]} liked your ROAR post`;
  }
  const othersCount = likerCount - 1;
  return `${likerNames[0]} and ${othersCount} other${othersCount > 1 ? "s" : ""} liked your ROAR post`;
}

// ─── Helper: upsert the grouped notification ─────────────────────────────────
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
  if (likerUid === postAuthorUid) return;

  const notifId = `roar_like_${postId}`;
  const notifRef = db.collection("notifications").doc(notifId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(notifRef);

    if (!snap.exists) {
      tx.set(notifRef, {
        recipientEmail: postAuthorEmail,
        recipientUid: postAuthorUid,
        type: "roar_post_like",
        postId,
        postPreview,
        likerNames: [likerUsername],
        likerCount: 1,
        message: buildLikeMessage([likerUsername], 1),
        isRead: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      const data = snap.data()!;
      const existing: string[] = data.likerNames ?? [];

      if (existing.includes(likerUsername)) return;

      const updatedNames = [likerUsername, ...existing].slice(0, 3);
      const newCount = (data.likerCount ?? 1) + 1;

      tx.update(notifRef, {
        likerNames: updatedNames,
        likerCount: newCount,
        message: buildLikeMessage(updatedNames, newCount),
        isRead: false,
        updatedAt: Date.now(),
      });
    }
  });
}

// ─── POST /api/roar/posts/[postId]/vote ──────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { postId } = resolvedParams;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { vote }: { vote: string | null } = body;

    if (vote !== null && typeof vote !== "string") {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    // Resolve the voter
    const { actualUserId, authUserId, userName: resolvedName, userEmail, exists: userExists } =
      await getUserInfo(user.userId, user.name, user.email);

    // 1. Fetch parent post from DynamoDB first
    let postItem: any = null;
    let fetchedPostFromDynamo = false;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        postItem = qRes.Items[0];
        fetchedPostFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Vote POST] DynamoDB post fetch failed:", dynErr);
    }

    const postRef = db.collection("roarPosts").doc(postId);
    let postExists = fetchedPostFromDynamo;
    let fallbackPostData: any = null;

    if (!postExists) {
      try {
        const snap = await postRef.get();
        if (snap.exists) {
          postExists = true;
          fallbackPostData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[Vote POST] Firestore post fetch failed:", fsErr);
      }
    }

    if (!postExists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const postData = postItem || fallbackPostData || {};
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
        postRef.update({ closedAt: now, updatedAt: now }).catch(() => {});
      }
      return NextResponse.json({ success: false, error: "Prediction poll is closed" }, { status: 409 });
    }

    // 2. Fetch voter's previous vote from DynamoDB first
    let previousVote: string | null = null;
    let fetchedVoteFromDynamo = false;
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "SocialAndContent",
        Key: { contentId: `POST#${postId}`, sk: `VOTE#${actualUserId}` }
      }));
      if (getRes.Item) {
        previousVote = getRes.Item.vote;
        fetchedVoteFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Vote POST] DynamoDB vote fetch failed:", dynErr);
    }

    const voteRef = postRef.collection("roarVotes").doc(actualUserId);

    // Fallback: Check Firestore for previous vote
    if (!fetchedVoteFromDynamo) {
      try {
        const snap = await voteRef.get();
        if (snap.exists) {
          previousVote = (snap.data() as { vote: string }).vote;
        }
      } catch (fsErr) {
        console.warn("[Vote POST] Firestore vote fetch failed:", fsErr);
      }
    }

    if (postType === "debate" && previousVote !== null && vote !== null) {
      return NextResponse.json(
        { success: false, error: "Already voted on this debate", userVote: previousVote },
        { status: 409 },
      );
    }

    const agreeData = (vote === "agree" ? 1 : 0) - (previousVote === "agree" ? 1 : 0);
    const disagreeData = (vote === "disagree" ? 1 : 0) - (previousVote === "disagree" ? 1 : 0);

    const newAgreeCount = Math.max(0, (postData.agreeCount ?? 0) + agreeData);
    const newDisagreeCount = Math.max(0, (postData.disagreeCount ?? 0) + disagreeData);

    const updatedPoc = { ...(postData.predictionOptionCounts ?? {}) };
    if (typeof previousVote === "string" && previousVote.startsWith("option_")) {
      updatedPoc[previousVote] = Math.max(0, (updatedPoc[previousVote] ?? 1) - 1);
    }
    if (typeof vote === "string" && vote.startsWith("option_")) {
      updatedPoc[vote] = (updatedPoc[vote] ?? 0) + 1;
    }

    // 3. Write to DynamoDB
    try {
      if (vote === null) {
        await docClient.send(new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: `VOTE#${actualUserId}` }
        }));
      } else {
        await docClient.send(new PutCommand({
          TableName: "SocialAndContent",
          Item: {
            contentId: `POST#${postId}`,
            sk: `VOTE#${actualUserId}`,
            vote,
            votedAt: now
          }
        }));
      }

      if (postItem) {
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: postItem.sk },
          UpdateExpression: "SET agreeCount = :ac, disagreeCount = :dc, predictionOptionCounts = :poc, updatedAt = :u",
          ExpressionAttributeValues: {
            ":ac": newAgreeCount,
            ":dc": newDisagreeCount,
            ":poc": updatedPoc,
            ":u": now
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[Vote POST] DynamoDB write failed:", dynErr);
    }

    // 4. Sync/Fallback to Firestore
    try {
      const batch = db.batch();
      if (vote === null) {
        batch.delete(voteRef);
      } else {
        batch.set(voteRef, { vote, votedAt: now }, { merge: true });
      }

      const predictionOptionCountUpdates: Record<string, unknown> = {};
      if (typeof previousVote === "string" && previousVote.startsWith("option_")) {
        predictionOptionCountUpdates[`predictionOptionCounts.${previousVote}`] = FieldValue.increment(-1);
      }
      if (typeof vote === "string" && vote.startsWith("option_")) {
        predictionOptionCountUpdates[`predictionOptionCounts.${vote}`] = FieldValue.increment(1);
      }

      batch.update(postRef, {
        agreeCount: FieldValue.increment(agreeData),
        disagreeCount: FieldValue.increment(disagreeData),
        ...predictionOptionCountUpdates,
        updatedAt: now,
      });

      await batch.commit();
    } catch (fsErr) {
      console.warn("[Vote POST] Firestore sync failed:", fsErr);
    }

    // Award debate points
    if (postType === "debate" && previousVote === null && vote !== null) {
      awardRoarPointsByReason({
        actualUserId,
        authUserId,
        userName: resolvedName,
        userEmail,
        userExists,
        reason: "ROAR_DEBATE_PARTICIPATE",
        points: ROAR_EVENT_POINTS.ROAR_DEBATE_PARTICIPATE,
        transactionId: `roar_debate_vote_${postId}_${actualUserId}`,
        metadata: { postId, vote },
      }).catch((pointsErr) => console.error("[roar/vote] Failed to award debate participation points:", pointsErr));
    }

    // Award prediction points
    if (postType === "prediction" && previousVote === null && vote !== null) {
      awardRoarPointsByReason({
        actualUserId,
        authUserId,
        userName: resolvedName,
        userEmail,
        userExists,
        reason: "ROAR_PREDICTION_PARTICIPATE",
        points: ROAR_EVENT_POINTS.ROAR_PREDICTION_PARTICIPATE,
        transactionId: `roar_prediction_vote_${postId}_${actualUserId}`,
        metadata: { postId, vote },
      }).catch((pointsErr) => console.error("[roar/vote] Failed to award prediction participation points:", pointsErr));
    }

    // Send notification
    if (vote === "agree" && previousVote !== "agree") {
      (async () => {
        try {
          const authorSnap = await db.collection("users").doc(postData.authorUid).get();
          const authorEmail = (authorSnap.data() as { email?: string } | undefined)?.email;
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
      agreeCount: newAgreeCount,
      disagreeCount: newDisagreeCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts/[postId]/vote error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
