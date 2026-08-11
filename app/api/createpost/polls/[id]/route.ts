// app/api/createpost/polls/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  return pathParts[pathParts.length - 1] || null;
}

interface VotedByEntry {
  voterId: string;
  userName: string;
}

function hasAlreadyVoted(
  votedBy: (string | VotedByEntry)[],
  voterId: string
): boolean {
  return votedBy.some((v) =>
    typeof v === "string" ? v === voterId : v.voterId === voterId
  );
}

async function fetchPostForPoll(id: string): Promise<Record<string, unknown> | null> {
  const candidates = [`POST#${id}`, `POST_ROAR#${id}`, id];

  for (const contentId of candidates) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": contentId },
          Limit: 1,
        })
      );
      if (res.Items && res.Items.length > 0) {
        return res.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn(`DynamoDB poll post candidate ${contentId} notice:`, err);
    }
  }

  // Fallback to Firebase
  try {
    const doc = await db.collection("socialPosts").doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as Record<string, unknown>;
    }
  } catch (err) {
    console.warn("Firebase poll post fallback notice:", err);
  }

  return null;
}

export async function POST(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  try {
    const { optionId, voterId, userName } = await req.json();

    if (!optionId || !voterId || !userName) {
      return NextResponse.json(
        {
          success: false,
          error: "optionId, voterId, and userName are required",
        },
        { status: 400 }
      );
    }

    const postData = await fetchPostForPoll(id);
    if (!postData) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    const poll = postData.poll as {
      options: Array<{ id: string; text: string; votes: number }>;
      totalVotes: number;
      endsAt: number;
      votedBy: Array<string | VotedByEntry>;
    } | undefined;

    if (!poll) {
      return NextResponse.json(
        { success: false, error: "This post has no poll" },
        { status: 400 }
      );
    }

    if (Date.now() > poll.endsAt) {
      return NextResponse.json(
        { success: false, error: "This poll has ended" },
        { status: 400 }
      );
    }

    if (Array.isArray(poll.votedBy) && hasAlreadyVoted(poll.votedBy, voterId)) {
      return NextResponse.json(
        { success: false, error: "You have already voted on this poll" },
        { status: 400 }
      );
    }

    const optionIndex = poll.options.findIndex((o) => o.id === optionId);
    if (optionIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Invalid option ID" },
        { status: 400 }
      );
    }

    const updatedOptions = poll.options.map((o, idx) =>
      idx === optionIndex ? { ...o, votes: (o.votes || 0) + 1 } : o
    );

    const newVotedByEntry: VotedByEntry = { voterId, userName };
    const updatedVotedBy = [...(poll.votedBy || []), newVotedByEntry];
    const totalVotes = (poll.totalVotes || 0) + 1;
    const now = Date.now();

    const updatedPoll = {
      ...poll,
      options: updatedOptions,
      totalVotes,
      votedBy: updatedVotedBy,
    };

    // Update DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "SocialAndContent",
          Key: {
            contentId: (postData.contentId as string) || `POST#${id}`,
            sk: (postData.sk as string) || `POST#${postData.createdAt || now}`,
          },
          UpdateExpression: "SET poll = :p, updatedAt = :u",
          ExpressionAttributeValues: {
            ":p": updatedPoll,
            ":u": now,
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB update poll notice:", err);
    }

    // Sync to Firebase
    try {
      await db.collection("socialPosts").doc(id).update({
        "poll.options": updatedOptions,
        "poll.totalVotes": FieldValue.increment(1),
        "poll.votedBy": FieldValue.arrayUnion(newVotedByEntry),
        updatedAt: now,
      });
    } catch (fbErr) {
      console.warn("Firebase poll update sync notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      data: { id, ...postData, poll: updatedPoll, updatedAt: now },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/createpost/polls/[id] error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}