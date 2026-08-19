// api/roar/posts/[postId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { Post } from "@/app/models/Post";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let post: Post | null = null;
    let fetchedFromDynamo = false;

    // 1. Try reading from DynamoDB first
    try {
      const res = await docClient.send(new GetCommand({
        TableName: "SocialAndContent",
        Key: {
          contentId: `POST#${postId}`,
          sk: "POST#META"
        }
      }));

      if (res.Item) {
        post = {
          ...(res.Item as any),
          postId: res.Item.postId || postId
        };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Post GET] DynamoDB fetch failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snap = await db.collection("roarPosts").doc(postId).get();
        if (snap.exists) {
          post = { ...(snap.data() as Post), postId: snap.id };
        }
      } catch (fsErr) {
        console.error("[Post GET] Firestore fallback failed:", fsErr);
      }
    }

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // ── Live-resolve author avatar/badge ────────────────────────────────────
    let authorAvatarUrl: string | null = null;
    let authorBadge: string | null = post.authorBadge || null;
    let fetchedAuthor = false;

    if (post.authorUid) {
      try {
        const userRes = await docClient.send(new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `USER#${post.authorUid}`,
            sk: "USER#META"
          }
        }));
        if (userRes.Item) {
          authorAvatarUrl = userRes.Item.avatarUrl ?? null;
          authorBadge = userRes.Item.badge ?? post.authorBadge;
          fetchedAuthor = true;
        }
      } catch (e) {}

      if (!fetchedAuthor) {
        try {
          const authorSnap = await db.collection("users").doc(post.authorUid).get();
          if (authorSnap.exists) {
            const authorData = authorSnap.data() as any;
            authorAvatarUrl = authorData?.avatarUrl ?? null;
            authorBadge = authorData?.badge ?? post.authorBadge;
          }
        } catch (e) {}
      }
    }

    return NextResponse.json({
      success: true,
      post: {
        ...post,
        postId,
        authorAvatarUrl,
        authorBadge,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let post: Post | null = null;
    let snap: FirebaseFirestore.DocumentSnapshot | null = null;

    // 1. Fetch post info to check author permissions
    try {
      const res = await docClient.send(new GetCommand({
        TableName: "SocialAndContent",
        Key: {
          contentId: `POST#${postId}`,
          sk: "POST#META"
        }
      }));
      if (res.Item) {
        post = res.Item as Post;
      }
    } catch (e) {}

    if (!post) {
      const fsSnap = await db.collection("roarPosts").doc(postId).get();
      if (fsSnap.exists) {
        post = fsSnap.data() as Post;
        snap = fsSnap;
      }
    }

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const RESTRICTED_USERS = [""];
    if (post.authorUid !== user.userId && user.role !== "admin") {
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(new DeleteCommand({
        TableName: "SocialAndContent",
        Key: {
          contentId: `POST#${postId}`,
          sk: "POST#META"
        }
      }));
    } catch (dynErr) {
      console.warn("[Post DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync delete in Firestore
    try {
      await db.collection("roarPosts").doc(postId).delete();
    } catch (fsErr) {
      console.warn("[Post DELETE] Firestore delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}