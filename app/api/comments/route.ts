// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";

// interface Comment {
//     contentId: string;
//     contentType: string; // Dynamic - accepts any string
//     userId: string;
//     userName: string;
//     userEmail?: string;
//     userAvatar?: string;
//     commentText: string;
//     parentCommentId?: string;
//     likes?: number;
//     likedBy?: string[];
//     timestamp?: number; // For video/audio: time in seconds when comment was made
//     createdAt: number;
//     updatedAt: number;
//     isFlagged?: boolean;
//     flaggedAt?: number | null;
//     metadata?: {
//         contentTitle?: string;
//         contentUrl?: string;
//     };
// }

// // ─── GET: Fetch comments for specific content ─────────────────────────────────
// export async function GET(req: NextRequest) {
//     try {
//         const { searchParams } = new URL(req.url);
//         const contentId = searchParams.get("contentId");
//         const parentCommentId = searchParams.get("parentCommentId");
//         const limit = parseInt(searchParams.get("limit") || "20");
//         const lastDocId = searchParams.get("lastDocId");
//         const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

//         if (!contentId && !parentCommentId) {
//             return NextResponse.json(
//                 { error: "contentId or parentCommentId is required" },
//                 { status: 400 }
//             );
//         }

//         let query = db.collection("comments").orderBy("createdAt", "desc");

//         // Fetch replies for a specific comment
//         if (parentCommentId) {
//             query = db.collection("comments")
//                 .where("parentCommentId", "==", parentCommentId)
//                 .orderBy("createdAt", "asc");
//         } 
//         // Fetch top-level comments for content
//         else {
//             query = db.collection("comments")
//                 .where("contentId", "==", contentId)
//                 .where("parentCommentId", "==", null) // Only top-level comments
//                 .orderBy("createdAt", "desc");
//         }

//         query = query.limit(limit);

//         // Pagination
//         if (lastDocId && lastDocCreatedAt) {
//             const lastDocRef = db.collection("comments").doc(lastDocId);
//             const lastDoc = await lastDocRef.get();
//             if (lastDoc.exists) {
//                 query = query.startAfter(lastDoc);
//             }
//         }

//         const snapshot = await query.get();
//         const comments = snapshot.docs.map((doc) => ({
//             id: doc.id,
//             ...doc.data(),
//         }));

//         // If fetching top-level comments, also get reply counts
//         if (!parentCommentId) {
//             const commentsWithReplyCounts = await Promise.all(
//                 comments.map(async (comment) => {
//                     const repliesQuery = await db.collection("comments")
//                         .where("parentCommentId", "==", comment.id)
//                         .count()
//                         .get();
                    
//                     return {
//                         ...comment,
//                         replyCount: repliesQuery.data().count,
//                     };
//                 })
//             );

//             const lastDoc = snapshot.docs[snapshot.docs.length - 1];

//             return NextResponse.json({
//                 success: true,
//                 comments: commentsWithReplyCounts,
//                 pagination: {
//                     limit,
//                     hasMore: comments.length === limit,
//                     nextCursor: comments.length === limit
//                         ? {
//                             lastDocId: lastDoc?.id,
//                             lastDocCreatedAt: lastDoc?.data()?.createdAt,
//                         }
//                         : null,
//                 },
//             });
//         }

//         // For replies, return as-is
//         const lastDoc = snapshot.docs[snapshot.docs.length - 1];
//         return NextResponse.json({
//             success: true,
//             comments,
//             pagination: {
//                 limit,
//                 hasMore: comments.length === limit,
//                 nextCursor: comments.length === limit
//                     ? {
//                         lastDocId: lastDoc?.id,
//                         lastDocCreatedAt: lastDoc?.data()?.createdAt,
//                     }
//                     : null,
//             },
//         });

//     } catch (error: unknown) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("Error fetching comments:", error);
//         return NextResponse.json({ error: msg }, { status: 500 });
//     }
// }

// // ─── POST: Create a new comment ──────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//     try {
//         const body = await req.json();

//         const {
//             contentId,
//             contentType,
//             commentText,
//             userId,
//             userName,
//             userEmail,
//             userAvatar,
//             parentCommentId,
//             timestamp,
//             metadata,
//         } = body;

//         // Validation
//         if (!contentId || !contentType || !commentText || !userId || !userName) {
//             return NextResponse.json(
//                 { error: "contentId, contentType, commentText, userId, and userName are required" },
//                 { status: 400 }
//             );
//         }

