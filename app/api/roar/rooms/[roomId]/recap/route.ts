import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

const MAX_MESSAGES = 500; // cap for recap aggregation reads

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let roomRef = db.collection("roarRooms").doc(roomId);
    let roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      roomRef = db.collection("watchAlongRooms").doc(roomId);
      roomSnap = await roomRef.get();
      if (!roomSnap.exists) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const room = roomSnap.data() as any;

    const messagesSnap = await roomRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .limit(MAX_MESSAGES)
      .get();

    if (messagesSnap.empty) {
      return NextResponse.json({ success: true, hasData: false });
    }

    const msgs = messagesSnap.docs.map((d) => ({ msgId: d.id, ref: d.ref, ...(d.data() as any) }));

    // ── Timing ──────────────────────────────────────────────────────────
    const predLive = msgs.find((m) => m.type === "predictions_live" && m.matchStartAt);
    const roomStartTs = predLive?.matchStartAt ?? msgs[0].createdAt;
    const roomEndTs = predLive?.matchEndAt ?? msgs[msgs.length - 1].createdAt;
    const durationMs = Math.max(0, roomEndTs - roomStartTs);
    const durationLabel = `${Math.floor(durationMs / 3_600_000)}h ${Math.floor((durationMs % 3_600_000) / 60_000)}m`;

    const fmtTime = (ts: number) =>
      new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const fmtDate = (ts: number) =>
      new Date(ts).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });

    // ── Top post per type ──────────────────────────────────────────────
    const topOf = (type: string, scoreFn: (m: any) => number) =>
      msgs.filter((m) => m.type === type).sort((a, b) => scoreFn(b) - scoreFn(a))[0] ?? null;

    const topPost = topOf("post", (m) => m.heartCount ?? 0);
    const topDebate = topOf("debate", (m) => m.agreeCount ?? 0);
    const topPrediction = topOf("prediction", (m) => m.heartCount ?? 0);

    // ── Contributor leaderboard ────────────────────────────────────────
    const byAuthor = new Map<string, { username: string; likes: number; replies: number; posts: number }>();
    for (const m of msgs) {
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
    const pollMsg = msgs.find(
      (m) => m.type === "prediction" && Array.isArray(m.predictionOptions) && m.predictionOptions.length === 2
    );
    if (pollMsg) {
      const votesSnap = await pollMsg.ref.collection("votes").get();
      const tally: Record<string, number> = {};
      votesSnap.docs.forEach((v) => {
        const opt = (v.data() as any).vote;
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
        // NOTE: not true prediction accuracy — no correctness field exists yet
        // for `prediction`/`predictions_live` votes. Placeholder until a
        // match-result field lets us score votes against the actual outcome.
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET recap error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}