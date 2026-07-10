import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

interface Comment {
    id: string;
    contentId: string;
    contentType: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
    commentText: string;
    parentCommentId?: string;
    likes?: number;
    likedBy?: string[];
    timestamp?: number;
    createdAt: number;
    updatedAt: number;
    isFlagged?: boolean;
    flaggedAt?: number | null;
    metadata?: {
        contentTitle?: string;
        contentUrl?: string;
    };
}

// ─── GET: Fetch all comments for admin ───────────────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const includeContentTypes = searchParams.get("includeContentTypes") === "true";
        const limit = parseInt(searchParams.get("limit") || "50");
        const lastDocId = searchParams.get("lastDocId");
        const searchQuery = searchParams.get("search")?.toLowerCase() || "";
        const contentType = searchParams.get("contentType")?.trim().toLowerCase() || "";

        if (includeContentTypes) {
            const contentTypesSnapshot = await db.collection("comments")
                .select("contentType")
                .get();

            const contentTypes = Array.from(
                new Set(
                    contentTypesSnapshot.docs
                        .map((doc) => String(doc.data().contentType || "").trim())
                        .filter(Boolean)
                )
            ).sort();

            return NextResponse.json({
                success: true,
                contentTypes,
            });
        }

        const shouldScanAllComments = Boolean(searchQuery || contentType);

        if (shouldScanAllComments) {
            const snapshot = await db.collection("comments")
                .orderBy("createdAt", "desc")
                .get();

            let comments = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Comment[];

            if (contentType) {
                comments = comments.filter((comment) =>
                    String(comment.contentType || "").trim().toLowerCase().includes(contentType)
                );
            }

            if (searchQuery) {
                comments = comments.filter((comment) =>
                    comment.commentText.toLowerCase().includes(searchQuery) ||
                    comment.userName.toLowerCase().includes(searchQuery) ||
                    comment.userEmail?.toLowerCase().includes(searchQuery)
                );
            }

            const pagedComments = comments.slice(0, limit);
            const lastDoc = pagedComments[pagedComments.length - 1];

            return NextResponse.json({
                success: true,
                comments: pagedComments,
                pagination: {
                    limit,
                    hasMore: comments.length > limit,
                    nextCursor: comments.length > limit
                        ? {
                            lastDocId: lastDoc?.id,
                        }
                        : null,
                },
            });
        }

        let query = db.collection("comments").orderBy("createdAt", "desc");

        query = query.limit(limit + 1); // +1 to check if there are more

        // Pagination
        if (lastDocId) {
            const lastDocRef = db.collection("comments").doc(lastDocId);
            const lastDoc = await lastDocRef.get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }

        const snapshot = await query.get();
        let comments = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Comment[];

        // Handle pagination - we fetched limit + 1, so if we have more than limit, there's a next page
        const hasMore = comments.length > limit;
        if (hasMore) {
            comments = comments.slice(0, limit);
        }

        // Filter by search query if provided (search in comment text and user name)
        if (searchQuery) {
            comments = comments.filter((comment) =>
                comment.commentText.toLowerCase().includes(searchQuery) ||
                comment.userName.toLowerCase().includes(searchQuery) ||
                comment.userEmail?.toLowerCase().includes(searchQuery)
            );
        }

        const lastDoc = comments[comments.length - 1];

        return NextResponse.json({
            success: true,
            comments,
            pagination: {
                limit,
                hasMore,
                nextCursor: hasMore
                    ? {
                        lastDocId: lastDoc?.id,
                    }
                    : null,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error fetching comments:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── DELETE: Admin delete comment ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const commentId = searchParams.get("commentId");

        if (!commentId) {
            return NextResponse.json(
                { error: "commentId is required" },
                { status: 400 }
            );
        }

        const commentRef = db.collection("comments").doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            return NextResponse.json(
                { error: "Comment not found" },
                { status: 404 }
            );
        }

        // Delete the comment
        await commentRef.delete();

        // Also delete all replies to this comment
        const repliesSnapshot = await db.collection("comments")
            .where("parentCommentId", "==", commentId)
            .get();

        for (const doc of repliesSnapshot.docs) {
            await doc.ref.delete();
        }

        return NextResponse.json({
            success: true,
            message: "Comment and its replies deleted successfully",
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error deleting comment:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── PATCH: Admin flag/unflag comment ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { commentId, isFlagged } = body;

        if (!commentId || typeof isFlagged !== "boolean") {
            return NextResponse.json(
                { error: "commentId and isFlagged are required" },
                { status: 400 }
            );
        }

        const commentRef = db.collection("comments").doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            return NextResponse.json(
                { error: "Comment not found" },
                { status: 404 }
            );
        }

        await commentRef.update({
            isFlagged,
            flaggedAt: isFlagged ? Date.now() : null,
            updatedAt: Date.now(),
        });

        const updatedDoc = await commentRef.get();

        return NextResponse.json({
            success: true,
            message: isFlagged ? "Comment flagged successfully" : "Comment unflagged successfully",
            comment: { id: updatedDoc.id, ...updatedDoc.data() },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error updating comment flag:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
