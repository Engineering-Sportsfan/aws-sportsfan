// api/roar/rooms/[roomId]/messages/[msgId]/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { awardRoarPointsByReason } from "@/lib/roarPoints";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { findRoomMessage } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

const ACCURACY_POINTS = 5;

async function createNotification(userId: string, data: Record<string, unknown>) {
  try {
    const baseRef = db.collection(getFirestoreCollection("notifications")).doc(userId);
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
  } catch (e) {
    console.warn("[createNotification] notice:", e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
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

    // 1. Fetch parent message
    const found = await findRoomMessage(roomId, msgId);
    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, msgSk, fromDynamo, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;

    const callerIds = new Set([
      user.userId,
      user.email,
      info.actualUserId,
      info.actualUserId?.replace(/[@.]/g, "_"),
    ].filter(Boolean).map(v => String(v).trim().toLowerCase()));

    const authorUid = String(msgItem.authorUid || "").trim().toLowerCase();
    const authorEmail = String(msgItem.authorEmail || "").trim().toLowerCase();
    const isAuthor = callerIds.has(authorUid) || callerIds.has(authorEmail) || (user.role === "admin");

    if (!isAuthor) {
      return NextResponse.json({ error: "Only the prediction author can resolve this prediction." }, { status: 403 });
    }

    if (msgItem.resolvedAt) {
      return NextResponse.json({ error: "Prediction is already resolved" }, { status: 409 });
    }

    const now = Date.now();
    const closedAt = msgItem.closedAt || now;

    // 2. Fetch votes to find winners
    let rawVotes: { userId: string; vote: string }[] = [];
    try {
      const votePrefix = `VOTE#${targetMsgId}#`;
      const qRes = await docClient.send(new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": roomIdKey,
          ":p": votePrefix,
        },
      }));
      if (qRes.Items) {
        rawVotes = qRes.Items.map(item => ({
          userId: item.userId || (item.sk as string).slice(votePrefix.length),
          vote: item.vote,
        }));
      }
    } catch (e) {
      console.warn("[RoomResolve POST] DynamoDB votes lookup notice:", e);
    }

    if (rawVotes.length === 0) {
      try {
        const cleanRoomId = roomId.replace(/^ROOM#/, "");
        const votesSnap = await db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId).collection("votes").get();
        if (!votesSnap.empty) {
          rawVotes = votesSnap.docs.map(doc => ({ userId: doc.id, vote: doc.data().vote }));
        }
      } catch (fsErr) {
        console.warn("[RoomResolve POST] Firestore fallback votes notice:", fsErr);
      }
    }

    // 3. Mark message as resolved in DynamoDB
    if (fromDynamo && msgSk) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: roomIdKey, sk: msgSk },
          UpdateExpression: "SET resolvedAt = :r, closedAt = :c, correctVote = :cv, accuracyAwarded = :a, updatedAt = :u",
          ExpressionAttributeValues: {
            ":r": now,
            ":c": closedAt,
            ":cv": correctVote,
            ":a": true,
            ":u": now,
          }
        }));
      } catch (dynErr) {
        console.warn("[RoomResolve POST] DynamoDB update notice:", dynErr);
      }
    }

    // 4. Update in Firestore
    try {
      const cleanRoomId = roomId.replace(/^ROOM#/, "");
      await db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId).set({
        resolvedAt: now,
        closedAt,
        correctVote,
        accuracyAwarded: true,
        updatedAt: now,
      }, { merge: true });
    } catch (fsErr) {
      console.warn("[RoomResolve POST] Firestore sync notice:", fsErr);
    }

    // 5. Award points & notify correct voters
    const correctVoters = rawVotes.filter(v => v.vote === correctVote);
    for (const v of correctVoters) {
      awardRoarPointsByReason({
        actualUserId: v.userId,
        authUserId: v.userId,
        userName: v.userId.includes("@") ? v.userId.split("@")[0] : "Fan",
        userEmail: v.userId.includes("@") ? v.userId : "",
        userExists: true,
        reason: "ROAR_PREDICTION_ACCURACY",
        points: ACCURACY_POINTS,
        transactionId: `roar_pred_acc_${targetMsgId}_${v.userId}`,
        metadata: {
          roomId,
          postId: targetMsgId,
          type: "prediction",
          correctVote,
        }
      }).catch(() => {});

      createNotification(v.userId, {
        type: "roar_prediction_correct",
        title: "Prediction Correct! 🎉",
        message: `Your prediction on "${msgItem.text || 'match'}" was correct! You won ${ACCURACY_POINTS} points.`,
        roomId,
        postId: targetMsgId,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: {
        id: targetMsgId,
        resolvedAt: now,
        closedAt,
        correctVote,
        accuracyAwarded: true,
      },
      correctCount: correctVoters.length,
      totalVoters: rawVotes.length,
    });
  } catch (error: any) {
    console.error("POST /api/roar/rooms/[roomId]/messages/[msgId]/resolve error:", error);
    return NextResponse.json({ error: error.message || "Failed to resolve prediction." }, { status: 500 });
  }
}
