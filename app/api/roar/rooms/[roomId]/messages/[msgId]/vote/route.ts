
// // /api/roar/rooms/[roomId]/messages/[msgId]/vote/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { awardRoarPointsByReason } from "@/lib/roarPoints";
// import { getUserInfo } from "@/lib/userPoints";

// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; msgId: string }> },
// ) {
//   try {
//     const { roomId, msgId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const { vote, questionIndex }: { vote: string; questionIndex?: number } = await req.json();
//     if (typeof vote !== "string") {
//       return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
//     }

//     // ── Resolve user ID ──────────────────────────────────────────────────────
//     const info = await getUserInfo(user.userId, undefined, user.email);
//     const resolvedUserId = info.exists ? info.actualUserId : user.userId;

//     const msgRef = db
//       .collection("roarRooms")
//       .doc(roomId)
//       .collection("messages")
//       .doc(msgId);

//     // ── Read message type first — needed to know if this message hosts     ──
//     // ── multiple questions (predictions_live) before we can build the      ──
//     // ── correct vote-doc id / validate the option bounds.                  ──
//     const msgSnap = await msgRef.get();
//     if (!msgSnap.exists) {
//       return NextResponse.json({ error: "Message not found" }, { status: 404 });
//     }
//     const msgData = msgSnap.data() as {
//       type?: string;
//       predictionOptions?: string[];
//       questions?: { question: string; options: { text: string; emoji?: string }[] }[];
//       closesAt?: number;
//       closedAt?: number;
//       resolvedAt?: number;
//     };
//     const msgType = msgData.type ?? "";
//     const optionVoteMatch = /^option_(\d+)$/.exec(vote);
//     if (vote !== "agree" && vote !== "disagree" && !optionVoteMatch) {
//       return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
//     }

//     // ── predictions_live messages can hold several independent questions.  ──
//     // ── Each question needs its own vote doc + its own tally, keyed by     ──
//     // ── questionIndex, or voting on Q2 would collide with the Q1 vote doc  ──
//     // ── (same resolvedUserId) and always come back "Already voted".        ──
//     const isMultiQuestion = msgType === "predictions_live";
//     const qIndex = isMultiQuestion
//       ? (Number.isInteger(questionIndex) && (questionIndex as number) >= 0 ? (questionIndex as number) : 0)
//       : 0;

//     if (isMultiQuestion) {
//       const questions = Array.isArray(msgData.questions) ? msgData.questions : [];
//       if (qIndex >= questions.length) {
//         return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
//       }
//       const options = questions[qIndex]?.options ?? [];
//       if (optionVoteMatch) {
//         const optionIndex = Number(optionVoteMatch[1]);
//         if (optionIndex < 2 || optionIndex >= options.length) {
//           return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
//         }
//       } else if (options.length < 2) {
//         return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
//       }
//     } else if (optionVoteMatch) {
//       const optionIndex = Number(optionVoteMatch[1]);
//       if (msgType !== "prediction" || !Array.isArray(msgData.predictionOptions) || optionIndex < 2 || optionIndex >= msgData.predictionOptions.length) {
//         return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
//       }
//     }

//     const now = Date.now();
//     if ((msgType === "prediction" || msgType === "predictions_live") && (msgData.resolvedAt || msgData.closedAt || (msgData.closesAt && msgData.closesAt <= now))) {
//       if (!msgData.closedAt && msgData.closesAt && msgData.closesAt <= now) {
//         await msgRef.update({ closedAt: now, updatedAt: now });
//       }
//       return NextResponse.json({ error: "Prediction poll is closed" }, { status: 409 });
//     }

//     // ── Vote doc id: one doc per (user, question) for multi-question posts,
//     // one doc per user for everything else (unchanged behavior).
//     const voteDocId = isMultiQuestion ? `${resolvedUserId}_q${qIndex}` : resolvedUserId;
//     const voteRef = msgRef.collection("votes").doc(voteDocId);

//     // ── Check for existing vote ──────────────────────────────────────────────
//     const existingVote = await voteRef.get();
//     if (existingVote.exists) {
//       return NextResponse.json(
//         { error: "Already voted", message: "Already voted" },
//         { status: 409 }
//       );
//     }

//     // ── Write vote + increment counter atomically ────────────────────────────
//     const batch = db.batch();
//     batch.set(voteRef, {
//       vote,
//       createdAt: now,
//       userId: resolvedUserId,
//       ...(isMultiQuestion && { questionIndex: qIndex }),
//     });

