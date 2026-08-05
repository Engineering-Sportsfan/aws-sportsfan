// api/roar/rooms/[roomId]/recap/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 500; // cap for recap aggregation reads

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. Fetch room presence / metadata from DynamoDB first
    let roomExists = false;
    let fetchedRoomFromDynamo = false;
    try {
      const candidates = [`ROOM#${roomId}`, roomId];
      for (const cand of candidates) {
        const getRes = await docClient.send(new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: cand, sk: `META#${roomId}` }
        }));
        if (getRes.Item) {
          roomExists = true;
          fetchedRoomFromDynamo = true;
          break;
        }
      }
    } catch (dynErr) {
      console.warn("[Recap GET] DynamoDB room fetch failed:", dynErr);
    }

    let roomRef = db.collection("roarRooms").doc(roomId);
    let fallbackRoomSnap: any = null;

    if (!roomExists) {
      try {
        let snap = await roomRef.get();
        if (!snap.exists) {
          roomRef = db.collection("watchAlongRooms").doc(roomId);
          snap = await roomRef.get();
        }
        if (snap.exists) {
          roomExists = true;
          fallbackRoomSnap = snap;
        }
      } catch (fsErr) {
        console.warn("[Recap GET] Firestore room fallback check failed:", fsErr);
      }
    }

    if (!roomExists) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    // 2. Fetch messages from DynamoDB first
    let messagesList: any[] = [];
    let fetchedMessagesFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": "MSG#" },
        Limit: MAX_MESSAGES
      }));

      if (res.Items) {
        messagesList = res.Items.map(item => ({
          msgId: (item.sk as string).replace(/^MSG#/, ""),
          ...item
        }));
        // Sort in memory by createdAt asc
        messagesList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        fetchedMessagesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Recap GET] DynamoDB messages query failed:", dynErr);
    }

    // Fallback: Check Firestore for messages
    if (!fetchedMessagesFromDynamo) {
      try {
        const messagesSnap = await roomRef
          .collection("messages")
          .orderBy("createdAt", "asc")
          .limit(MAX_MESSAGES)
          .get();

        messagesList = messagesSnap.docs.map((d) => ({
          msgId: d.id,
          ...d.data()
        }));
      } catch (fsErr) {
        console.error("[Recap GET] Firestore messages fallback query failed:", fsErr);
      }
    }

    if (messagesList.length === 0) {
      return NextResponse.json({ success: true, hasData: false });
    }

    // ── Timing ──────────────────────────────────────────────────────────
    const predLive = messagesList.find((m) => m.type === "predictions_live" && m.matchStartAt);
    const roomStartTs = predLive?.matchStartAt ?? messagesList[0].createdAt ?? Date.now();
    const roomEndTs = predLive?.matchEndAt ?? messagesList[messagesList.length - 1].createdAt ?? Date.now();
    const durationMs = Math.max(0, roomEndTs - roomStartTs);
    const durationLabel = `${Math.floor(durationMs / 3_600_000)}h ${Math.floor((durationMs % 3_600_000) / 60_000)}m`;

    const fmtTime = (ts: number) =>
      new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const fmtDate = (ts: number) =>
      new Date(ts).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });

    // ── Top post per type ──────────────────────────────────────────────
    const topOf = (type: string, scoreFn: (m: any) => number) =>
      messagesList.filter((m) => m.type === type).sort((a, b) => scoreFn(b) - scoreFn(a))[0] ?? null;

    const topPost = topOf("post", (m) => m.heartCount ?? 0);
    const topDebate = topOf("debate", (m) => m.agreeCount ?? 0);
    const topPrediction = topOf("prediction", (m) => m.heartCount ?? 0);

    // ── Contributor Leaderboard ────────────────────────────────────────
    const byAuthor = new Map<string, { username: string; likes: number; replies: number; posts: number }>();
    for (const m of messagesList) {
      if (!m.authorUid) continue;
      const entry = byAuthor.get(m.authorUid) ?? {
        username: m.authorUsername ?? "Unknown",
        likes: 0, replies: 0, posts: 0,
      };
      entry.likes += (m.heartCount ?? 0) + (m.agreeCount ?? 0);
      entry.replies += m.replyCount ?? 0;
      entry.posts += 1;
      byAuthor.set(m.authorUid, entry);
    }
    const leaderboard = Array.from(byAuthor.entries())
      .map(([uid, v]) => ({ uid, ...v, score: v.likes * 2 + v.replies }))
      .sort((a, b) => b.score - a.score);

    const topContributors = leaderboard.slice(0, 5).map((c, i) => ({
      rank: i + 1,
      initials: c.username.slice(0, 2).toUpperCase(),
      name: c.username,
      points: String(c.score),
    }));
    const mvp = leaderboard[0] ?? null;

    // ── Prediction poll % split (2-option predictions only) ───────────
    let predictionPoll: any = null;
    const pollMsg = messagesList.find(
      (m) => m.type === "prediction" && Array.isArray(m.predictionOptions) && m.predictionOptions.length === 2
    );

    if (pollMsg) {
      let votesData: any[] = [];
      let fetchedVotesFromDynamo = false;

      // Query DynamoDB for prediction votes
      try {
        const res = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `VOTE#${pollMsg.msgId || pollMsg.id}#` }
        }));
        if (res.Items) {
          votesData = res.Items;
          fetchedVotesFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[Recap GET] DynamoDB prediction votes failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedVotesFromDynamo) {
        try {
          const pollRef = roomRef.collection("messages").doc(pollMsg.msgId || pollMsg.id);
          const votesSnap = await pollRef.collection("votes").get();
          votesData = votesSnap.docs.map(doc => doc.data());
        } catch (fsErr) {
          console.error("[Recap GET] Firestore prediction votes failed:", fsErr);
        }
      }

      const tally: Record<string, number> = {};
      votesData.forEach((v) => {
        const opt = v.vote;
        if (opt) tally[opt] = (tally[opt] ?? 0) + 1;
      });

      const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
      const [optA, optB] = pollMsg.predictionOptions;
      predictionPoll = {
        question: pollMsg.text,
        options: [
          { label: optA, percent: Math.round(((tally[optA] ?? 0) / total) * 100) },
          { label: optB, percent: Math.round(((tally[optB] ?? 0) / total) * 100) },
        ],
        participantsCount: total,
      };
    }

    return NextResponse.json({
      success: true,
      hasData: true,
      timing: {
        roomStart: fmtTime(roomStartTs),
        roomEnd: fmtTime(roomEndTs),
        date: fmtDate(roomStartTs),
        duration: durationLabel,
      },
      topPost: topPost && {
        author: topPost.authorUsername,
        quote: topPost.text,
        likes: topPost.heartCount ?? 0,
        comments: topPost.replyCount ?? 0,
      },
      topDebate: topDebate && {
        author: topDebate.authorUsername,
        quote: topDebate.text,
        agrees: topDebate.agreeCount ?? 0,
      },
      topPrediction: topPrediction && {
        author: topPrediction.authorUsername,
        quote: topPrediction.text,
        likes: topPrediction.heartCount ?? 0,
      },
      predictionPoll,
      topContributors,
      mvp: mvp && {
        name: mvp.username,
        initials: mvp.username.slice(0, 2).toUpperCase(),
        reactions: mvp.likes,
        replies: mvp.replies,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET recap error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}