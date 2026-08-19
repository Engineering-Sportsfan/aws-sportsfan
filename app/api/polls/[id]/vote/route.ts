// app/api/polls/[id]/vote/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { Timestamp } from "firebase-admin/firestore";
import { VoteBody, PollOption } from "@/types/polls";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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

    const userId = body.userId || `anonymous_${req.headers.get("x-forwarded-for") || "unknown"}`;

    // 1. Check if voted & execute via Firebase transaction if available
    let updatedOptions: PollOption[] | null = null;

    if (db) {
      const ref = db.collection("polls").doc(id);
      const votesCollection = db.collection("pollVotes");

      try {
        updatedOptions = await db.runTransaction(async (tx) => {
          const voteDocRef = votesCollection.doc(`${id}_${userId}`);
          const existingVote = await tx.get(voteDocRef);

          if (existingVote.exists) {
            throw new Error("You have already voted in this poll");
          }

          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error("Poll not found");

          const data = snap.data()!;
          if (!data.active) throw new Error("Poll is closed");

          const endsAtDate = data.endsAt instanceof Timestamp ? data.endsAt.toDate() : new Date(data.endsAt);
          if (endsAtDate < new Date()) {
            tx.update(ref, { active: false });
            throw new Error("Poll has expired");
          }

          const options: PollOption[] = data.options;
          const optionIndex = options.findIndex((o) => o.id === body.optionId);
          if (optionIndex === -1) throw new Error("Option not found");

          options[optionIndex].votes += 1;
          tx.update(ref, { options });

          tx.set(voteDocRef, {
            pollId: id,
            userId: userId,
            optionId: body.optionId,
            votedAt: Date.now(),
          });

          return options;
        });
      } catch (txErr) {
        throw txErr;
      }
    }

    // 2. Dual Write Vote & Poll update to DynamoDB SocialAndContent table
    try {
      const voteItem = {
        contentId: `POLL#${id}`,
        sk: `VOTE#${userId}`,
        pollId: id,
        userId: userId,
        optionId: body.optionId,
        votedAt: Date.now(),
      };

      await dualWrite("pollVotes", `${id}_${userId}`, "SocialAndContent", voteItem);

      if (updatedOptions) {
        const pollDynamoItem = {
          contentId: `POLL#${id}`,
          sk: "POLL#META",
          id,
          options: updatedOptions,
          updatedAt: Date.now(),
        };
        await dualWrite("polls", id, "SocialAndContent", pollDynamoItem);
      }
    } catch (e) {
      console.warn("[polls vote] DynamoDB dualWrite notice:", e);
    }

    return NextResponse.json({ success: true, data: { options: updatedOptions } });
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    const status =
      message === "Poll not found" ? 404 :
      message === "Poll is closed" || message === "Poll has expired" ? 403 :
      message === "You have already voted in this poll" ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}