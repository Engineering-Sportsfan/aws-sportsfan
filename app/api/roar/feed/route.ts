import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { Post } from "@/app/models/Post";

// GET  /api/roar/feed?filter=For+You&limit=20&lastDocId=xxx
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "For You";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");

    // Fetch the recent active posts to filter in-memory.
    // This avoids needing complex Firestore composite indexes that would crash the query at runtime.
    const query = db
      .collection("roarPosts")
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(500);

    const snapshot = await query.get();
    let posts: Post[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as Post),
      postId: doc.id,
    }));

    // Apply filters in-memory
    if (filter === "Cricket") {
      posts = posts.filter((p) => p.sport === "cricket");
    } else if (filter === "Football") {
      posts = posts.filter((p) => p.sport === "football");
    } else if (filter === "Live") {
      posts = posts.filter((p) => p.isLive === true);
    } else if (filter === "Predictions") {
      posts = posts.filter((p) => p.type === "prediction");
    }

    // Paginate the filtered array in-memory
    let startIndex = 0;
    if (lastDocId) {
      const idx = posts.findIndex((p) => p.postId === lastDocId);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const paginatedPosts = posts.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < posts.length;
    const lastDoc = paginatedPosts[paginatedPosts.length - 1];

    let userSnap = await db.collection("users").doc(user.email).get();
    let resolvedUserId = user.email;
    if (!userSnap.exists) {
      userSnap = await db.collection("users").doc(user.userId).get();
      if (userSnap.exists) {
        resolvedUserId = user.userId;
      }
    }

    const postsWithVote = await Promise.all(
      paginatedPosts.map(async (p) => {
        const docRef = db.collection("roarPosts").doc(p.postId);
        const voteSnap = await docRef.collection("votes").doc(resolvedUserId).get();
        const userVote = voteSnap.exists ? (voteSnap.data() as any).vote : null;
        return {
          ...p,
          userVote,
        };
      })
    );

    return NextResponse.json({
      success: true,
      posts: postsWithVote,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && lastDoc ? { lastDocId: lastDoc.postId } : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/feed error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
