// app/api/roar/rooms/[roomId]/messages/[msgId]/vote/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPointsByReason, ROAR_EVENT_POINTS } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { findRoomMessage } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { vote, questionIndex }: { vote: string; questionIndex?: number } = await req.json();
    if (typeof vote !== "string") {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedUserId = info.exists ? info.actualUserId : user.userId;

    // 1. Fetch parent message (user post or bot post)
    const found = await findRoomMessage(roomId, msgId);
    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;
    const msgType = (msgItem.type || "").toLowerCase();

    const isBattle = msgType === "battle";
    const isBattleVote = vote === "playerA" || vote === "playerB";
    const optionVoteMatch = /^option_(\d+)$/.exec(vote);

    if (isBattle) {
      if (!isBattleVote) {
        return NextResponse.json({ error: "Invalid vote value — expected playerA or playerB" }, { status: 400 });
      }
    } else if (vote !== "agree" && vote !== "disagree" && !optionVoteMatch) {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    const isMultiQuestion = msgType === "predictions_live" || isBattle;
    const qIndex = isMultiQuestion
      ? (Number.isInteger(questionIndex) && (questionIndex as number) >= 0 ? (questionIndex as number) : 0)
      : 0;

    if (isBattle) {
      const battleQuestions = Array.isArray(msgItem.battleQuestions) ? msgItem.battleQuestions : [];
      if (qIndex >= battleQuestions.length && battleQuestions.length > 0) {
        return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
      }
    }

    const now = Date.now();
    if (
      (msgType === "prediction" || msgType === "predictions_live" || isBattle) &&
      (msgItem.resolvedAt || msgItem.closedAt || (msgItem.closesAt && msgItem.closesAt <= now))
    ) {
      return NextResponse.json({ error: isBattle ? "Battle voting is closed" : "Prediction poll is closed" }, { status: 409 });
    }

    const voteDocId = isMultiQuestion ? `${resolvedUserId}_q${qIndex}` : resolvedUserId;

    // 2. Check for existing vote in DynamoDB
    let voteExists = false;
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: roomIdKey, sk: `VOTE#${targetMsgId}#${voteDocId}` }
      }));
      if (getRes.Item) {
        voteExists = true;
      }
    } catch (dynErr) {
      console.warn("[RoomVote POST] DynamoDB vote check notice:", dynErr);
    }

    if (!voteExists) {
      try {
        const cleanRoomId = roomId.replace(/^ROOM#/, "");
        const voteSnap = await db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId).collection("votes").doc(voteDocId).get();
        if (voteSnap.exists) {
          voteExists = true;
        }
      } catch (fsErr) {
        console.warn("[RoomVote POST] Firestore vote check notice:", fsErr);
      }
    }

    if (voteExists) {
      return NextResponse.json(
        { error: "Already voted", message: "Already voted" },
        { status: 409 }
      );
    }

    // Calculate count deltas
    let agreeCount = Number(msgItem.agreeCount || 0);
    let disagreeCount = Number(msgItem.disagreeCount || 0);
    const poc = { ...(msgItem.predictionOptionCounts || {}) };
    const bvc = { ...(msgItem.battleVoteCounts || {}) };

    if (isBattle) {
      const qCounts = { ...(bvc[qIndex] || {}) };
      qCounts[vote] = (qCounts[vote] || 0) + 1;
      bvc[qIndex] = qCounts;
    } else if (isMultiQuestion) {
      const key = `q${qIndex}_${vote}`;
      poc[key] = (poc[key] || 0) + 1;
    } else {
      if (vote === "agree") agreeCount += 1;
      else if (vote === "disagree") disagreeCount += 1;
      else poc[vote] = (poc[vote] || 0) + 1;
    }

    // 3. Write vote to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: {
          roomId: roomIdKey,
          sk: `VOTE#${targetMsgId}#${voteDocId}`,
          vote,
          createdAt: now,
          userId: resolvedUserId,
          ...(isMultiQuestion && { questionIndex: qIndex })
        }
      }));

      if (fromDynamo && msgSk) {
        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: roomIdKey, sk: msgSk },
          UpdateExpression: "SET agreeCount = :ac, disagreeCount = :dc, predictionOptionCounts = :poc, battleVoteCounts = :bvc, updatedAt = :u",
          ExpressionAttributeValues: {
            ":ac": agreeCount,
            ":dc": disagreeCount,
            ":poc": poc,
            ":bvc": bvc,
            ":u": now
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[RoomVote POST] DynamoDB write notice:", dynErr);
    }

    // 4. Sync to Firestore
    try {
      const cleanRoomId = roomId.replace(/^ROOM#/, "");
      const msgRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId);
      const voteRef = msgRef.collection("votes").doc(voteDocId);

      const batch = db.batch();
      batch.set(voteRef, {
        vote,
        createdAt: now,
        userId: resolvedUserId,
        ...(isMultiQuestion && { questionIndex: qIndex }),
      });

      if (isBattle) {
        batch.update(msgRef, {
          [`battleVoteCounts.${qIndex}.${vote}`]: FieldValue.increment(1),
        });
      } else if (isMultiQuestion) {
        batch.update(msgRef, {
          [`predictionOptionCounts.q${qIndex}_${vote}`]: FieldValue.increment(1),
        });
      } else {
        batch.update(msgRef, {
          [vote === "agree" ? "agreeCount" : vote === "disagree" ? "disagreeCount" : `predictionOptionCounts.${vote}`]: FieldValue.increment(1),
        });
      }
      await batch.commit();
    } catch (fsErr) {
      console.warn("[RoomVote POST] Firestore sync notice:", fsErr);
    }

    // Award Points
    const DEBATE_TYPES = new Set(["debate", "hottake", "hot_take"]);
    const reason = (msgType === "prediction" || msgType === "predictions_live")
      ? "ROAR_PREDICTION_PARTICIPATE"
      : DEBATE_TYPES.has(msgType)
        ? "ROAR_DEBATE_PARTICIPATE"
        : null;

    if (reason) {
      const transactionId = isMultiQuestion
        ? `roar_vote_${targetMsgId}_q${qIndex}_${resolvedUserId}`
        : `roar_vote_${targetMsgId}_${resolvedUserId}`;

      awardRoarPointsByReason({
        actualUserId: resolvedUserId,
        authUserId: user.userId,
        userName: info.userName || user.name || user.email?.split("@")[0] || "Fan",
        userEmail: user.email,
        userExists: info.exists,
        reason,
        points: ROAR_EVENT_POINTS[reason] ?? 2,
        transactionId,
        metadata: {
          roomId,
          postId: targetMsgId,
          type: msgType,
          vote,
          ...(isMultiQuestion && { questionIndex: qIndex })
        }
      }).catch((e) => console.warn("[RoomVote POST] Award points notice:", e));
    }

    return NextResponse.json({
      success: true,
      vote,
      agreeCount,
      disagreeCount,
      predictionOptionCounts: poc,
      battleVoteCounts: bvc,
    });
  } catch (error: any) {
    console.error("POST /api/roar/rooms/[roomId]/messages/[msgId]/vote error:", error);
    return NextResponse.json({ error: error.message || "Failed to submit vote" }, { status: 500 });
  }
}