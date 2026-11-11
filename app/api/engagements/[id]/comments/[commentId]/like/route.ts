import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { UpdateCommand, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, getEngagementStats } from "@/lib/engagementSocial";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const cleanEngId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const cleanCommentId = String(commentId || "").replace(/^COMMENT#/, "").trim();
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      body?.userId ||
      req.headers.get("x-user-id") ||
      "guest_fan";

    let currentLikes = 0;
    let likedBy: string[] = [];
    let itemFoundInDynamo = false;
    let matchedContentId = `ENGAGEMENT#${cleanEngId}`;
    let targetAuthorUid = "";
    let commentMatchId = String(body?.matchId || "").trim();
    let commentMomentId = String(body?.momentId || "").trim();
    let commentSeriesId = String(body?.seriesId || "").trim();

    const contentCandidates = Array.from(new Set([
      `ENGAGEMENT#${cleanEngId}`,
      cleanEngId,
      `RECOGNITION#${cleanEngId}`,
      `MOMENT#${cleanEngId}`,
      String(id || "").trim(),
    ]));

    // 1. Fetch current comment item from DynamoDB SocialAndContent across candidates
    for (const cCand of contentCandidates) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: cCand,
              sk: `COMMENT#${cleanCommentId}`,
            },
          })
        );

        if (getRes.Item) {
          itemFoundInDynamo = true;
          matchedContentId = cCand;
          currentLikes = Number(getRes.Item.likesCount || getRes.Item.likes || 0);
          likedBy = Array.isArray(getRes.Item.likedBy) ? getRes.Item.likedBy : [];
          targetAuthorUid = String(getRes.Item.authorUid || getRes.Item.userId || "").trim();
          if (!commentMatchId && getRes.Item.matchId) commentMatchId = String(getRes.Item.matchId).trim();
          if (!commentMomentId && getRes.Item.momentId) commentMomentId = String(getRes.Item.momentId).trim();
          if (!commentSeriesId && getRes.Item.seriesId) commentSeriesId = String(getRes.Item.seriesId).trim();
          break;
        }
      } catch (dynErr) {
        console.warn("[CommentLike POST] DynamoDB get notice:", dynErr);
      }
    }

    // 1b. Check Firestore to merge full likedBy
    let fsCommentRef: any = null;
    if (db) {
      try {
        fsCommentRef = db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanEngId)
          .collection("comments")
          .doc(cleanCommentId);

        const snap = await fsCommentRef.get();
        if (snap.exists) {
          const data = snap.data() || {};
          const fsLikedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
          likedBy = Array.from(new Set([...likedBy, ...fsLikedBy]));
          currentLikes = Math.max(currentLikes, Number(data.likesCount || data.likes || 0), likedBy.length);
          if (!targetAuthorUid && (data.authorUid || data.userId)) {
            targetAuthorUid = String(data.authorUid || data.userId).trim();
          }
        }
      } catch (fsErr) {
        console.warn("[CommentLike POST] Firestore lookup notice:", fsErr);
      }
    }

    const cleanTargetUid = String(userId).replace(/^USER#/i, "").toLowerCase();
    const alreadyLiked = likedBy.some((u: string) => {
      const cu = String(u).replace(/^USER#/i, "").toLowerCase();
      return cu === cleanTargetUid || cu === "me";
    });
    const liked = !alreadyLiked;
    const nextLikedBy = liked
      ? Array.from(new Set([...likedBy, userId]))
      : likedBy.filter((u: string) => {
          const cu = String(u).replace(/^USER#/i, "").toLowerCase();
          return cu !== cleanTargetUid && cu !== "me";
        });
    const nextLikes = nextLikedBy.length;

    // Dual-write to DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: {
            contentId: matchedContentId,
            sk: `COMMENT#${cleanCommentId}`,
          },
          UpdateExpression: "SET likesCount = :lc, likes = :lc, likedBy = :lb",
          ExpressionAttributeValues: {
            ":lc": nextLikes,
            ":lb": nextLikedBy,
          },
        })
      );

      const cleanActor = String(userId).replace(/^USER#/i, "").trim().toLowerCase();
      const cleanAuthor = targetAuthorUid.replace(/^USER#/i, "").trim().toLowerCase();
      const isPeerReaction = !cleanAuthor || cleanActor !== cleanAuthor;
      const found = await findEngagementById(cleanEngId, commentMatchId || undefined).catch(() => null);
      const resolvedMatchId = commentMatchId || String(found?.item?.matchId || "").trim();
      const resolvedMomentId = commentMomentId || String(found?.item?.momentId || "").trim();
      const resolvedSeriesId = commentSeriesId || String(found?.item?.seriesId || "").trim();

      if (isPeerReaction && matchedContentId === `ENGAGEMENT#${cleanEngId}`) {
        const srSk = `SOCIAL_LIKE#${cleanCommentId}#${userId}`;
        if (liked) {
          const now = Date.now();
          await docClient.send(
            new PutCommand({
              TableName: TABLES.SocialAndContent,
              Item: {
                contentId: `ENGAGEMENT#${cleanEngId}`,
                sk: srSk,
                entityId: "SOCIAL_RESPONSE#LIKE",
                responseType: "like",
                actorUserId: userId,
                userId,
                targetCommentId: cleanCommentId,
                ...(targetAuthorUid ? { targetAuthorUid } : {}),
                engagementId: cleanEngId,
                ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
                ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
                ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
                createdAt: now,
              },
            })
          );
        } else {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${cleanEngId}`, sk: srSk },
            })
          );
        }
      }

      if (found?.item) {
        const engStats = await getEngagementStats(cleanEngId, { consistent: true });
        applyEngagementStats(found.item, engStats);
        found.item.updatedAt = Date.now();
        await persistEngagementUpdate(cleanEngId, found.item, found.matchMomentsRecord);
      }
    } catch (dynErr) {
      console.warn("[CommentLike POST] DynamoDB update notice:", dynErr);
    }

    // Dual-write to Firestore
    if (fsCommentRef) {
      try {
        await fsCommentRef.set({
          likesCount: nextLikes,
          likes: nextLikes,
          likedBy: nextLikedBy,
        }, { merge: true });
      } catch (fsErr) {
        console.warn("[CommentLike POST] Firestore update notice:", fsErr);
      }
    }

    return NextResponse.json({
      success: true,
      liked,
      likesCount: nextLikes,
      likes: nextLikes,
      likedBy: nextLikedBy,
    });
  } catch (error: any) {
    console.error("POST /api/engagements/[id]/comments/[commentId]/like error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to like comment" },
      { status: 500 }
    );
  }
}