//     if (isMultiQuestion) {
//       // Namespaced by question so each question's tallies stay independent
//       // even though they live on the same message doc.
//       batch.update(msgRef, {
//         [`predictionOptionCounts.q${qIndex}_${vote}`]: FieldValue.increment(1),
//       });
//     } else {
//       batch.update(msgRef, {
//         [vote === "agree" ? "agreeCount" : vote === "disagree" ? "disagreeCount" : `predictionOptionCounts.${vote}`]: FieldValue.increment(1),
//       });
//     }
//     await batch.commit();

//     // ── Award points based on message type ───────────────────────────────────
//     // debate / hottake / hot_take  → ROAR_DEBATE_PARTICIPATE
//     // prediction / predictions_live → ROAR_PREDICTION_PARTICIPATE
//     const DEBATE_TYPES = new Set(["debate", "hottake", "hot_take"]);
//     const reason = (msgType === "prediction" || msgType === "predictions_live")
//       ? "ROAR_PREDICTION_PARTICIPATE"
//       : DEBATE_TYPES.has(msgType)
//         ? "ROAR_DEBATE_PARTICIPATE"
//         : null;

//     if (reason) {
//       // Include the question index in the transaction id so each question in
//       // a multi-question post can earn points once, independently.
//       const transactionId = isMultiQuestion
//         ? `roar_vote_${msgId}_q${qIndex}_${resolvedUserId}`
//         : `roar_vote_${msgId}_${resolvedUserId}`;

//       awardRoarPointsByReason({
//         actualUserId:  resolvedUserId,
//         authUserId:    user.userId,
//         userName:      info.userName,
//         userEmail:     info.userEmail || user.email,
//         userExists:    info.exists,
//         reason,
//         points:        2,
//         transactionId,
//         metadata: { postId: msgId, roomId, vote, type: msgType, ...(isMultiQuestion && { questionIndex: qIndex }) },
//       }).catch((err) => {
//         console.warn(`[vote] Failed to award ${reason} points:`, err);
//       });
//     }

