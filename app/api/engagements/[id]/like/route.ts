// app/api/engagements/[id]/like/route.ts — Dynamic Like / Unlike toggle for Fan Battles, Quizzes, Polls, Predictions
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getUser } from "@/lib/getUser";
import { dispatchFlipArenaNotification } from "@/lib/notifications";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id]/like — Check if user liked this engagement ────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const { searchParams } = new URL(req.url);
    const authUser = await getUser(req);
    const userId = authUser?.userId || authUser?.email || searchParams.get("userId");

     const matchIdParam = searchParams.get("matchId") || undefined;
    let likes: number | undefined;
    try {
      const found = await findEngagementById(cleanId, matchIdParam);
      if (found?.item) likes = Math.max(0, Number(found.item.likes ?? found.item.likeCount ?? 0));
    } catch {}
    
    if (!userId) {
      return NextResponse.json({ liked: false });
    }

    let liked = false;

    // 1. Check standardized DynamoDB key: contentId = ENGAGEMENT#{cleanId}, sk = LIKE#{userId}
    try {
      const getLike = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: `LIKE#${userId}` },
        })
      );
      if (getLike.Item) liked = true;
    } catch (dynErr) {
      console.warn("DynamoDB like check notice:", dynErr);
    }

    // 2. Check legacy DynamoDB key: contentId = LIKE#{userId}, sk = ENGAGEMENT#{cleanId}
    if (!liked) {
      try {
        const legacyLike = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${cleanId}` },
          })
        );
        if (legacyLike.Item) liked = true;
      } catch {}
    }

    // 3. Fallback to Firestore engagement_likes collection
    if (!liked && db) {
      try {
        const snap = await db.collection("engagement_likes").doc(`${userId}_${cleanId}`).get();
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
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      body?.userId ||
      req.headers.get("x-user-id") ||
      `anon_${req.headers.get("x-forwarded-for") || "client"}`;

    const now = Date.now();
    const likeDocId = `${userId}_${cleanId}`;

    // 1. Check if user already liked this item
    let alreadyLiked = false;
    try {
      const getLike = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: `LIKE#${userId}` },
        })
      );
      if (getLike.Item) alreadyLiked = true;
    } catch {}

    if (!alreadyLiked) {
      try {
        const legacyLike = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${cleanId}` },
          })
        );
        if (legacyLike.Item) alreadyLiked = true;
      } catch {}
    }

    if (!alreadyLiked && db) {
      try {
        const snap = await db.collection("engagement_likes").doc(likeDocId).get();
        if (snap.exists) alreadyLiked = true;
      } catch {}
    }

    const nextLikedState = !alreadyLiked;
    const delta = nextLikedState ? 1 : -1;

    // 2. Find engagement item across SocialAndContent and MatchMoments
    const matchId = body?.matchId || req.nextUrl.searchParams.get("matchId") || undefined;
    const found = await findEngagementById(cleanId, matchId);

    if (!found?.item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const item = found.item;
    const currentLikes = Math.max(0, Number(item.likes ?? item.likeCount ?? 0));
    const newLikesCount = Math.max(0, currentLikes + delta);

    item.likes = newLikesCount;
    item.likeCount = newLikesCount;
    if (nextLikedState) {
      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
    } else {
      item.totalEngaged = Math.max(0, (Number(item.totalEngaged) || 0) - 1);
    }
    item.updatedAt = now;

    // Dual-persist update to SocialAndContent AND MatchMoments
    await persistEngagementUpdate(cleanId, item, found.matchMomentsRecord);

    // 3. Save or remove the user's like record
    if (nextLikedState) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.SocialAndContent,
            Item: {
              contentId: `ENGAGEMENT#${cleanId}`,
              sk: `LIKE#${userId}`,
              entityId: "LIKE#ENGAGEMENT",
              userId,
              engagementId: cleanId,
              likedAt: now,
              createdAt: now,
            },
          })
        );
      } catch (dynPutErr) {
        console.warn("DynamoDB standard like put notice:", dynPutErr);
      }

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.SocialAndContent,
            Item: {
              contentId: `LIKE#${userId}`,
              sk: `ENGAGEMENT#${cleanId}`,
              userId,
              engagementId: cleanId,
              createdAt: now,
            },
          })
        );
      } catch {}

      if (db) {
        try {
          await db.collection("engagement_likes").doc(likeDocId).set({
            userId,
            engagementId: cleanId,
            createdAt: now,
          });
        } catch {}
      }

      // 4. Dispatch FlipArena Notification to Creator (Async)
      const recipientId =
        item.creatorId ||
        item.creatorEmail ||
        item.userId ||
        item.authorId ||
        item.createdBy;

      if (recipientId && String(recipientId) !== String(userId)) {
        const actorName =
          authUser?.name ||
          body?.userName ||
          body?.actorName ||
          (userId.includes("@") ? userId.split("@")[0] : "A sports fan");
        const actorAvatar =
          authUser?.photoURL ||
          body?.userAvatar ||
          body?.actorAvatar ||
          `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

        dispatchFlipArenaNotification({
          type: "fliparena.post_liked",
          actorId: userId,
          actorName,
          actorAvatar,
          recipientId: String(recipientId),
          engagementId: cleanId,
          engagementType: item.type || "quiz",
          engagementTitle: item.title || item.memeData?.title || item.subtitle || "Engagement",
        }).catch((notifErr) => {
          console.warn("[POST /api/engagements/[id]/like] Notification dispatch notice:", notifErr);
        });
      }
    } else {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: `LIKE#${userId}` },
          })
        );
      } catch (dynDelErr) {
        console.warn("DynamoDB standard like delete notice:", dynDelErr);
      }

      try {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `LIKE#${userId}`, sk: `ENGAGEMENT#${cleanId}` },
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
      totalEngaged: Number(item.totalEngaged) || 0,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/like error:", error);
    const msg = error instanceof Error ? error.message : "Failed to toggle like";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
