// api/roar/rooms/[roomId]/messages/[msgId]/trivia-answer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPoints } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { questionIndex, selectedOption } = await req.json();
    if (typeof questionIndex !== "number" || !selectedOption) {
      return NextResponse.json({ error: "questionIndex and selectedOption are required" }, { status: 400 });
    }

    const info = await getUserInfo(user.userId, undefined, user.email);
    if (!info.exists) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    const resolvedUserId = info.actualUserId;

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
      console.warn("[TriviaAnswer POST] DynamoDB message fetch failed:", dynErr);
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
        console.warn("[TriviaAnswer POST] Firestore message fetch failed:", fsErr);
      }
    }

    if (!msgExists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const msgRef = roomRef.collection("messages").doc(msgId);
    const data = msgItem || fallbackMsgData || {};
    if (data.type !== "trivia") return NextResponse.json({ error: "Not a trivia message" }, { status: 400 });
    const q = data.triviaQuestions?.[questionIndex];
    if (!q) return NextResponse.json({ error: "Invalid questionIndex" }, { status: 400 });

    const correctOpt = q.options.find((o: any) => o.isCorrect);
    const correctOption = correctOpt?.label ?? null;

    // 2. Check if already answered in DynamoDB first
    let existingAnswerData: any = null;
    let fetchedAnswerFromDynamo = false;

    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `TRIVIA_ANSWER#${msgId}#${resolvedUserId}#${questionIndex}` }
      }));
      if (getRes.Item) {
        existingAnswerData = getRes.Item;
        fetchedAnswerFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[TriviaAnswer POST] DynamoDB answer check failed:", dynErr);
    }

    const answerRef = msgRef.collection("triviaAnswers").doc(`${resolvedUserId}_${questionIndex}`);

    if (!fetchedAnswerFromDynamo) {
      try {
        const snap = await answerRef.get();
        if (snap.exists) {
          existingAnswerData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[TriviaAnswer POST] Firestore answer check failed:", fsErr);
      }
    }

    if (existingAnswerData) {
      return NextResponse.json({
        success: true,
        message: "Already answered",
        isCorrect: existingAnswerData.isCorrect,
        correctOption,
        selectedOption: existingAnswerData.selectedOption,
        triviaParticipants: data.triviaParticipants?.[questionIndex] ?? 0,
      });
    }

    const isCorrect = selectedOption === correctOption;
    const now = Date.now();
    const updatedParticipantsMap = { ...(data.triviaParticipants || {}) };
    updatedParticipantsMap[questionIndex] = (updatedParticipantsMap[questionIndex] || 0) + 1;

    // 3. Write to DynamoDB
    try {
      // A. Put answer record
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `TRIVIA_ANSWER#${msgId}#${resolvedUserId}#${questionIndex}`,
          userId: resolvedUserId,
          questionIndex,
          selectedOption,
          isCorrect,
          createdAt: now,
        }
      }));

      // B. Update Parent Message triviaParticipants map
      if (msgItem && msgSk) {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: msgSk },
          UpdateExpression: "SET triviaParticipants = :tp, updatedAt = :u",
          ExpressionAttributeValues: {
            ":tp": updatedParticipantsMap,
            ":u": now
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[TriviaAnswer POST] DynamoDB write failed:", dynErr);
    }

    // 4. Sync/Fallback to Firestore
    try {
      const batch = db.batch();
      batch.set(answerRef, {
        userId: resolvedUserId,
        questionIndex,
        selectedOption,
        isCorrect,
        createdAt: now,
      });
      batch.update(msgRef, {
        [`triviaParticipants.${questionIndex}`]: FieldValue.increment(1),
      });
      await batch.commit();
    } catch (fsErr) {
      console.warn("[TriviaAnswer POST] Firestore sync failed:", fsErr);
    }

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

      awardRoarPoints({
        actualUserId: resolvedUserId,
        authUserId: user.userId,
        userName: info.userName ?? "",
        userEmail: user.email,
        userExists: true,
        postType: "quiz",
        transactionId: `roar_trivia_${msgId}_${questionIndex}_${resolvedUserId}`,
        metadata: {
          postId: msgId,
          roomId,
          questionIndex,
          watchAlongRoomId,
          roarRoomId
        },
      }).catch((err) => console.warn("[trivia-answer] award points failed:", err));
    }

    const updatedParticipants = (data.triviaParticipants?.[questionIndex] ?? 0) + 1;

    return NextResponse.json({
      success: true,
      isCorrect,
      correctOption,
      triviaParticipants: updatedParticipants,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST trivia-answer error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}