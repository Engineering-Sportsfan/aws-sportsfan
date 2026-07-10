//api/createpost/polls/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    return pathParts[pathParts.length - 1] || null;
}

// Shape of a votedBy entry (new format)
interface VotedByEntry {
    voterId: string;
    userName: string;
}

// Handles both old string format ("user_abc") and new object format ({ voterId, userName })
function hasAlreadyVoted(
    votedBy: (string | VotedByEntry)[],
    voterId: string
): boolean {
    return votedBy.some((v) =>
        typeof v === "string" ? v === voterId : v.voterId === voterId
    );
}

// POST  /api/createpost/polls/[id]/vote
// Body: { optionId: string; voterId: string; userName: string }
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

        const postRef = db.collection("socialPosts").doc(id);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return NextResponse.json(
                { success: false, error: "Post not found" },
                { status: 404 }
            );
        }

        const data = postDoc.data();
        const poll = data?.poll;

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

        // Backward-compatible duplicate vote check
        if (
            Array.isArray(poll.votedBy) &&
            hasAlreadyVoted(poll.votedBy, voterId)
        ) {
            return NextResponse.json(
                { success: false, error: "You have already voted on this poll" },
                { status: 400 }
            );
        }

        const optionIndex: number = poll.options.findIndex(
            (o: { id: string }) => o.id === optionId
        );

        if (optionIndex === -1) {
            return NextResponse.json(
                { success: false, error: "Invalid option ID" },
                { status: 400 }
            );
        }

        // Increment the chosen option's vote count atomically
        const updatedOptions = poll.options.map(
            (
                o: { id: string; text: string; votes: number },
                idx: number
            ) => (idx === optionIndex ? { ...o, votes: o.votes + 1 } : o)
        );

        // Store structured { voterId, userName } so the database shows real names
        const newVotedByEntry: VotedByEntry = { voterId, userName };

        await postRef.update({
            "poll.options": updatedOptions,
            "poll.totalVotes": FieldValue.increment(1),
            "poll.votedBy": FieldValue.arrayUnion(newVotedByEntry),
            updatedAt: Date.now(),
        });

        const updated = await postRef.get();
        return NextResponse.json({
            success: true,
            data: { id: updated.id, ...updated.data() },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("POST /api/polls/[id]/vote error:", error);
        return NextResponse.json(
            { success: false, error: msg },
            { status: 500 }
        );
    }
}