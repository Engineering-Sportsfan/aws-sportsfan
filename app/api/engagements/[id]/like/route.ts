// app/api/engagements/[id]/like/route.ts — Dynamic Like / Unlike toggle for Fan Battles, Quizzes, Polls, Predictions
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getUser } from "@/lib/getUser";
import { dispatchFlipArenaNotification } from "@/lib/notifications";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, countRecords, getEngagementStats } from "@/lib/engagementSocial";
import { getCandidateTableNames } from "@/lib/dualWrite";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id]/like — Check if user liked + current like count ──
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const { searchParams } = new URL(req.url);
    const authUser = await getUser(req);
    const userId = authUser?.userId || authUser?.email || searchParams.get("userId");

    const matchIdParam = searchParams.get("matchId") || undefined;

    // Count real like records; fall back to the stored counter if the query fails
    let likes = 0;
    try {
      likes = await countRecords(cleanId, "LIKE#");
    } catch {
      const found = await findEngagementById(cleanId, matchIdParam).catch(() => null);
      likes = Math.max(0, Number(found?.item?.likes ?? found?.item?.likeCount ?? 0));
    }

    if (!userId) {
      return NextResponse.json({ liked: false, likes });
    }

    let liked = false;

    // 1. Standardized key: contentId = ENGAGEMENT#{cleanId}, sk = LIKE#{userId}
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

    // 2. Legacy key: contentId = LIKE#{userId}, sk = ENGAGEMENT#{cleanId}
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

    // 3. Firestore fallback
    if (!liked && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagement_likes")).doc(`${userId}_${cleanId}`).get();
        if (snap.exists) liked = true;
      } catch {}
    }

    return NextResponse.json({ liked, likes }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
    });
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
        const snap = await db.collection(getFirestoreCollection("engagement_likes")).doc(likeDocId).get();
        if (snap.exists) alreadyLiked = true;
      } catch {}
    }

    const nextLikedState = !alreadyLiked;
    const delta = nextLikedState ? 1 : -1;

    // 2. Find engagement item across SocialAndContent and MatchMoments (optional for recognitions/outcomes)
    const matchId = body?.matchId || req.nextUrl.searchParams.get("matchId") || undefined;
    const found = await findEngagementById(cleanId, matchId).catch(() => null);
    const item = found?.item || null;
    const resolvedMatchId = item?.matchId || matchId || undefined;
    const resolvedMomentId = body?.momentId || item?.momentId || undefined;
    const resolvedSeriesId = body?.seriesId || item?.seriesId || undefined;

    // 3. Save or remove the user's like record FIRST (these records are the source of truth)
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
              userName: body?.userName || authUser?.name || undefined,
              engagementId: cleanId,
              ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
              ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
              ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
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
          await db.collection(getFirestoreCollection("engagement_likes")).doc(likeDocId).set({
            userId,
            engagementId: cleanId,
            createdAt: now,
          });
        } catch {}
      }

      // 4. Dispatch FlipArena Notification to Creator (Async)
      const recipientId = item ? (
        item.creatorId ||
        item.creatorEmail ||
        item.userId ||
        item.authorId ||
        item.createdBy
      ) : null;

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
          await db.collection(getFirestoreCollection("engagement_likes")).doc(likeDocId).delete();
        } catch {}
      }
    }

    // 5. Count the real records, then mirror all separated action/social counts onto the engagement item
    const engStats = await getEngagementStats(cleanId, { consistent: true }).catch(() => null);
    const likesCount = engStats ? engStats.likes : await countRecords(cleanId, "LIKE#");
    let totalEngaged = likesCount;

    if (item) {
      if (engStats) {
        applyEngagementStats(item, engStats);
      } else {
        item.likes = likesCount;
        item.likeCount = likesCount;
      }
      item.totalEngaged = Math.max(0, (Number(item.totalEngaged) || 0) + delta);
      item.updatedAt = now;
      totalEngaged = Number(item.totalEngaged) || 0;
      try {
        await persistEngagementUpdate(cleanId, item, found?.matchMomentsRecord);
      } catch (e) {
        console.warn("like mirror notice:", e);
      }
    } else {
      // Dual-write count to visible_recognitions or match_room_notifications if present
      if (db) {
        try {
          await db.collection(getFirestoreCollection("visible_recognitions")).doc(cleanId).set({ likes: likesCount, likesCount }, { merge: true });
        } catch {}
        try {
          await db.collection(getFirestoreCollection("match_room_notifications")).doc(cleanId).set({ likes: likesCount, likesCount }, { merge: true });
        } catch {}
      }

      // Also mirror count to MatchMoments table (for recognitions and outcome reveals)
      if (matchId) {
        const cleanM = String(matchId).replace(/^MATCH#/, "");
        for (const tbl of getCandidateTableNames("MatchMoments")) {
          try {
            await docClient.send(new UpdateCommand({
              TableName: tbl,
              Key: { entityId: `MATCH#${cleanM}`, sk: `RECOGNITION#${cleanId}` },
              UpdateExpression: "SET likes = :l, likesCount = :l",
              ExpressionAttributeValues: { ":l": likesCount },
            }));
          } catch {}
          try {
            await docClient.send(new UpdateCommand({
              TableName: tbl,
              Key: { entityId: `MATCH#${cleanM}`, sk: `REVEAL#${cleanId}` },
              UpdateExpression: "SET likes = :l, likesCount = :l",
              ExpressionAttributeValues: { ":l": likesCount },
            }));
          } catch {}
        }
      }

      // Also mirror count to SocialAndContent META row
      try {
        await docClient.send(new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: "META" },
          UpdateExpression: "SET likes = :l, likesCount = :l",
          ExpressionAttributeValues: { ":l": likesCount },
        }));
      } catch {}
    }

    return NextResponse.json({
      success: true,
      liked: nextLikedState,
      likesCount,
      likes: likesCount,
      totalEngaged,
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/like error:", error);
    const msg = error instanceof Error ? error.message : "Failed to toggle like";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}