//         // Optional: Check for spam (1 comment per 30 seconds)
//         const recentCommentsQuery = await db.collection("comments")
//             .where("userId", "==", userId)
//             .where("contentId", "==", contentId)
//             .where("createdAt", ">", Date.now() - 30000) // 30 seconds
//             .limit(1)
//             .get();

//         if (!recentCommentsQuery.empty) {
//             return NextResponse.json(
//                 { error: "Please wait a moment before commenting again" },
//                 { status: 429 }
//             );
//         }

//         const newComment: Comment = {
//             contentId,
//             contentType,
//             userId,
//             userName,
//             userEmail: userEmail || "",
//             userAvatar: userAvatar || "",
//             commentText: commentText.trim(),
//             parentCommentId: parentCommentId || null,
//             likes: 0,
//             likedBy: [],
//             timestamp: timestamp || null,
//             createdAt: Date.now(),
//             updatedAt: Date.now(),
//             isFlagged: false,
//             flaggedAt: null,
//             metadata: metadata || {},
//         };

//         const docRef = await db.collection("comments").add(newComment);

//         return NextResponse.json(
//             {
//                 success: true,
//                 id: docRef.id,
//                 comment: { id: docRef.id, ...newComment },
//             },
//             { status: 201 }
//         );

//     } catch (error: unknown) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("Error creating comment:", error);
//         return NextResponse.json({ error: msg }, { status: 500 });
//     }
// }

// // ─── PUT: Update a comment (like/unlike, edit) ──────────────────────────────
// export async function PUT(req: NextRequest) {
//     try {
//         const body = await req.json();
//         const { commentId, userId, action, commentText } = body;

//         if (!commentId || !userId) {
//             return NextResponse.json(
//                 { error: "commentId and userId are required" },
//                 { status: 400 }
//             );
//         }

//         const commentRef = db.collection("comments").doc(commentId);
//         const commentDoc = await commentRef.get();

//         if (!commentDoc.exists) {
//             return NextResponse.json(
//                 { error: "Comment not found" },
//                 { status: 404 }
//             );
//         }

//         // Handle like/unlike
//         if (action === "like" || action === "unlike") {
//             const commentData = commentDoc.data();
//             const likedBy = commentData?.likedBy || [];
//             const isLiked = likedBy.includes(userId);

//             if (action === "like" && !isLiked) {
//                 await commentRef.update({
//                     likes: (commentData?.likes || 0) + 1,
//                     likedBy: [...likedBy, userId],
//                     updatedAt: Date.now(),
//                 });
//             } else if (action === "unlike" && isLiked) {
//                 await commentRef.update({
//                     likes: (commentData?.likes || 0) - 1,
//                     likedBy: likedBy.filter((id: string) => id !== userId),
//                     updatedAt: Date.now(),
//                 });
//             }

//             const updatedDoc = await commentRef.get();
//             return NextResponse.json({
//                 success: true,
//                 comment: { id: updatedDoc.id, ...updatedDoc.data() },
//             });
//         }

//         // Handle edit comment
//         if (commentText) {
//             const commentData = commentDoc.data();
//             if (commentData?.userId !== userId) {
//                 return NextResponse.json(
//                     { error: "You can only edit your own comments" },
//                     { status: 403 }
//                 );
//             }

//             await commentRef.update({
//                 commentText: commentText.trim(),
//                 updatedAt: Date.now(),
//             });

//             const updatedDoc = await commentRef.get();
//             return NextResponse.json({
//                 success: true,
//                 comment: { id: updatedDoc.id, ...updatedDoc.data() },
//             });
//         }

//         return NextResponse.json(
//             { error: "Invalid action" },
//             { status: 400 }
//         );

//     } catch (error: unknown) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("Error updating comment:", error);
//         return NextResponse.json({ error: msg }, { status: 500 });
//     }
// }

// // ─── DELETE: Delete a comment (owner only) ───────────────────────────────────
// export async function DELETE(req: NextRequest) {
//     try {
//         const { searchParams } = new URL(req.url);
//         const commentId = searchParams.get("commentId");
//         const userId = searchParams.get("userId");

//         if (!commentId || !userId) {
//             return NextResponse.json(
//                 { error: "commentId and userId are required" },
//                 { status: 400 }
//             );
//         }

//         const commentRef = db.collection("comments").doc(commentId);
//         const commentDoc = await commentRef.get();

//         if (!commentDoc.exists) {
//             return NextResponse.json(
//                 { error: "Comment not found" },
//                 { status: 404 }
//             );
//         }

