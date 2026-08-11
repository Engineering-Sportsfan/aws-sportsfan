// api/roar/rooms/[roomId]/messages/[msgId]/resolve/route.ts

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

type ResolvableRoomPrediction = {
  type?: string;
  authorUid: string;
  text?: string;
  closesAt?: number;
  closedAt?: number;
  resolvedAt?: number;
  predictionOptions?: string[];
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
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { correctVote }: { correctVote?: string } = await req.json();
    const optionVoteMatch = typeof correctVote === "string" ? /^option_(\d+)$/.exec(correctVote) : null;
    if (!correctVote || (correctVote !== "agree" && correctVote !== "disagree" && !optionVoteMatch)) {
      return NextResponse.json({ error: "Invalid correctVote" }, { status: 400 });
    }

    const info = await getUserInfo(user.userId, user.name, user.email);

    // 1. Fetch parent message from DynamoDB first
    let msgItem: any = null;
    let msgSk: string | null = null;
    let fetchedMsgFromDynamo = false;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        FilterExpression: "chatId = :m",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `MSG#${roomId}#`,
          ":m": msgId
        },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        msgItem = qRes.Items[0];
        msgSk = msgItem.sk;
        fetchedMsgFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomResolve POST] DynamoDB message fetch failed:", dynErr);
    }

    let roomRef = db.collection("roarRooms").doc(roomId);
    let isWatchalongFallback = false;
    let msgExists = fetchedMsgFromDynamo;
    let fallbackMsgData: any = null;

    if (!msgExists) {
      try {
        let msgSnap = await roomRef.collection("messages").doc(msgId).get();
        if (!msgSnap.exists) {
          const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
          const fallbackSnap = await fallbackRef.collection("messages").doc(msgId).get();
          if (fallbackSnap.exists) {
            roomRef = fallbackRef;
            msgSnap = fallbackSnap;
            isWatchalongFallback = true;
          }
        }
        if (msgSnap.exists) {
          msgExists = true;
          fallbackMsgData = msgSnap.data();
        }
      } catch (fsErr) {
        console.warn("[RoomResolve POST] Firestore message fetch failed:", fsErr);
      }
    }

    if (!msgExists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const msgRef = roomRef.collection("messages").doc(msgId);
    const message = msgItem || fallbackMsgData || {};

    if (message.type !== "prediction") {
      return NextResponse.json({ error: "Only prediction messages can be resolved" }, { status: 400 });
    }
    if (message.authorUid !== info.actualUserId && message.authorUid !== user.userId && message.authorUid !== user.email) {
      return NextResponse.json({ error: "Only the prediction creator can resolve this poll" }, { status: 403 });
    }
    if (message.resolvedAt) {
      return NextResponse.json({ error: "Prediction is already resolved" }, { status: 409 });
    }
    if (optionVoteMatch) {
      const optionIndex = Number(optionVoteMatch[1]);
      if (!Array.isArray(message.predictionOptions) || optionIndex < 2 || optionIndex >= message.predictionOptions.length) {
        return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
      }
    }

    const now = Date.now();
    if (message.closesAt && message.closesAt > now) {
      return NextResponse.json({ error: "Prediction poll is still open" }, { status: 409 });
    }

    // 2. Fetch all votes from DynamoDB first
    let votesData: any[] = [];
    let fetchedVotesFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `VOTE#${msgId}#` }
      }));
      if (res.Items) {
        votesData = res.Items.map(item => {
          const parts = (item.sk as string).split("#");
          return {
            id: parts[2],
            voteId: parts[2],
            ...item
          };
        });
        fetchedVotesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomResolve POST] DynamoDB votes fetch failed:", dynErr);
    }

    const votesSnap = await msgRef.collection("votes").get();

    // Fallback: Check Firestore for votes
    if (!fetchedVotesFromDynamo) {
      votesData = votesSnap.docs.map(doc => ({
        id: doc.id,
        voteId: doc.id,
        ...doc.data()
      }));
    }

    let correctCount = 0;
    let wrongCount = 0;

    // 3. Update parent message and vote records in DynamoDB
    try {
      // A. Update parent message item
      if (msgItem && msgSk) {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: msgSk },
          UpdateExpression: "SET closedAt = :c, resolvedAt = :r, correctVote = :cv, accuracyAwarded = :a, updatedAt = :u",
          ExpressionAttributeValues: {
            ":c": message.closedAt ?? now,
            ":r": now,
            ":cv": correctVote,
            ":a": true,
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
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `VOTE#${msgId}#${voteItem.voteId}` },
          UpdateExpression: "SET resolvedAt = :r, correctVote = :cv, isCorrect = :ic, accuracyPointsAwarded = :ap",
          ExpressionAttributeValues: {
            ":r": now,
            ":cv": correctVote,
            ":ic": isCorrect,
            ":ap": isCorrect ? ACCURACY_POINTS : 0
          }
        })).catch(() => {});

        // Fetch user profile from DynamoDB USER#META to update stats in memory
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
      console.warn("[RoomResolve POST] DynamoDB update failed:", dynErr);
    }

    // 4. Sync resolving to Firestore
    try {
      const batch = db.batch();
      batch.update(msgRef, {
        closedAt: message.closedAt ?? now,
        resolvedAt: now,
        correctVote,
        accuracyAwarded: true,
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
      console.warn("[RoomResolve POST] Firestore resolving sync failed:", fsErr);
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
        console.warn("[RoomResolve POST] Fetch user profile failed:", fsErr);
      }

      const userName = userData.username || voterId;
      const userEmail = userData.email || "";

      if (isCorrect) {
        let watchAlongRoomId = null;
        let roarRoomId = null;

        if (isWatchalongFallback) {
          watchAlongRoomId = roomId;
          db.collection("roarRooms")
            .where("watchAlongRoomId", "==", roomId)
            .limit(1)
            .get()
            .then((snap) => {
              if (!snap.empty) roarRoomId = snap.docs[0].id;
            })
            .catch(() => {});
        } else {
          roarRoomId = roomId;
          db.collection("roarRooms").doc(roomId).get()
            .then((doc) => {
              if (doc.exists) watchAlongRoomId = doc.data()?.watchAlongRoomId ?? null;
            })
            .catch(() => {});
        }

        await awardRoarPointsByReason({
          actualUserId: voterId,
          authUserId: voterId,
          userName,
          userEmail,
          userExists: userSnapExists,
          reason: "ROAR_PREDICTION_CORRECT",
          points: ACCURACY_POINTS,
          transactionId: `roar_room_prediction_correct_${roomId}_${msgId}_${voterId}`,
          metadata: {
            roomId,
            postId: msgId,
            vote,
            correctVote,
            watchAlongRoomId,
            roarRoomId
          },
        }).catch((err) => console.error("[room prediction resolve] point award failed:", err));
      }

      await createNotification(voterId, {
        type: isCorrect ? "ROAR_PREDICTION_CORRECT" : "ROAR_PREDICTION_WRONG",
        title: isCorrect ? "Prediction correct" : "Prediction resolved",
        subtitle: isCorrect ? `You got it right. +${ACCURACY_POINTS} accuracy points.` : "Your pick was not the correct answer this time.",
        cta: "See prediction",
        postId: msgId,
        roomId,
        postPreview: String(message.text ?? "").slice(0, 120),
      }).catch((err) => console.error("[room prediction resolve] participant notification failed:", err));
    }));

    return NextResponse.json({
      success: true,
      roomId,
      msgId,
      correctVote,
      participantCount: votesData.length,
      correctCount,
      wrongCount,
      accuracyPoints: ACCURACY_POINTS,
      message: { resolvedAt: now, closedAt: message.closedAt ?? now, correctVote },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST room prediction resolve error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
