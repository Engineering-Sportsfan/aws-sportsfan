// //api/posts/[postId]/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import type { Post } from "@/app/models/Post";

// export async function GET(
//   req: NextRequest,
//   { params }: { params: Promise<{ postId: string }> },
// ) {
//   try {
//     const { postId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const snap = await db.collection("roarPosts").doc(postId).get();
//     if (!snap.exists) {
//       return NextResponse.json({ error: "Post not found" }, { status: 404 });
//     }

//     return NextResponse.json({
//       success: true,
//       post: { ...(snap.data() as Post), postId: snap.id },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// export async function DELETE(
//   req: NextRequest,
//   { params }: { params: Promise<{ postId: string }> },
// ) {
//   try {
//     const { postId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const snap = await db.collection("roarPosts").doc(postId).get();
//     if (!snap.exists) {
//       return NextResponse.json({ error: "Post not found" }, { status: 404 });
//     }

//     const RESTRICTED_USERS = [
//       // "venkyiimb@gmail.com",
//       // "sethi.anshul39@gmail.com"
//       ""
//     ];
//     const post = snap.data() as Post;
//     if (post.authorUid !== user.userId && user.role !== "admin") {
//       const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
//       if (!isAdmin) {
//         return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//       }
//     }

//     await snap.ref.delete();
//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }





//api/posts/[postId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { Post } from "@/app/models/Post";

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

    const snap = await db.collection("roarPosts").doc(postId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = snap.data() as Post;

    // ── Live-resolve author avatar/badge ────────────────────────────────────
    // Same fix as GET /api/roar/posts: the post doc never stores
    // authorAvatarUrl (POST handler doesn't write it), so it must be
    // resolved from the author's current user doc on every read, not
    // trusted off the post itself. Single-post lookup here, so no
    // batching needed — just one extra doc.get().
    const authorSnap = await db.collection("users").doc(post.authorUid).get();
    const authorData = authorSnap.exists ? (authorSnap.data() as any) : null;

    return NextResponse.json({
      success: true,
      post: {
        ...post,
        postId: snap.id,
        authorAvatarUrl: authorData?.avatarUrl ?? null,
        // Fall back to the stamped-at-creation badge only if the live user
        // doc lookup came back empty (e.g. deleted user doc).
        authorBadge: authorData?.badge ?? post.authorBadge,
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

    const snap = await db.collection("roarPosts").doc(postId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const RESTRICTED_USERS = [
      // "venkyiimb@gmail.com",
      // "sethi.anshul39@gmail.com"
      ""
    ];
    const post = snap.data() as Post;
    if (post.authorUid !== user.userId && user.role !== "admin") {
      const isAdmin = !RESTRICTED_USERS.includes(user.email.toLowerCase());
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await snap.ref.delete();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}