// app/api/watch-along/matches/[id]/quiz/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { broadcastMatchEvent } from "@/lib/watchAlongEvents";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const emptyFirestoreQuizMatches = new Set<string>();

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches/[id]/quiz
   Query: ?active=true       → only the active question
          ?leaderboard=true  → top 20 scorers
          ?roomId=<roomId>   → room-isolated leaderboard (starts at 0)
          ?global=true       → all-time cumulative platform leaderboard
───────────────────────────────────────────── */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const leaderboard = searchParams.get("leaderboard") === "true";
    const isGlobal = searchParams.get("global") === "true";
    const roomId = searchParams.get("roomId") || id;

    const matchRef = db.collection(getFirestoreCollection("watchAlongMatches")).doc(id);

    if (leaderboard) {
      let entries: any[] = [];
      let lbDdbSuccess = false;
      const targetPk = isGlobal ? "GLOBAL#QUIZ_LEADERBOARD" : `ROOM#${roomId}`;

      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.GamificationAndWallet,
            KeyConditionExpression: "userId = :uId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":uId": targetPk,
              ":skPrefix": "QUIZ_LEADERBOARD#",
            },
            Limit: 50,
          })
        );
        lbDdbSuccess = true;
        if (qRes.Items && qRes.Items.length > 0) {
          entries = (qRes.Items as any[]).map((item) => ({
            userId: (item.sk as string).replace(/^QUIZ_LEADERBOARD#/, ""),
            displayName: item.displayName || "Fan Quizzer",
            avatarUrl: item.avatarUrl || "",
            totalPoints: Number(item.totalPoints || 0),
            updatedAt: item.updatedAt,
            roomId: item.roomId || (isGlobal ? undefined : roomId),
          }));
          entries.sort((a, b) => Number(b.totalPoints || 0) - Number(a.totalPoints || 0));
          entries = entries.slice(0, 20).map((entry, idx) => ({
            ...entry,
            rank: idx + 1,
          }));
        }
      } catch (e) {
        console.warn("[quiz leaderboard GET] DynamoDB notice:", e);
      }

      // Only fallback to Firestore if DynamoDB query itself failed (network/auth error)
      if (!lbDdbSuccess) {
        try {
          if (isGlobal) {
            const lbSnap = await db
              .collection(getFirestoreCollection("quiz_leaderboard"))
              .orderBy("totalPoints", "desc")
              .limit(20)
              .get();
            entries = lbSnap.docs.map((doc, idx) => ({
              userId: doc.id,
              rank: idx + 1,
              ...doc.data(),
            }));
          } else {
            const lbSnap = await matchRef
              .collection("rooms")
              .doc(roomId)
              .collection("quizLeaderboard")
              .orderBy("totalPoints", "desc")
              .limit(20)
              .get();
            entries = lbSnap.docs.map((doc, idx) => ({
              userId: doc.id,
              rank: idx + 1,
              ...doc.data(),
            }));
          }
        } catch (e) {
          console.warn("[quiz leaderboard GET] Firestore fallback notice:", e);
        }
      }

      return NextResponse.json({
        success: true,
        leaderboard: entries,
        scope: isGlobal ? "global" : "room",
        roomId: isGlobal ? undefined : roomId,
      });
    }

    let questions: any[] = [];
    let ddbHasQuestions = false;
    let ddbSuccess = false;

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.GamificationAndWallet,
          KeyConditionExpression: "userId = :uId AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":uId": `MATCH#${id}`,
            ":skPrefix": "QUIZ#",
          },
          Limit: 50,
        })
      );
      ddbSuccess = true;

      if (qRes.Items && qRes.Items.length > 0) {
        ddbHasQuestions = true;
        let items = (qRes.Items as any[]).map((item) => {
          const { correctAnswer, ...safe } = item;
          void correctAnswer;
          return {
            id: (item.sk as string).replace(/^QUIZ#/, "") || item.id,
            ...safe,
          };
        });
        if (activeOnly) {
          items = items.filter((q) => q.isActive === true);
        }
        items.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        questions = activeOnly ? items.slice(0, 1) : items;
      }
    } catch (e) {
      console.warn("[quiz questions GET] DynamoDB notice:", e);
    }

    // Only fallback to Firestore if DynamoDB errored or had 0 items AND Firestore wasn't already verified empty
    if (!ddbHasQuestions && (!ddbSuccess || !emptyFirestoreQuizMatches.has(id))) {
      let query: FirebaseFirestore.Query = matchRef
        .collection("quizQuestions")
        .orderBy("createdAt", "desc");
      if (activeOnly) {
        query = query.where("isActive", "==", true).limit(1);
      } else {
        query = query.limit(20);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        emptyFirestoreQuizMatches.add(id);
      } else {
        questions = snapshot.docs.map((doc) => {
          const data = doc.data();
          const { correctAnswer, ...safe } = data;
          void correctAnswer;
          return { id: doc.id, ...safe };
        });
      }
    }

    return NextResponse.json({ success: true, questions });
  } catch (error) {
    console.error("[quiz GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/quiz
───────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const matchRef = db.collection(getFirestoreCollection("watchAlongMatches")).doc(id);

    // ── CREATE ──
    if (action === "create") {
      const user = await getUserSessionAndRole(req);
      if (!user) {
        return NextResponse.json(
          { success: false, message: "Unauthorized - Authentication required" },
          { status: 401 }
        );
      }

      const isAuth = await isAuthorizedForMatch(user, id);
      if (!isAuth) {
        return NextResponse.json(
          { success: false, message: "Forbidden - Insufficient permissions" },
          { status: 403 }
        );
      }

      const { question, options, correctAnswer, timerSeconds = 15, points = 10, roomId } = body;

      if (!question?.trim() || !Array.isArray(options) || options.length < 2 || !correctAnswer) {
        return NextResponse.json(
          { success: false, message: "question, options (≥2), and correctAnswer are required" },
          { status: 400 }
        );
      }
      if (!options.includes(correctAnswer)) {
        return NextResponse.json(
          { success: false, message: "correctAnswer must be one of the options" },
          { status: 400 }
        );
      }

      const questionId = uuidv4();
      const now = Date.now();
      const questionData = {
        id: questionId,
        question: question.trim(),
        options,
        correctAnswer,
        timerSeconds,
        points,
        isActive: true,
        opensAt: now,
        closesAt: now + timerSeconds * 1000,
        competing: 0,
        roomId: roomId || null,
        createdAt: now,
        updatedAt: now,
      };

      await dualWrite({
        tableName: TABLES.GamificationAndWallet,
        dynamoItem: {
          userId: `MATCH#${id}`,
          sk: `QUIZ#${questionId}`,
          ...questionData,
        },
        firestoreRef: matchRef.collection("quizQuestions").doc(questionId),
        firestoreData: questionData,
      });

      emptyFirestoreQuizMatches.delete(id);

      const { correctAnswer: _ca, ...safeData } = questionData;
      const quizPayload = { ...safeData, id: questionId };

      broadcastMatchEvent(id, {
        type: "NEW_QUIZ",
        quiz: quizPayload,
      });

      return NextResponse.json({ success: true, question: quizPayload });
    }

    // ── ANSWER ──
    if (action === "answer") {
      const { questionId, option, userId, displayName, roomId, avatarUrl } = body;
      const effectiveRoomId = roomId || id;

      if (!questionId || !option || !userId) {
        return NextResponse.json(
          { success: false, message: "questionId, option, and userId are required" },
          { status: 400 }
        );
      }

      let q: any = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.GamificationAndWallet,
            Key: { userId: `MATCH#${id}`, sk: `QUIZ#${questionId}` },
          })
        );
        if (getRes.Item) q = getRes.Item;
      } catch (e) {
        // fallback
      }

      if (!q) {
        const qRef = matchRef.collection("quizQuestions").doc(questionId);
        const qDoc = await qRef.get();
        if (!qDoc.exists) {
          return NextResponse.json({ success: false, message: "Question not found" }, { status: 404 });
        }
        q = qDoc.data();
      }

      if (!q.options.includes(option)) {
        return NextResponse.json({ success: false, message: "Invalid option" }, { status: 400 });
      }

      // Check if already answered
      let alreadyAnswered = false;
      try {
        const ansCheck = await docClient.send(
          new GetCommand({
            TableName: TABLES.GamificationAndWallet,
            Key: { userId: `MATCH#${id}`, sk: `QUIZ_ANSWER#${questionId}#${userId}` },
          })
        );
        if (ansCheck.Item) alreadyAnswered = true;
      } catch (e) {
        // ignore
      }

      if (alreadyAnswered) {
        return NextResponse.json({ success: false, message: "Already answered" }, { status: 409 });
      }

      const isCorrect = option === q.correctAnswer;
      const earnedPoints = isCorrect ? (q.points || 10) : 0;
      const now = Date.now();

      const answerData = {
        option,
        isCorrect,
        points: earnedPoints,
        roomId: effectiveRoomId,
        answeredAt: now,
      };

      // Write answer
      await dualWrite({
        tableName: TABLES.GamificationAndWallet,
        dynamoItem: {
          userId: `MATCH#${id}`,
          sk: `QUIZ_ANSWER#${questionId}#${userId}`,
          questionId,
          userTargetId: userId,
          ...answerData,
        },
        firestoreRef: matchRef.collection("quizQuestions").doc(questionId).collection("answers").doc(userId),
        firestoreData: answerData,
      });

      // Update question competing count in DynamoDB
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.GamificationAndWallet,
            Key: { userId: `MATCH#${id}`, sk: `QUIZ#${questionId}` },
            UpdateExpression: "ADD competing :inc SET updatedAt = :now",
            ExpressionAttributeValues: { ":inc": 1, ":now": now },
          })
        );
      } catch (e) {
        // ignore
      }

      // Update in Firestore
      try {
        await matchRef.collection("quizQuestions").doc(questionId).update({
          competing: FieldValue.increment(1),
          updatedAt: now,
        });
      } catch (e) {
        // ignore
      }

      if (isCorrect) {
        // 1. Update Room-Isolated Leaderboard in DynamoDB (starts at 0 for every unique room)
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.GamificationAndWallet,
              Key: { userId: `ROOM#${effectiveRoomId}`, sk: `QUIZ_LEADERBOARD#${userId}` },
              UpdateExpression: "ADD totalPoints :pts SET displayName = :dn, avatarUrl = :av, updatedAt = :now, roomId = :rid",
              ExpressionAttributeValues: {
                ":pts": earnedPoints,
                ":dn": displayName || userId,
                ":av": avatarUrl || "",
                ":now": now,
                ":rid": effectiveRoomId,
              },
            })
          );
        } catch (e) {
          console.warn("[quiz answer] Room leaderboard update notice:", e);
        }

        // 2. Update Global Cumulative Leaderboard in DynamoDB
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.GamificationAndWallet,
              Key: { userId: "GLOBAL#QUIZ_LEADERBOARD", sk: `QUIZ_LEADERBOARD#${userId}` },
              UpdateExpression: "ADD totalPoints :pts SET displayName = :dn, avatarUrl = :av, updatedAt = :now",
              ExpressionAttributeValues: {
                ":pts": earnedPoints,
                ":dn": displayName || userId,
                ":av": avatarUrl || "",
                ":now": now,
              },
            })
          );
        } catch (e) {
          console.warn("[quiz answer] Global leaderboard update notice:", e);
        }

        // 3. Update in Firestore for dual-write compatibility
        try {
          // Room leaderboard collection
          await matchRef
            .collection("rooms")
            .doc(effectiveRoomId)
            .collection("quizLeaderboard")
            .doc(userId)
            .set(
              {
                displayName: displayName || userId,
                avatarUrl: avatarUrl || "",
                totalPoints: FieldValue.increment(earnedPoints),
                updatedAt: now,
                roomId: effectiveRoomId,
              },
              { merge: true }
            );

          // Global quiz leaderboard collection
          await db
            .collection(getFirestoreCollection("quiz_leaderboard"))
            .doc(userId)
            .set(
              {
                displayName: displayName || userId,
                avatarUrl: avatarUrl || "",
                totalPoints: FieldValue.increment(earnedPoints),
                updatedAt: now,
              },
              { merge: true }
            );
        } catch (e) {
          // ignore
        }

        // 4. Real-time broadcast to room subscribers
        broadcastMatchEvent(id, {
          type: "QUIZ_LEADERBOARD_UPDATE",
          roomId: effectiveRoomId,
          userId,
          displayName: displayName || userId,
          avatarUrl: avatarUrl || "",
          pointsEarned: earnedPoints,
        });
      }

      return NextResponse.json({
        success: true,
        isCorrect,
        correctAnswer: q.correctAnswer,
        pointsEarned: earnedPoints,
        roomId: effectiveRoomId,
      });
    }

    // ── RESET ROOM LEADERBOARD ──
    if (action === "reset_room_leaderboard") {
      const user = await getUserSessionAndRole(req);
      if (!user) {
        return NextResponse.json(
          { success: false, message: "Unauthorized - Authentication required" },
          { status: 401 }
        );
      }

      const isAuth = await isAuthorizedForMatch(user, id);
      if (!isAuth) {
        return NextResponse.json(
          { success: false, message: "Forbidden - Insufficient permissions" },
          { status: 403 }
        );
      }

      const { roomId } = body;
      const targetRoomId = roomId || id;

      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.GamificationAndWallet,
            KeyConditionExpression: "userId = :uId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":uId": `ROOM#${targetRoomId}`,
              ":skPrefix": "QUIZ_LEADERBOARD#",
            },
          })
        );

        if (qRes.Items && qRes.Items.length > 0) {
          for (const item of qRes.Items) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.GamificationAndWallet,
                Key: { userId: item.userId, sk: item.sk },
              })
            );
          }
        }

        try {
          const roomLbDocs = await matchRef
            .collection("rooms")
            .doc(targetRoomId)
            .collection("quizLeaderboard")
            .get();
          for (const d of roomLbDocs.docs) {
            await d.ref.delete();
          }
        } catch {
          // ignore
        }

        broadcastMatchEvent(id, {
          type: "QUIZ_LEADERBOARD_RESET",
          roomId: targetRoomId,
        });

        return NextResponse.json({
          success: true,
          message: `Leaderboard reset for room ${targetRoomId}`,
        });
      } catch (err) {
        console.error("[quiz reset_room_leaderboard]", err);
        return NextResponse.json(
          { success: false, message: (err as Error).message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: false, message: "Invalid action. Use 'create', 'answer', or 'reset_room_leaderboard'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[quiz POST]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   PATCH  /api/watch-along/matches/[id]/quiz
───────────────────────────────────────────── */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const isAuth = await isAuthorizedForMatch(user, id);
    if (!isAuth) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { questionId, isActive } = await req.json();

    if (!questionId || typeof isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "questionId and isActive (boolean) are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { isActive, updatedAt: now };

    if (isActive) {
      updates.opensAt = now;
      updates.closesAt = now + 15 * 1000;
    }

    // Update DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.GamificationAndWallet,
          Key: { userId: `MATCH#${id}`, sk: `QUIZ#${questionId}` },
          UpdateExpression: "SET isActive = :act, updatedAt = :now" + (isActive ? ", opensAt = :op, closesAt = :cl" : ""),
          ExpressionAttributeValues: {
            ":act": isActive,
            ":now": now,
            ...(isActive ? { ":op": now, ":cl": now + 15000 } : {}),
          },
        })
      );
    } catch (e) {
      console.warn("[quiz PATCH] DynamoDB update notice:", e);
    }

    // Update Firestore
    try {
      const matchRef = db.collection(getFirestoreCollection("watchAlongMatches")).doc(id);
      await matchRef.collection("quizQuestions").doc(questionId).update(updates);
    } catch (e) {
      console.warn("[quiz PATCH] Firestore update notice:", e);
    }

    broadcastMatchEvent(id, {
      type: isActive ? "QUIZ_ACTIVATED" : "QUIZ_DEACTIVATED",
      questionId,
      isActive,
      closesAt: isActive ? now + 15000 : null,
    });

    return NextResponse.json({
      success: true,
      message: `Question ${isActive ? "activated" : "deactivated"}`,
    });
  } catch (error) {
    console.error("[quiz PATCH]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}