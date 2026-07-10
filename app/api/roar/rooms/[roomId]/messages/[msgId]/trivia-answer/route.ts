//api/roar/[roomId]/mesages/[msgId]/trivia-answer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPoints } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";

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
    if (!info.exists) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    const resolvedUserId = info.actualUserId;

    const msgRef = db.collection("roarRooms").doc(roomId).collection("messages").doc(msgId);
    const answerRef = msgRef.collection("triviaAnswers").doc(`${resolvedUserId}_${questionIndex}`);

    const [msgSnap, existingAnswer] = await Promise.all([msgRef.get(), answerRef.get()]);
    if (!msgSnap.exists) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const data = msgSnap.data() as any;
    if (data.type !== "trivia") return NextResponse.json({ error: "Not a trivia message" }, { status: 400 });
    const q = data.triviaQuestions?.[questionIndex];
    if (!q) return NextResponse.json({ error: "Invalid questionIndex" }, { status: 400 });

    const correctOpt = q.options.find((o: any) => o.isCorrect);
    const correctOption = correctOpt?.label ?? null;

    if (existingAnswer.exists) {
      const prev = existingAnswer.data() as any;
      return NextResponse.json({
        success: true,
        message: "Already answered",
        isCorrect: prev.isCorrect,
        correctOption,
        selectedOption: prev.selectedOption,
        triviaParticipants: data.triviaParticipants?.[questionIndex] ?? 0,
      });
    }

    const isCorrect = selectedOption === correctOption;

    const batch = db.batch();
    batch.set(answerRef, {
      userId: resolvedUserId,
      questionIndex,
      selectedOption,
      isCorrect,
      createdAt: Date.now(),
    });
    batch.update(msgRef, {
      [`triviaParticipants.${questionIndex}`]: FieldValue.increment(1),
    });
    await batch.commit();

    if (isCorrect) {
      awardRoarPoints({
        actualUserId: resolvedUserId,
        authUserId: user.userId,
        userName: info.userName ?? "",
        userEmail: user.email,
        userExists: true,
        postType: "quiz",
        transactionId: `roar_trivia_${msgId}_${questionIndex}_${resolvedUserId}`,
        metadata: { postId: msgId, roomId, questionIndex },
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