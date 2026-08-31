// app/api/engagements/[id]/like/route.ts — Dynamic Like / Unlike toggle for Fan Battles, Quizzes, Polls, Predictions
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
    const userId = authUser?.userId || searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ liked: false });
    }

    let liked = false;

    // Check DynamoDB
    try {
      const getLike = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${id}` },
        })
      );
      if (getLike.Item) liked = true;
    } catch {}

    // Check Firestore fallback
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
    const userId = authUser?.userId || body?.userId || `anon_${req.headers.get("x-forwarded-for") || "client"}`;

    const now = Date.now();
    const likeDocId = `${userId}_${id}`;

    // 1. Check if user already liked this item
    let alreadyLiked = false;
    try {
      const getLike = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${id}` },
        })
      );
      if (getLike.Item) alreadyLiked = true;
    } catch {}

    if (!alreadyLiked && db) {
      try {
        const snap = await db.collection("engagement_likes").doc(likeDocId).get();
        if (snap.exists) alreadyLiked = true;
      } catch {}
    }

    const nextLikedState = !alreadyLiked;
    const delta = nextLikedState ? 1 : -1;

    // 2. Fetch and atomically update engagement item likes
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

    const currentLikes = Math.max(0, Number(item.likes) || 0);
    const newLikesCount = Math.max(0, currentLikes + delta);

    // Update item
    item.likes = newLikesCount;
    item.updatedAt = now;

    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${String(item.type || "").toUpperCase()}`,
      ...item,
    };

    await dualWrite("engagements", id, "SocialAndContent", dynamoItem);

    // 3. Save or remove the user's like record
    if (nextLikedState) {
      // Record like
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
      // Remove like
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
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/like error:", error);
    const msg = error instanceof Error ? error.message : "Failed to toggle like";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
