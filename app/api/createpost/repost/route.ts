// app/api/createpost/repost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";


/**
 * POST /api/createpost/repost
 *
 * Body:
 *   {
 *     postId: string;           // ID of the post being reposted
 *     userId: string;           // who is reposting
 *     userName: string;
 *     userEmail?: string;
 *     quoteText?: string;       // if present → quote-repost, else plain repost
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, userId, userName, userEmail = "", quoteText } = body as {
      postId: string;
      userId: string;
      userName: string;
      userEmail?: string;
      quoteText?: string;
    };

    if (!postId || !userId || !userName) {
      return NextResponse.json(
        { success: false, error: "postId, userId, and userName are required" },
        { status: 400 }
      );
    }

    // ── Fetch original post ───────────────────────────────────────────────────
    const originalRef = db.collection("socialPosts").doc(postId);
    const originalSnap = await originalRef.get();
    if (!originalSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Original post not found" },
        { status: 404 }
      );
    }
    const originalData = originalSnap.data()!;

    // ── Prevent duplicate plain reposts ──────────────────────────────────────
    const alreadyReposted = (originalData.repostedBy as string[] | undefined)?.includes(userId);
    if (!quoteText && alreadyReposted) {
      return NextResponse.json(
        { success: false, error: "You have already reposted this post" },
        { status: 409 }
      );
    }

    const now = Date.now();

    if (quoteText) {
      // ── Quote-repost: create a NEW post that embeds the original ─────────
      const newPost = {
        userName,
        userHandle: originalData.userHandle ?? userName.toLowerCase().replace(/\s+/g, ""),
        userAvatar: "",
        userEmail,
        content: quoteText,
        media: [],
        poll: null,
        likes: 0,
        likedBy: [],
        reactions: {},
        repostCount: 0,
        repostedBy: [],
        isQuoteRepost: true,
        isRepost: false,
        originalPostId: postId,
        quotedPost: {
          id: postId,
          userName: originalData.userName,
          userHandle: originalData.userHandle,
          content: originalData.content || "",
          media: originalData.media || [],
          createdAt: originalData.createdAt,
        },
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection("socialPosts").add(newPost);

      // Increment original post's repostCount (quote also counts)
      await originalRef.update({
        repostCount: FieldValue.increment(1),
      });

      return NextResponse.json(
        { success: true, data: { id: docRef.id, ...newPost }, type: "quote" },
        { status: 201 }
      );
    } else {
      // ── Plain repost: create a minimal repost document ───────────────────
      const newPost = {
        userName,
        userHandle: originalData.userHandle ?? userName.toLowerCase().replace(/\s+/g, ""),
        userAvatar: "",
        userEmail,
        content: originalData.content || "",
        media: originalData.media || [],
        poll: null,
        likes: 0,
        likedBy: [],
        reactions: {},
        repostCount: 0,
        repostedBy: [],
        isRepost: true,
        isQuoteRepost: false,
        originalPostId: postId,
        quotedPost: null,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection("socialPosts").add(newPost);

      // Mark original as reposted by this user + increment count
      await originalRef.update({
        repostCount: FieldValue.increment(1),
        repostedBy: FieldValue.arrayUnion(userId),
      });

      return NextResponse.json(
        { success: true, data: { id: docRef.id, ...newPost }, type: "repost" },
        { status: 201 }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/repost error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}