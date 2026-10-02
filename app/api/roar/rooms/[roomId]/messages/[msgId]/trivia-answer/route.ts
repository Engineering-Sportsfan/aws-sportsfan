// api/roar/rooms/[roomId]/messages/[msgId]/trivia-answer/route.ts
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

    const { questionIndex, selectedOption } = await req.json();
    if (typeof questionIndex !== "number" || !selectedOption) {
      return NextResponse.json({ error: "questionIndex and selectedOption are required" }, { status: 400 });
    }

    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedUserId = info.exists ? info.actualUserId : user.userId;

    // 1. Fetch parent message
    const found = await findRoomMessage(roomId, msgId);
    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;

    const questions: any[] = Array.isArray(msgItem.triviaQuestions) ? msgItem.triviaQuestions : [];
    if (questionIndex < 0 || questionIndex >= questions.length) {
      return NextResponse.json({ error: "Invalid questionIndex" }, { status: 400 });
    }

    const q = questions[questionIndex];
    const options: any[] = Array.isArray(q.options) ? q.options : [];
    const correctOpt = options.find((o: any) => o.isCorrect === true || o.correct === true);
    const correctOption = correctOpt?.label || q.correctOption || null;
    const isCorrect = correctOption ? selectedOption === correctOption : false;

    // 2. Check if already answered in DynamoDB
    let alreadyAnswered = false;
    try {
      const ansRes = await docClient.send(new GetCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: roomIdKey, sk: `TRIVIA_ANS#${targetMsgId}#${resolvedUserId}#q${questionIndex}` }
      }));
      if (ansRes.Item) {
        alreadyAnswered = true;
      }
    } catch (dynErr) {
      console.warn("[TriviaAnswer POST] DynamoDB ans check notice:", dynErr);
    }

    if (alreadyAnswered) {
      return NextResponse.json({ error: "Already answered", correctOption, isCorrect }, { status: 409 });
    }

    const now = Date.now();

    // 3. Record answer in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: {
          roomId: roomIdKey,
          sk: `TRIVIA_ANS#${targetMsgId}#${resolvedUserId}#q${questionIndex}`,
          userId: resolvedUserId,
          questionIndex,
          selectedOption,
          isCorrect,
          createdAt: now,
        }
      }));
    } catch (dynErr) {
      console.warn("[TriviaAnswer POST] DynamoDB write notice:", dynErr);
    }

    // 4. Record answer in Firestore
    try {
      const cleanRoomId = roomId.replace(/^ROOM#/, "");
      await db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId).collection("triviaAnswers").doc(`${resolvedUserId}_q${questionIndex}`).set({
        userId: resolvedUserId,
        questionIndex,
        selectedOption,
        isCorrect,
        createdAt: now,
      });
    } catch (fsErr) {
      console.warn("[TriviaAnswer POST] Firestore sync notice:", fsErr);
    }

    // 5. Award points if correct
    if (isCorrect) {
      awardRoarPointsByReason({
        actualUserId: resolvedUserId,
        authUserId: user.userId,
        userName: info.userName || user.name || user.email?.split("@")[0] || "Fan",
        userEmail: user.email,
        userExists: info.exists,
        reason: "ROAR_TRIVIA_CORRECT",
        points: ROAR_EVENT_POINTS.ROAR_TRIVIA_CORRECT ?? 2,
        transactionId: `roar_trivia_${targetMsgId}_q${questionIndex}_${resolvedUserId}`,
        metadata: {
          roomId,
          postId: targetMsgId,
          type: "trivia",
          questionIndex,
          selectedOption,
        }
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      correctOption,
      isCorrect,
    });
  } catch (error: any) {
    console.error("POST /api/roar/rooms/[roomId]/messages/[msgId]/trivia-answer error:", error);
    return NextResponse.json({ error: error.message || "Failed to submit trivia answer" }, { status: 500 });
  }
}