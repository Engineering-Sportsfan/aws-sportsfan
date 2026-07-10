import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { VoteBody, PollOption } from "@/types/polls";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unknown error occurred";
}

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 2];
}

// ─── POST /api/polls/:id/vote ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Poll ID is required" }, { status: 400 });
    }
    
    const body: VoteBody & { userId?: string } = await req.json();

    if (!body.optionId) {
      return NextResponse.json({ success: false, error: "optionId is required" }, { status: 400 });
    }

    // Use anonymous ID if no userId provided, or use the actual userId
    const userId = body.userId || `anonymous_${req.headers.get("x-forwarded-for") || "unknown"}`;

    const ref = db.collection("polls").doc(id);
    const votesCollection = db.collection("pollVotes");

    const result = await db.runTransaction(async (tx) => {
      // 1. Check if user has already voted
      const voteDocRef = votesCollection.doc(`${id}_${userId}`);
      const existingVote = await tx.get(voteDocRef);
      
      if (existingVote.exists) {
        throw new Error("You have already voted in this poll");
      }

      // 2. Get poll data
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Poll not found");

      const data = snap.data()!;
      if (!data.active) throw new Error("Poll is closed");

      if ((data.endsAt as Timestamp).toDate() < new Date()) {
        tx.update(ref, { active: false });
        throw new Error("Poll has expired");
      }

      // 3. Update vote count
      const options: PollOption[] = data.options;
      const optionIndex = options.findIndex((o) => o.id === body.optionId);
      if (optionIndex === -1) throw new Error("Option not found");

      options[optionIndex].votes += 1;
      tx.update(ref, { options });

      // 4. Record user's vote
      tx.set(voteDocRef, {
        pollId: id,
        userId: userId,
        optionId: body.optionId,
        votedAt: Date.now(),
      });

      return options;
    });

    return NextResponse.json({ success: true, data: { options: result } });
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    const status =
      message === "Poll not found" ? 404 :
      message === "Poll is closed" || message === "Poll has expired" ? 403 :
      message === "You have already voted in this poll" ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}