// api/roar/posts/[postId]/resolve/route.ts

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { awardRoarPointsByReason } from "@/lib/roarPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const ACCURACY_POINTS = 5;

type ResolvablePredictionPost = {
  type?: string;
  authorUid: string;
  text?: string;
  closesAt?: number;
  closedAt?: number;
  resolvedAt?: number;
  predictionOptions?: string[];
  correctVote?: string;
};

type PredictionVote = { vote?: string };

async function createNotification(userId: string, data: Record<string, unknown>) {
  const baseRef = db.collection("notifications").doc(userId);
  const itemRef = baseRef.collection("items").doc();
  const summaryRef = baseRef.collection("meta").doc("summary");
  const batch = db.batch();
  batch.set(itemRef, {
    read: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...data,
  });
  batch.set(summaryRef, { unreadCount: FieldValue.increment(1) }, { merge: true });
  await batch.commit();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { postId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { correctVote }: { correctVote?: string } = await req.json();
    const optionVoteMatch = typeof correctVote === "string" ? /^option_(\d+)$/.exec(correctVote) : null;
    if (!correctVote || (correctVote !== "agree" && correctVote !== "disagree" && !optionVoteMatch)) {
      return NextResponse.json({ error: "Invalid correctVote" }, { status: 400 });
    }

    const info = await getUserInfo(user.userId, user.name, user.email);

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
      console.warn("[Resolve POST] DynamoDB post fetch failed:", dynErr);
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
        console.warn("[Resolve POST] Firestore post fetch failed:", fsErr);
      }
    }

    if (!postExists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const post = postItem || fallbackPostData || {};
    if (post.type !== "prediction") {
      return NextResponse.json({ error: "Only prediction posts can be resolved" }, { status: 400 });
    }
    if (optionVoteMatch) {
      const optionIndex = Number(optionVoteMatch[1]);
      if (!Array.isArray(post.predictionOptions) || optionIndex < 2 || optionIndex >= post.predictionOptions.length) {
        return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
      }
    }
    if (post.authorUid !== info.actualUserId && post.authorUid !== user.userId && post.authorUid !== user.email) {
      return NextResponse.json({ error: "Only the prediction creator can resolve this poll" }, { status: 403 });
    }
    if (post.resolvedAt) {
      return NextResponse.json({ error: "Prediction is already resolved" }, { status: 409 });
    }

    const now = Date.now();
    if (post.closesAt && post.closesAt > now) {
      return NextResponse.json({ error: "Prediction poll is still open" }, { status: 409 });
    }

    // 2. Fetch all votes from DynamoDB first
    let votesData: any[] = [];
    let fetchedVotesFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "VOTE#" }
      }));
      if (res.Items) {
        votesData = res.Items.map(item => ({
          id: (item.sk as string).replace(/^VOTE#/, ""),
          ...item
        }));
        fetchedVotesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Resolve POST] DynamoDB votes fetch failed:", dynErr);
    }

    const votesSnap = await postRef.collection("roarVotes").get();

    // Fallback: Check Firestore for votes
    if (!fetchedVotesFromDynamo) {
      votesData = votesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }

    let correctCount = 0;
    let wrongCount = 0;

    // 3. Update parent post and vote records in DynamoDB
    try {
      // A. Update parent post item
      if (postItem) {
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: postItem.sk },
          UpdateExpression: "SET closedAt = :c, resolvedAt = :r, correctVote = :cv, accuracyAwarded = :a, #s = :sVal, updatedAt = :u",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":c": post.closedAt ?? now,
            ":r": now,
            ":cv": correctVote,
            ":a": true,
            ":sVal": "active",
            ":u": now
          }
        }));
      }

      // B. Update each vote record and user accuracy stats in DynamoDB
      for (const voteItem of votesData) {
        const voterId = voteItem.id;
        const vote = voteItem.vote;
        if (!vote) continue;
        const isCorrect = vote === correctVote;

        if (isCorrect) correctCount += 1;
        else wrongCount += 1;

        // Update vote record
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: `VOTE#${voterId}` },
          UpdateExpression: "SET resolvedAt = :r, correctVote = :cv, isCorrect = :ic, accuracyPointsAwarded = :ap",
          ExpressionAttributeValues: {
            ":r": now,
            ":cv": correctVote,
            ":ic": isCorrect,
            ":ap": isCorrect ? ACCURACY_POINTS : 0
          }
        })).catch(() => {});

        // Fetch user item to edit predictionStats map safely in memory
        let voterItem: any = null;
        try {
          const voterRes = await docClient.send(new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${voterId}`, sk: "USER#META" }
          }));
          voterItem = voterRes.Item;
        } catch (e) {}

        const predictionStats = voterItem?.predictionStats || {};
        predictionStats.participated = (predictionStats.participated || 0) + 1;
        predictionStats.correct = (predictionStats.correct || 0) + (isCorrect ? 1 : 0);
        predictionStats.wrong = (predictionStats.wrong || 0) + (isCorrect ? 0 : 1);

        await docClient.send(new UpdateCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${voterId}`, sk: "USER#META" },
          UpdateExpression: "SET predictionStats = :ps, predictionAccuracyUpdatedAt = :u",
          ExpressionAttributeValues: { ":ps": predictionStats, ":u": now }
        })).catch(() => {});
      }
    } catch (dynErr) {
      console.warn("[Resolve POST] DynamoDB resolving writes failed:", dynErr);
    }

    // 4. Sync resolving to Firestore
    try {
      const batch = db.batch();
      batch.update(postRef, {
        closedAt: post.closedAt ?? now,
        resolvedAt: now,
        correctVote,
        accuracyAwarded: true,
        status: "active",
        updatedAt: now,
      });

      for (const voteDoc of votesSnap.docs) {
        const voterId = voteDoc.id;
        const vote = (voteDoc.data() as PredictionVote).vote;
        if (!vote) continue;
        const isCorrect = vote === correctVote;

        if (fetchedVotesFromDynamo) {
          // If we resolved via DynamoDB, we still need correctCount for response
          if (isCorrect) correctCount += 1;
          else wrongCount += 1;
        }

        batch.set(voteDoc.ref, {
          resolvedAt: now,
          correctVote,
          isCorrect,
          accuracyPointsAwarded: isCorrect ? ACCURACY_POINTS : 0,
        }, { merge: true });

        batch.set(db.collection("users").doc(voterId), {
          predictionStats: {
            participated: FieldValue.increment(1),
            correct: FieldValue.increment(isCorrect ? 1 : 0),
            wrong: FieldValue.increment(isCorrect ? 0 : 1),
          },
          predictionAccuracyUpdatedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      await batch.commit();
    } catch (fsErr) {
      console.warn("[Resolve POST] Firestore resolving sync failed:", fsErr);
    }

    // 5. Award points & send notifications
    await Promise.all(votesData.map(async (voteItem) => {
      const voterId = voteItem.id;
      const vote = voteItem.vote;
      if (!vote) return;
      const isCorrect = vote === correctVote;

      let userData: any = {};
      let userSnapExists = false;
      try {
        const userSnap = await db.collection("users").doc(voterId).get();
        userSnapExists = userSnap.exists;
        if (userSnapExists) {
          userData = userSnap.data() || {};
        }
      } catch (fsErr) {
        console.warn("[Resolve POST] Fetch user profile failed:", fsErr);
      }

      const userName = userData.username || voterId;
      const userEmail = userData.email || "";

      if (isCorrect) {
        await awardRoarPointsByReason({
          actualUserId: voterId,
          authUserId: voterId,
          userName,
          userEmail,
          userExists: userSnapExists,
          reason: "ROAR_PREDICTION_CORRECT",
          points: ACCURACY_POINTS,
          transactionId: `roar_prediction_correct_${postId}_${voterId}`,
          metadata: { postId, vote, correctVote },
        }).catch((err) => console.error("[prediction resolve] point award failed:", err));
      }

      await createNotification(voterId, {
        type: isCorrect ? "ROAR_PREDICTION_CORRECT" : "ROAR_PREDICTION_WRONG",
        title: isCorrect ? "Prediction correct" : "Prediction resolved",
        subtitle: isCorrect ? `You got it right. +${ACCURACY_POINTS} accuracy points.` : "Your pick was not the correct answer this time.",
        cta: "See prediction",
        postId,
        postPreview: String(post.text ?? "").slice(0, 120),
      }).catch((err) => console.error("[prediction resolve] participant notification failed:", err));
    }));

    return NextResponse.json({
      success: true,
      postId,
      correctVote,
      participantCount: votesData.length,
      correctCount,
      wrongCount,
      accuracyPoints: ACCURACY_POINTS,
      post: { resolvedAt: now, closedAt: post.closedAt ?? now, correctVote },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts/[postId]/resolve error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
