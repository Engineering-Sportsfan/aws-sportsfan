

// api/roar/posts/[postId]/quiz-answer/route.ts

 
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { awardRoarPoints } from "@/lib/roarPoints";
 
export async function POST(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
 
    const { selectedOption } = await req.json();
    if (!selectedOption) {
      return NextResponse.json({ error: "selectedOption is required" }, { status: 400 });
    }
 
    const postRef = db.collection("roarPosts").doc(params.postId);
    const postSnap = await postRef.get();
 
    if (!postSnap.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
 
    const postData = postSnap.data() as any;
    if (postData.type !== "quiz") {
      return NextResponse.json({ error: "Not a quiz post" }, { status: 400 });
    }
 
    // Resolve userId
    let userSnap = await db.collection("users").doc(user.email).get();
    let resolvedUserId = user.email;
    if (!userSnap.exists) {
      userSnap = await db.collection("users").doc(user.userId).get();
      resolvedUserId = user.userId;
    }
 
    // Check if already answered
    const answerRef = postRef.collection("quizAnswers").doc(resolvedUserId);
    const existingAnswer = await answerRef.get();
    if (existingAnswer.exists) {
      return NextResponse.json({
        success: false,
        message: "Already answered",
        correctOption: postData.quizCorrectOption,
        isCorrect: existingAnswer.data()?.selectedOption === postData.quizCorrectOption,
      });
    }
 
    const isCorrect = selectedOption === postData.quizCorrectOption;
    const now = Date.now();
 
    // Batch: record answer + increment participant count
    const batch = db.batch();
    batch.set(answerRef, {
      userId: resolvedUserId,
      selectedOption,
      isCorrect,
      answeredAt: now,
    });
    batch.update(postRef, {
      quizParticipants: (postData.quizParticipants ?? 0) + 1,
      updatedAt: now,
    });
    await batch.commit();
 
    // Award 2 pts to answerer (correct answers only) — idempotent
    if (isCorrect && userSnap.exists) {
      const userData = userSnap.data() as any;
      await awardRoarPoints({
        actualUserId: resolvedUserId,
        authUserId: user.userId,
        userName: userData.username ?? resolvedUserId,
        userEmail: user.email,
        userExists: true,
        postType: "quiz",
        transactionId: `quiz_answer_${params.postId}_${resolvedUserId}`,
        metadata: { postId: params.postId, selectedOption },
      });
    }
 
    return NextResponse.json({
      success: true,
      isCorrect,
      correctOption: postData.quizCorrectOption,
      quizParticipants: (postData.quizParticipants ?? 0) + 1,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts/[postId]/quiz-answer error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
 