// api/roar/posts/[postId]/voters/route.ts
//
// Returns the list of voters for a debate post, grouped by side (agree / disagree).
// Only the post author is allowed to call this endpoint.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

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

    const postRef = db.collection("roarPosts").doc(postId);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const postData = postSnap.data() as {
      authorUid: string;
      type: string;
      sideA?: string;
      sideB?: string;
    };

    // Only the post author may see the voter list
    if (
      postData.authorUid !== user.userId &&
      postData.authorUid !== user.email
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (postData.type !== "debate") {
      return NextResponse.json(
        { error: "Voter list is only available for debate posts" },
        { status: 400 },
      );
    }

    // Fetch all votes for this post
    const votesSnap = await postRef.collection("roarVotes").get();

    const agree: { uid: string; username: string; avatarUrl?: string }[] = [];
    const disagree: { uid: string; username: string; avatarUrl?: string }[] = [];

    // Collect uids so we can batch-fetch usernames
    const voterUids = votesSnap.docs.map((d) => d.id);

    // Firestore `getAll` is efficient for up to ~500 docs
    const userRefs = voterUids.map((uid) => db.collection("users").doc(uid));
    const userSnaps =
      userRefs.length > 0 ? await db.getAll(...userRefs) : [];

    const usernameByUid = new Map<string, { username: string; avatarUrl?: string }>();
    userSnaps.forEach((snap) => {
      if (snap.exists) {
        const d = snap.data() as { username?: string; avatarUrl?: string };
        usernameByUid.set(snap.id, {
          username: d.username ?? snap.id,
          avatarUrl: d.avatarUrl,
        });
      }
    });

    votesSnap.docs.forEach((doc) => {
      const { vote } = doc.data() as { vote: "agree" | "disagree" };
      const uid = doc.id;
      const info = usernameByUid.get(uid) ?? { username: uid };
      const entry = { uid, username: info.username, avatarUrl: info.avatarUrl };
      if (vote === "agree") agree.push(entry);
      else disagree.push(entry);
    });

    return NextResponse.json({
      success: true,
      sideA: postData.sideA ?? "Side A",
      sideB: postData.sideB ?? "Side B",
      voters: { agree, disagree },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/posts/[postId]/voters error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}