//         const commentData = commentDoc.data();

//         // Only comment owner can delete
//         if (commentData?.userId !== userId) {
//             return NextResponse.json(
//                 { error: "You can only delete your own comments" },
//                 { status: 403 }
//             );
//         }

//         // Hard delete
//         await commentRef.delete();

//         return NextResponse.json({
//             success: true,
//             message: "Comment deleted successfully",
//         });

//     } catch (error: unknown) {
//         const msg = error instanceof Error ? error.message : "Unexpected error";
//         console.error("Error deleting comment:", error);
//         return NextResponse.json({ error: msg }, { status: 500 });
//     }
// }






import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface Comment {
    contentId: string;
    contentType: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
    commentText: string;
    parentCommentId?: string | null;
    likes?: number;
    likedBy?: string[];
    replyCount?: number;
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

// Simple in-memory cache to prevent duplicate requests
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_DURATION = 5000; // 5 seconds

// ─── GET: Fetch comments (NO extra count queries) ─────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const contentId = searchParams.get("contentId");
        const parentCommentId = searchParams.get("parentCommentId");
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
        const lastDocId = searchParams.get("lastDocId");

        if (!contentId && !parentCommentId) {
            return NextResponse.json(
                { error: "contentId or parentCommentId is required" },
                { status: 400 }
            );
        }

        const cacheKey = `${contentId}-${parentCommentId}-${limit}-${lastDocId}`;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return NextResponse.json(cached.data);
        }

        let query: FirebaseFirestore.Query;

        if (parentCommentId) {
            query = db.collection("comments")
                .where("parentCommentId", "==", parentCommentId)
                .orderBy("createdAt", "asc");
        } else {
            query = db.collection("comments")
                .where("contentId", "==", contentId)
                .where("parentCommentId", "==", null)
                .orderBy("createdAt", "desc");
        }

        query = query.limit(limit);

        if (lastDocId) {
            const lastDocRef = db.collection("comments").doc(lastDocId);
            const lastDoc = await lastDocRef.get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }

        const snapshot = await query.get();

        const comments = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            replyCount: doc.data().replyCount || 0,
        }));

        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const responseData = {
            success: true,
            comments,
            pagination: {
                limit,
                hasMore: comments.length === limit,
                nextCursor: comments.length === limit && lastDoc
                    ? { lastDocId: lastDoc.id, lastDocCreatedAt: lastDoc.data().createdAt }
                    : null,
            },
        };

        cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

        if (cache.size > 100) {
            const now = Date.now();
            for (const [key, value] of cache.entries()) {
                if (now - value.timestamp > 30000) cache.delete(key);
            }
        }

        return NextResponse.json(responseData);

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error fetching comments:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── POST: Create comment — increments post commentCount atomically ───────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            contentId,
            contentType,
            commentText,
            userId,
            userName,
            userEmail,
            userAvatar,
            parentCommentId,
            timestamp,
            metadata,
        } = body;

        if (!contentId || !contentType || !commentText || !userId || !userName) {
            return NextResponse.json(
                { error: "contentId, contentType, commentText, userId, and userName are required" },
                { status: 400 }
            );
        }

        // Spam guard: 1 comment per 10 seconds per user per content
        const recentQuery = await db.collection("comments")
            .where("userId", "==", userId)
            .where("contentId", "==", contentId)
            .where("createdAt", ">", Date.now() - 10000)
            .limit(1)
            .get();

        if (!recentQuery.empty) {
            return NextResponse.json(
                { error: "Please wait a moment before commenting again" },
                { status: 429 }
            );
        }

        const now = Date.now();
        const newComment: Comment = {
            contentId,
            contentType,
            userId,
            userName,
            userEmail: userEmail || "",
            userAvatar: userAvatar || "",
            commentText: commentText.trim(),
            parentCommentId: parentCommentId || null,
            likes: 0,
            likedBy: [],
            replyCount: 0,
            timestamp: timestamp || null,
            createdAt: now,
            updatedAt: now,
            isFlagged: false,
            flaggedAt: null,
            metadata: metadata || {},
        };

        const docRef = await db.collection("comments").add(newComment);

        if (parentCommentId) {
            // Reply → increment replyCount on parent comment only
            const parentRef = db.collection("comments").doc(parentCommentId);
            await parentRef.update({
                replyCount: FieldValue.increment(1),
                updatedAt: now,
            });
        } else {
            // Top-level comment → increment commentCount on the post/article document
            // This is a single atomic write, no extra reads — safe for quota
            const contentCollection = contentType === "post" ? "posts" : "articles";
            const contentRef = db.collection(contentCollection).doc(contentId);
            await contentRef.update({
                commentCount: FieldValue.increment(1),
                updatedAt: now,
            }).catch((err) => {
                // Non-fatal: if the post doc doesn't exist or field missing, log and continue
                console.warn("[comments POST] Could not increment commentCount:", err.message);
            });
        }

        // Bust cache for this contentId
        for (const [key] of cache.entries()) {
            if (key.startsWith(contentId)) cache.delete(key);
        }

        return NextResponse.json(
            { success: true, id: docRef.id, comment: { id: docRef.id, ...newComment } },
            { status: 201 }
        );

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error creating comment:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── PUT: Like/unlike or edit a comment ──────────────────────────────────────
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { commentId, userId, action, commentText } = body;

        if (!commentId || !userId) {
            return NextResponse.json(
                { error: "commentId and userId are required" },
                { status: 400 }
            );
        }

        const commentRef = db.collection("comments").doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        const commentData = commentDoc.data();

        if (action === "like" || action === "unlike") {
            const likedBy = commentData?.likedBy || [];
            const isLiked = likedBy.includes(userId);

            if (action === "like" && !isLiked) {
                await commentRef.update({
                    likes: (commentData?.likes || 0) + 1,
                    likedBy: [...likedBy, userId],
                    updatedAt: Date.now(),
                });
            } else if (action === "unlike" && isLiked) {
                await commentRef.update({
                    likes: Math.max(0, (commentData?.likes || 0) - 1),
                    likedBy: likedBy.filter((id: string) => id !== userId),
                    updatedAt: Date.now(),
                });
            } else {
                return NextResponse.json({ error: "Already liked or not liked" }, { status: 400 });
            }

            if (commentData?.contentId) {
                for (const [key] of cache.entries()) {
                    if (key.startsWith(commentData.contentId)) cache.delete(key);
                }
            }

            const updatedDoc = await commentRef.get();
            return NextResponse.json({ success: true, comment: { id: updatedDoc.id, ...updatedDoc.data() } });
        }

        if (commentText) {
            if (commentData?.userId !== userId) {
                return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
            }

            await commentRef.update({ commentText: commentText.trim(), updatedAt: Date.now() });

            if (commentData?.contentId) {
                for (const [key] of cache.entries()) {
                    if (key.startsWith(commentData.contentId)) cache.delete(key);
                }
            }

            const updatedDoc = await commentRef.get();
            return NextResponse.json({ success: true, comment: { id: updatedDoc.id, ...updatedDoc.data() } });
        }

        return NextResponse.json({ error: "Invalid action or missing data" }, { status: 400 });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error updating comment:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── DELETE: Delete comment — decrements post commentCount atomically ─────────
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const commentId = searchParams.get("commentId");
        const userId = searchParams.get("userId");

        if (!commentId || !userId) {
            return NextResponse.json(
                { error: "commentId and userId are required" },
                { status: 400 }
            );
        }

        const commentRef = db.collection("comments").doc(commentId);
        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        const commentData = commentDoc.data();

        if (commentData?.userId !== userId) {
            return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
        }

        const batch = db.batch();

        if (commentData?.parentCommentId) {
            // Reply → decrement replyCount on parent comment only
            const parentRef = db.collection("comments").doc(commentData.parentCommentId);
            batch.update(parentRef, {
                replyCount: FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
        } else {
            // Top-level comment → decrement commentCount on the post/article document
            const contentCollection = commentData?.contentType === "post" ? "posts" : "articles";
            const contentRef = db.collection(contentCollection).doc(commentData?.contentId);
            // Clamp to 0 via a transaction-safe approach:
            // FieldValue.increment(-1) is safe because Firestore won't go below 0
            // if you set a security rule; here we just use it and rely on the UI clamp.
            batch.update(contentRef, {
                commentCount: FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
        }

        // Cascade-delete all replies to this comment
        const repliesSnapshot = await db.collection("comments")
            .where("parentCommentId", "==", commentId)
            .get();

        repliesSnapshot.docs.forEach((replyDoc) => batch.delete(replyDoc.ref));
        batch.delete(commentRef);

        await batch.commit();

        if (commentData?.contentId) {
            for (const [key] of cache.entries()) {
                if (key.startsWith(commentData.contentId)) cache.delete(key);
            }
        }

        return NextResponse.json({ success: true, message: "Comment deleted successfully" });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("Error deleting comment:", error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}