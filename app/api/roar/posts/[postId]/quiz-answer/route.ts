// api/roar/posts/[postId]/quiz-answer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { awardRoarPoints } from "@/lib/roarPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { postId } = resolvedParams;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { selectedOption } = await req.json();
    if (!selectedOption) {
      return NextResponse.json({ error: "selectedOption is required" }, { status: 400 });
    }

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
      console.warn("[QuizAnswer POST] DynamoDB post fetch failed:", dynErr);
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
        console.warn("[QuizAnswer POST] Firestore post fetch failed:", fsErr);
      }
    }

    if (!postExists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const postData = postItem || fallbackPostData || {};
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

    // 2. Check if already answered in DynamoDB first
    let existingAnswerData: any = null;
    let fetchedAnswerFromDynamo = false;

    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "SocialAndContent",
        Key: { contentId: `POST#${postId}`, sk: `QUIZ_ANSWER#${resolvedUserId}` }
      }));
      if (getRes.Item) {
        existingAnswerData = getRes.Item;
        fetchedAnswerFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[QuizAnswer POST] DynamoDB answer check failed:", dynErr);
    }

    const answerRef = postRef.collection("quizAnswers").doc(resolvedUserId);

    if (!fetchedAnswerFromDynamo) {
      try {
        const snap = await answerRef.get();
        if (snap.exists) {
          existingAnswerData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[QuizAnswer POST] Firestore answer check failed:", fsErr);
      }
    }

    if (existingAnswerData) {
      return NextResponse.json({
        success: false,
        message: "Already answered",
        correctOption: postData.quizCorrectOption,
        isCorrect: existingAnswerData.selectedOption === postData.quizCorrectOption,
      });
    }

    const isCorrect = selectedOption === postData.quizCorrectOption;
    const now = Date.now();
    const newParticipantsCount = (postData.quizParticipants ?? 0) + 1;

    // 3. Write to DynamoDB
    try {
      // A. Put answer record
      await docClient.send(new PutCommand({
        TableName: "SocialAndContent",
        Item: {
          contentId: `POST#${postId}`,
          sk: `QUIZ_ANSWER#${resolvedUserId}`,
          userId: resolvedUserId,
          selectedOption,
          isCorrect,
          answeredAt: now,
        }
      }));

      // B. Update Parent Post
      if (postItem) {
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: postItem.sk },
          UpdateExpression: "SET quizParticipants = :qp, updatedAt = :u",
          ExpressionAttributeValues: {
            ":qp": newParticipantsCount,
            ":u": now
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[QuizAnswer POST] DynamoDB write failed:", dynErr);
    }

    // 4. Sync/Fallback to Firestore
    try {
      const batch = db.batch();
      batch.set(answerRef, {
        userId: resolvedUserId,
        selectedOption,
        isCorrect,
        answeredAt: now,
      });
      batch.update(postRef, {
        quizParticipants: newParticipantsCount,
        updatedAt: now,
      });
      await batch.commit();
    } catch (fsErr) {
      console.warn("[QuizAnswer POST] Firestore sync failed:", fsErr);
    }

    // Award 2 pts to answerer (correct answers only)
    if (isCorrect && userSnap.exists) {
      const userData = userSnap.data() as any;
      awardRoarPoints({
        actualUserId: resolvedUserId,
        authUserId: user.userId,
        userName: userData.username ?? resolvedUserId,
        userEmail: user.email,
        userExists: true,
        postType: "quiz",
        transactionId: `quiz_answer_${postId}_${resolvedUserId}`,
        metadata: { postId, selectedOption },
      }).catch((pointsErr) => console.error("[QuizAnswer POST] Failed to award points:", pointsErr));
    }

    return NextResponse.json({
      success: true,
      isCorrect,
      correctOption: postData.quizCorrectOption,
      quizParticipants: newParticipantsCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts/[postId]/quiz-answer error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}