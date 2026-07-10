// api/roar/rooms/[roomId]/messages/[msgId]/voters/route.ts
//
// Returns who voted for each option on a room message (debate / prediction).
// Visible to every fan in the room — not author-gated, since ROAR room
// activity is inherently public within the room.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

interface VoterEntry {
  uid: string;
  username: string;
  avatarUrl?: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> },
) {
  try {
    const { roomId, msgId } = await params;

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const msgRef = db
      .collection("roarRooms")
      .doc(roomId)
      .collection("messages")
      .doc(msgId);

    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const msgData = msgSnap.data() as {
      type?: string;
      sideA?: string;
      sideB?: string;
      predictionOptions?: string[];
    };
    const msgType = msgData.type ?? "";

    if (msgType !== "debate" && msgType !== "prediction" && msgType !== "hottake" && msgType !== "hot_take") {
      return NextResponse.json(
        { error: "Voter list is only available for debate/prediction posts" },
        { status: 400 },
      );
    }

    // ── Resolve the option labels in vote-value order ──────────────────────
    // vote values are always "agree" | "disagree" | "option_N" (N >= 2).
    // predictionOptions[0]/[1] map to agree/disagree; sideA/sideB do the
    // same for debates. Fall back to generic labels if neither is present.
    const optionLabels: Record<string, string> = {
      agree: msgData.predictionOptions?.[0] ?? msgData.sideA ?? "Option A",
      disagree: msgData.predictionOptions?.[1] ?? msgData.sideB ?? "Option B",
    };
    if (Array.isArray(msgData.predictionOptions)) {
      msgData.predictionOptions.forEach((label, idx) => {
        if (idx >= 2) optionLabels[`option_${idx}`] = label;
      });
    }

    // ── Fetch all votes for this message ────────────────────────────────────
    const votesSnap = await msgRef.collection("votes").get();

    const votersByOption: Record<string, VoterEntry[]> = {};
    const voterUids = votesSnap.docs
      .map((d) => (d.data() as { userId?: string }).userId ?? d.id);

    const userRefs = voterUids.map((uid) => db.collection("users").doc(uid));
    const userSnaps = userRefs.length > 0 ? await db.getAll(...userRefs) : [];

    const userInfoByUid = new Map<string, { username: string; avatarUrl?: string }>();
    userSnaps.forEach((snap) => {
      if (snap.exists) {
        const d = snap.data() as { username?: string; avatarUrl?: string; avatar?: string };
        userInfoByUid.set(snap.id, {
          username: d.username ?? snap.id,
          avatarUrl: d.avatarUrl ?? d.avatar,
        });
      }
    });

    votesSnap.docs.forEach((doc) => {
      const data = doc.data() as { vote?: string; userId?: string };
      const vote = data.vote;
      if (!vote) return;
      const uid = data.userId ?? doc.id;
      const info = userInfoByUid.get(uid) ?? { username: uid };
      const entry: VoterEntry = { uid, username: info.username, avatarUrl: info.avatarUrl };
      if (!votersByOption[vote]) votersByOption[vote] = [];
      votersByOption[vote].push(entry);
    });

    // ── Build ordered options array (works for 2-option debates and
    // N-option predictions alike) ───────────────────────────────────────────
    const optionKeys = Object.keys(optionLabels).sort((a, b) => {
      const order = (k: string) => (k === "agree" ? 0 : k === "disagree" ? 1 : Number(k.replace("option_", "")));
      return order(a) - order(b);
    });

    const options = optionKeys.map((key) => ({
      key,
      label: optionLabels[key],
      voters: votersByOption[key] ?? [],
    }));

    const totalVotes = options.reduce((sum, o) => sum + o.voters.length, 0);

    return NextResponse.json({
      success: true,
      // Back-compat shape for the existing debate-only VotersDialog UI
      sideA: optionLabels.agree,
      sideB: optionLabels.disagree,
      voters: {
        agree: votersByOption.agree ?? [],
        disagree: votersByOption.disagree ?? [],
      },
      // Generic shape so predictions with >2 options can render fully
      options,
      totalVotes,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET room message voters error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}