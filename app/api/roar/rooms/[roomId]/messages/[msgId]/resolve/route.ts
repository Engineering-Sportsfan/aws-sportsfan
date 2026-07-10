import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { awardRoarPointsByReason } from "@/lib/roarPoints";

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
  { params }: { params: Promise<{ roomId: string; msgId: string }> },
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { correctVote }: { correctVote?: string } = await req.json();
    const optionVoteMatch = typeof correctVote === "string" ? /^option_(\d+)$/.exec(correctVote) : null;
    if (!correctVote || (correctVote !== "agree" && correctVote !== "disagree" && !optionVoteMatch)) {
      return NextResponse.json({ error: "Invalid correctVote" }, { status: 400 });
    }

    const info = await getUserInfo(user.userId, user.name, user.email);
    const msgRef = db.collection("roarRooms").doc(roomId).collection("messages").doc(msgId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const message = msgSnap.data() as ResolvableRoomPrediction;
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

    const votesSnap = await msgRef.collection("votes").get();
    const batch = db.batch();
    batch.update(msgRef, {
      closedAt: message.closedAt ?? now,
      resolvedAt: now,
      correctVote,
      accuracyAwarded: true,
      updatedAt: now,
    });

    let correctCount = 0;
    let wrongCount = 0;

    for (const voteDoc of votesSnap.docs) {
      const voterId = voteDoc.id;
      const vote = (voteDoc.data() as PredictionVote).vote;
      if (!vote) continue;
      const isCorrect = vote === correctVote;
      if (isCorrect) correctCount += 1;
      else wrongCount += 1;

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

    await Promise.all(votesSnap.docs.map(async (voteDoc) => {
      const voterId = voteDoc.id;
      const vote = (voteDoc.data() as PredictionVote).vote;
      if (!vote) return;
      const isCorrect = vote === correctVote;
      const userSnap = await db.collection("users").doc(voterId).get();
      const userData = userSnap.exists ? (userSnap.data() as { username?: string; email?: string }) : {};
      const userName = userData.username || voterId;
      const userEmail = userData.email || "";

      if (isCorrect) {
        await awardRoarPointsByReason({
          actualUserId: voterId,
          authUserId: voterId,
          userName,
          userEmail,
          userExists: userSnap.exists,
          reason: "ROAR_PREDICTION_CORRECT",
          points: ACCURACY_POINTS,
          transactionId: `roar_room_prediction_correct_${roomId}_${msgId}_${voterId}`,
          metadata: { roomId, postId: msgId, vote, correctVote },
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
      participantCount: votesSnap.size,
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
