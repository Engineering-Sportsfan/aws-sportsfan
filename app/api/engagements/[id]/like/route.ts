// app/api/engagements/[id]/like/route.ts — Dynamic Like / Unlike toggle for Fan Battles, Quizzes, Polls, Predictions
// Aligned with api/roar/rooms/messages and api/roar/posts/[postId]/like architecture
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, UpdateCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id]/like — Check if user liked this engagement ────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const authUser = await getUser(req);
    const userId = authUser?.userId || authUser?.email || searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ liked: false });
    }

    let liked = false;

    // 1. Check standardized DynamoDB key: contentId = ENGAGEMENT#{id}, sk = LIKE#{userId} (Matches api/roar pattern)
    try {
      const getLike = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: `LIKE#${userId}` },
        })
      );
      if (getLike.Item) liked = true;
    } catch (dynErr) {
      console.warn("DynamoDB like check notice:", dynErr);
    }

    // 2. Check legacy DynamoDB key: contentId = LIKE#{userId}, sk = ENGAGEMENT#{id} (Backwards compatibility)
    if (!liked) {
      try {
        const legacyLike = await docClient.send(
          new GetCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${id}` },
          })
        );
        if (legacyLike.Item) liked = true;
      } catch {}
    }

    // 3. Fallback to Firestore engagement_likes collection
    if (!liked && db) {
      try {
        const snap = await db.collection("engagement_likes").doc(`${userId}_${id}`).get();
        if (snap.exists) liked = true;
      } catch {}
    }

    return NextResponse.json({ liked });
  } catch (error: unknown) {
    console.error("GET /api/engagements/[id]/like error:", error);
    return NextResponse.json({ liked: false });
  }
}

// ─── POST /api/engagements/[id]/like — Toggle Dynamic Like ───────────────────
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      body?.userId ||
      req.headers.get("x-user-id") ||
      `anon_${req.headers.get("x-forwarded-for") || "client"}`;

    const now = Date.now();
    const likeDocId = `${userId}_${id}`;

    // 1. Check if user already liked this item (Standardized DynamoDB query)
    let alreadyLiked = false;
    try {
      const getLike = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: `LIKE#${userId}` },
        })
      );
      if (getLike.Item) alreadyLiked = true;
    } catch {}

    // Check legacy DynamoDB key shape
    if (!alreadyLiked) {
      try {
        const legacyLike = await docClient.send(
          new GetCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${id}` },
          })
        );
        if (legacyLike.Item) alreadyLiked = true;
      } catch {}
    }

    // Check Firestore fallback
    if (!alreadyLiked && db) {
      try {
        const snap = await db.collection("engagement_likes").doc(likeDocId).get();
        if (snap.exists) alreadyLiked = true;
      } catch {}
    }

    const nextLikedState = !alreadyLiked;
    const delta = nextLikedState ? 1 : -1;

    // 2. Fetch and update engagement item likes
    let item: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) item = getRes.Item;
    } catch {}

    if (!item && db) {
      const snap = await db.collection("engagements").doc(id).get();
      if (snap.exists) item = { id: snap.id, ...snap.data() };
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const currentLikes = Math.max(0, Number(item.likes ?? item.likeCount ?? 0));
    const newLikesCount = Math.max(0, currentLikes + delta);

    // Update item likes & likeCount attributes
    item.likes = newLikesCount;
    item.likeCount = newLikesCount;
    item.updatedAt = now;

    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${String(item.type || "").toUpperCase()}`,
      ...item,
    };

    await dualWrite("engagements", id, "SocialAndContent", dynamoItem);

    // 3. Save or remove the user's like record (Standardized like pattern)
    if (nextLikedState) {
      // Standardized write: contentId = ENGAGEMENT#{id}, sk = LIKE#{userId} (Matches api/roar pattern)
      try {
        await docClient.send(
          new PutCommand({
            TableName: "SocialAndContent",
            Item: {
              contentId: `ENGAGEMENT#${id}`,
              sk: `LIKE#${userId}`,
              entityId: "LIKE#ENGAGEMENT",
              userId,
              engagementId: id,
              likedAt: now,
              createdAt: now,
            },
          })
        );
      } catch (dynPutErr) {
        console.warn("DynamoDB standard like put notice:", dynPutErr);
      }

      // Legacy key write for backwards compatibility
      try {
        await docClient.send(
          new PutCommand({
            TableName: "SocialAndContent",
            Item: {
              contentId: `LIKE#${userId}`,
              sk: `ENGAGEMENT#${id}`,
              userId,
              engagementId: id,
              createdAt: now,
            },
          })
        );
      } catch {}

      if (db) {
        try {
          await db.collection("engagement_likes").doc(likeDocId).set({
            userId,
            engagementId: id,
            createdAt: now,
          });
        } catch {}
      }
    } else {
      // Standardized delete: contentId = ENGAGEMENT#{id}, sk = LIKE#{userId}
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `LIKE#${userId}` },
          })
        );
      } catch (dynDelErr) {
        console.warn("DynamoDB standard like delete notice:", dynDelErr);
      }

      // Legacy key delete
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${id}` },
          })
        );
      } catch {}

      if (db) {
        try {
          await db.collection("engagement_likes").doc(likeDocId).delete();
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      liked: nextLikedState,
      likesCount: newLikesCount,
      likes: newLikesCount,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/like error:", error);
    const msg = error instanceof Error ? error.message : "Failed to toggle like";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
