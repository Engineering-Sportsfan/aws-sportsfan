
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

    const msgRef = db
      .collection("roarRooms")
      .doc(roomId)
      .collection("messages")
      .doc(msgId);

    // ── Read message type first — needed to know if this message hosts     ──
    // ── multiple questions (predictions_live / battle) before we can build ──
    // ── the correct vote-doc id / validate the option bounds.              ──
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    const msgData = msgSnap.data() as {
      type?: string;
      text?: string;
      predictionOptions?: string[];
      questions?: { question: string; options: { text: string; emoji?: string }[] }[];
      battleQuestions?: { question?: string; playerA: { name: string }; playerB: { name: string } }[];
      closesAt?: number;
      closedAt?: number;
      resolvedAt?: number;
    };
    const msgType = msgData.type ?? "";
    const optionVoteMatch = /^option_(\d+)$/.exec(vote);
    const isBattle = msgType === "battle";
    const isBattleVote = vote === "playerA" || vote === "playerB";

    if (isBattle) {
      // Battle only accepts playerA / playerB — reject agree/disagree/option_N
      // so a stray predictions_live vote payload can't corrupt battle tallies.
      if (!isBattleVote) {
        return NextResponse.json({ error: "Invalid vote value — expected playerA or playerB" }, { status: 400 });
      }
    } else if (vote !== "agree" && vote !== "disagree" && !optionVoteMatch) {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    // ── predictions_live / battle messages can hold several independent    ──
    // ── questions. Each question needs its own vote doc + its own tally,   ──
    // ── keyed by questionIndex, or voting on Q2 would collide with the Q1  ──
    // ── vote doc (same resolvedUserId) and always come back "Already      ──
    // ── voted".                                                           ──
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
        await msgRef.update({ closedAt: now, updatedAt: now });
      }
      return NextResponse.json({ error: isBattle ? "Battle voting is closed" : "Prediction poll is closed" }, { status: 409 });
    }

    // ── Vote doc id: one doc per (user, question) for multi-question posts,
    // one doc per user for everything else (unchanged behavior).
    const voteDocId = isMultiQuestion ? `${resolvedUserId}_q${qIndex}` : resolvedUserId;
    const voteRef = msgRef.collection("votes").doc(voteDocId);

    // ── Check for existing vote ──────────────────────────────────────────────
    const existingVote = await voteRef.get();
    if (existingVote.exists) {
      return NextResponse.json(
        { error: "Already voted", message: "Already voted" },
        { status: 409 }
      );
    }

    // ── Write vote + increment counter atomically ────────────────────────────
    const batch = db.batch();
    batch.set(voteRef, {
      vote,
      createdAt: now,
      userId: resolvedUserId,
      ...(isMultiQuestion && { questionIndex: qIndex }),
    });

    if (isBattle) {
      // battleVoteCounts.{qIndex}.{playerA|playerB} — namespaced per question,
      // separate map shape from predictions_live's flat `q{n}_{vote}` keys
      // since battle only ever has two fixed sides.
      batch.update(msgRef, {
        [`battleVoteCounts.${qIndex}.${vote}`]: FieldValue.increment(1),
      });
    } else if (isMultiQuestion) {
      // Namespaced by question so each question's tallies stay independent
      // even though they live on the same message doc.
      batch.update(msgRef, {
        [`predictionOptionCounts.q${qIndex}_${vote}`]: FieldValue.increment(1),
      });
    } else {
      batch.update(msgRef, {
        [vote === "agree" ? "agreeCount" : vote === "disagree" ? "disagreeCount" : `predictionOptionCounts.${vote}`]: FieldValue.increment(1),
      });
    }
    await batch.commit();

    // ── Award points based on message type ───────────────────────────────────
    // debate / hottake / hot_take        → ROAR_DEBATE_PARTICIPATE
    // prediction / predictions_live / battle → ROAR_PREDICTION_PARTICIPATE
    const DEBATE_TYPES = new Set(["debate", "hottake", "hot_take"]);
    const reason = (msgType === "prediction" || msgType === "predictions_live" || isBattle)
      ? "ROAR_PREDICTION_PARTICIPATE"
      : DEBATE_TYPES.has(msgType)
        ? "ROAR_DEBATE_PARTICIPATE"
        : null;

    if (reason) {
      // Include the question index in the transaction id so each question in
      // a multi-question post can earn points once, independently.
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
        metadata: { postId: msgId, roomId, vote, type: msgType,  statement: (msgData as any).text ?? "", ...(isMultiQuestion && { questionIndex: qIndex }) },
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