//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST room message vote error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// /api/roar/rooms/[roomId]/messages/[msgId]/vote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPointsByReason } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> },
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vote, questionIndex }: { vote: string; questionIndex?: number } = await req.json();
    if (typeof vote !== "string") {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    // ── Resolve user ID ──────────────────────────────────────────────────────
    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedUserId = info.exists ? info.actualUserId : user.userId;

    // 1. Fetch parent message from DynamoDB first
    // let msgItem: any = null;
    // let fetchedMsgFromDynamo = false;
    // try {
    //   const getRes = await docClient.send(new GetCommand({
    //     TableName: "RealTimeChat",
    //     Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${msgId}` }
    //   }));
    //   if (getRes.Item) {
    //     msgItem = getRes.Item;
    //     fetchedMsgFromDynamo = true;
    //   }
    // } catch (dynErr) {
    //   console.warn("[RoomVote POST] DynamoDB message fetch failed:", dynErr);
    // }

    // 1. Fetch parent message from DynamoDB first
    let msgItem: any = null;
    let fetchedMsgFromDynamo = false;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `MSG#${roomId}#` },
      }));
      const found = qRes.Items?.find((item) => item.msgId === msgId);
      if (found) {
        msgItem = found;
        fetchedMsgFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomVote POST] DynamoDB message fetch failed:", dynErr);
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
        console.warn("[RoomVote POST] Firestore message fetch failed:", fsErr);
      }
    }

    if (!msgExists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const msgRef = roomRef.collection("messages").doc(msgId);
    const msgData = msgItem || fallbackMsgData || {};
    const msgType = msgData.type ?? "";
    const optionVoteMatch = /^option_(\d+)$/.exec(vote);
    const isBattle = msgType === "battle";
    const isBattleVote = vote === "playerA" || vote === "playerB";

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
      const battleQuestions = Array.isArray(msgData.battleQuestions) ? msgData.battleQuestions : [];
      if (qIndex >= battleQuestions.length) {
        return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
      }
    } else if (msgType === "predictions_live") {
      const questions = Array.isArray(msgData.questions) ? msgData.questions : [];
      if (qIndex >= questions.length) {
        return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
      }
      const options = questions[qIndex]?.options ?? [];
      if (optionVoteMatch) {
        const optionIndex = Number(optionVoteMatch[1]);
        if (optionIndex < 2 || optionIndex >= options.length) {
          return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
        }
      } else if (options.length < 2) {
        return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
      }
    } else if (optionVoteMatch) {
      const optionIndex = Number(optionVoteMatch[1]);
      if (msgType !== "prediction" || !Array.isArray(msgData.predictionOptions) || optionIndex < 2 || optionIndex >= msgData.predictionOptions.length) {
        return NextResponse.json({ error: "Invalid prediction option" }, { status: 400 });
      }
    }

    const now = Date.now();
    if (
      (msgType === "prediction" || msgType === "predictions_live" || isBattle) &&
      (msgData.resolvedAt || msgData.closedAt || (msgData.closesAt && msgData.closesAt <= now))
    ) {
      if (!msgData.closedAt && msgData.closesAt && msgData.closesAt <= now) {
        msgRef.update({ closedAt: now, updatedAt: now }).catch(() => {});
      }
      return NextResponse.json({ error: isBattle ? "Battle voting is closed" : "Prediction poll is closed" }, { status: 409 });
    }

    const voteDocId = isMultiQuestion ? `${resolvedUserId}_q${qIndex}` : resolvedUserId;

    // 2. Check for existing vote in DynamoDB first
    let voteExists = false;
    let fetchedVoteFromDynamo = false;

    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `VOTE#${msgId}#${voteDocId}` }
      }));
      if (getRes.Item) {
        voteExists = true;
        fetchedVoteFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomVote POST] DynamoDB vote check failed:", dynErr);
    }

    const voteRef = msgRef.collection("votes").doc(voteDocId);

    if (!fetchedVoteFromDynamo) {
      try {
        const snap = await voteRef.get();
        if (snap.exists) {
          voteExists = true;
        }
      } catch (fsErr) {
        console.warn("[RoomVote POST] Firestore vote check failed:", fsErr);
      }
    }

    if (voteExists) {
      return NextResponse.json(
        { error: "Already voted", message: "Already voted" },
        { status: 409 }
      );
    }

    // Calculate count deltas for in-memory modification on DynamoDB parent message
    let agreeCount = msgData.agreeCount || 0;
    let disagreeCount = msgData.disagreeCount || 0;
    const poc = { ...(msgData.predictionOptionCounts || {}) };
    const bvc = { ...(msgData.battleVoteCounts || {}) };

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

    // 3. Write to DynamoDB
    try {
      // A. Put vote record
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `VOTE#${msgId}#${voteDocId}`,
          vote,
          createdAt: now,
          userId: resolvedUserId,
          ...(isMultiQuestion && { questionIndex: qIndex })
        }
      }));

      // B. Update Parent Message
      if (msgItem) {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          // Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${msgId}` },
          Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
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
      console.warn("[RoomVote POST] DynamoDB write failed:", dynErr);
    }

    // 4. Sync/Fallback to Firestore
    try {
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
      console.warn("[RoomVote POST] Firestore sync failed:", fsErr);
    }

    // ── Award points based on message type ───────────────────────────────────
    const DEBATE_TYPES = new Set(["debate", "hottake", "hot_take"]);
    const reason = (msgType === "prediction" || msgType === "predictions_live" || isBattle)
      ? "ROAR_PREDICTION_PARTICIPATE"
      : DEBATE_TYPES.has(msgType)
        ? "ROAR_DEBATE_PARTICIPATE"
        : null;

    if (reason) {
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

      const transactionId = isMultiQuestion
        ? `roar_vote_${msgId}_q${qIndex}_${resolvedUserId}`
        : `roar_vote_${msgId}_${resolvedUserId}`;

      awardRoarPointsByReason({
        actualUserId:  resolvedUserId,
        authUserId:    user.userId,
        userName:      info.userName,
        userEmail:     info.userEmail || user.email,
        userExists:    info.exists,
        reason,
        points:        2,
        transactionId,
        metadata: {
          postId: msgId,
          roomId,
          vote,
          type: msgType,
          statement: (msgData as any).text ?? "",
          watchAlongRoomId,
          roarRoomId,
          ...(isMultiQuestion && { questionIndex: qIndex })
        },
      }).catch((err) => {
        console.warn(`[vote] Failed to award ${reason} points:`, err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST room message vote error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}