// app/api/engagements/[id]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { QueryCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { EngagementComment } from "@/types/engagements";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, getEngagementStats } from "@/lib/engagementSocial";
import { withReactionKeys } from "@/lib/engagementReactions";

export const dynamic = "force-dynamic";

async function resolveUserInfo(userId: string, name: string, email: string): Promise<{
  username: string;
  avatarUrl: string | null;
  badge: string | null;
}> {
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLES.IdentityAndAccess,
        Key: { entityId: `USER#${userId}`, sk: "USER#META" },
      })
    );
    if (res.Item) {
      return {
        username: res.Item.username || name || email.split("@")[0],
        avatarUrl: res.Item.avatarUrl || null,
        badge: res.Item.badge || null,
      };
    }
  } catch (e) {
    console.warn("[EngagementComments] resolveUserInfo notice:", e);
  }
  return { username: name || (email ? email.split("@")[0] : "Fan"), avatarUrl: null, badge: null };
}

// ─── GET: Fetch comments & threaded replies for an engagement ────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    // Lightweight count for the card badge
    if (searchParams.get("countOnly") === "1") {
      let count = 0;
      try {
        const r = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":c": `ENGAGEMENT#${cleanId}`, ":p": "COMMENT#" },
            Select: "COUNT",
          })
        );
        count = r.Count || 0;
      } catch {}
      if (count === 0 && db) {
        try {
          const snap = await db
            .collection(getFirestoreCollection("engagements"))
            .doc(cleanId)
            .collection("comments")
            .count()
            .get();
          count = snap.data().count;
        } catch {}
      }
      return NextResponse.json({ success: true, commentsCount: count });
    }

    let flatComments: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB SocialAndContent table first
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: {
            ":c": `ENGAGEMENT#${cleanId}`,
            ":p": "COMMENT#",
          },
          Limit: limit,
        })
      );

      if (res.Items && res.Items.length > 0) {
        flatComments = res.Items.map((item) => {
          const cid = String(item.commentId || item.id || String(item.sk || "").replace(/^COMMENT#/, "")).trim();
          const pid = item.parentId ? String(item.parentId).replace(/^COMMENT#/, "").trim() : null;
          const rawLikedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
          const effectiveLikes = Math.max(Number(item.likesCount || item.likes || 0), rawLikedBy.length);
          return {
            ...item,
            id: cid,
            commentId: cid,
            engagementId: cleanId,
            parentId: pid,
            authorUid: item.authorUid || "guest",
            authorUsername: item.authorUsername || "SportsFan",
            authorAvatarUrl: item.authorAvatarUrl || null,
            authorBadge: item.authorBadge || null,
            text: item.text || "",
            createdAt: Number(item.createdAt || Date.now()),
            likes: effectiveLikes,
            likesCount: effectiveLikes,
            likedBy: rawLikedBy,
          };
        });
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[EngagementComments GET] DynamoDB notice:", dynErr);
    }

    // Also check Firestore to merge/fallback any latest comment likes
    if (db) {
      try {
        const snap = await db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanId)
          .collection("comments")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        if (!snap.empty) {
          const fsItems = snap.docs.map((doc) => {
            const data = doc.data();
            const cid = String(data.commentId || data.id || doc.id).trim();
            const pid = data.parentId ? String(data.parentId).replace(/^COMMENT#/, "").trim() : null;
            const rawLikedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
            const effectiveLikes = Math.max(Number(data.likesCount || data.likes || 0), rawLikedBy.length);
            return {
              ...data,
              id: cid,
              commentId: cid,
              engagementId: cleanId,
              parentId: pid,
              authorUid: data.authorUid || "guest",
              authorUsername: data.authorUsername || "SportsFan",
              authorAvatarUrl: data.authorAvatarUrl || null,
              authorBadge: data.authorBadge || null,
              text: data.text || "",
              createdAt: Number(data.createdAt || Date.now()),
              likes: effectiveLikes,
              likesCount: effectiveLikes,
              likedBy: rawLikedBy,
            };
          });

          if (!fetchedFromDynamo || flatComments.length === 0) {
            flatComments = fsItems;
          } else {
            const fsMap = new Map<string, any>(fsItems.map(x => [x.id, x]));
            flatComments = flatComments.map((dItem: any) => {
              const fsItem = fsMap.get(dItem.id);
              if (!fsItem) return dItem;
              const mergedLikedBy = Array.from(new Set([...(dItem.likedBy || []), ...(fsItem.likedBy || [])]));
              const mergedLikes = Math.max(dItem.likesCount || 0, fsItem.likesCount || 0, mergedLikedBy.length);
              return {
                ...dItem,
                ...fsItem,
                likedBy: mergedLikedBy,
                likes: mergedLikes,
                likesCount: mergedLikes,
              };
            });
            const existingIds = new Set(flatComments.map(c => c.id));
            for (const fsItem of fsItems) {
              if (!existingIds.has(fsItem.id)) {
                flatComments.push(fsItem);
              }
            }
          }
        }
      } catch (fsErr) {
        console.warn("[EngagementComments GET] Firestore fallback notice:", fsErr);
      }
    }

    // Build recursive threaded hierarchy: nest replies under parent comments at ANY depth
    const idMap = new Map<string, EngagementComment>();
    for (const c of flatComments) {
      const cid = String(c.commentId || c.id || "").replace(/^COMMENT#/, "").trim();
      idMap.set(cid, {
        ...c,
        id: cid,
        commentId: cid,
        replies: [],
      });
    }

    const topLevelComments: EngagementComment[] = [];
    for (const c of flatComments) {
      const cid = String(c.commentId || c.id || "").replace(/^COMMENT#/, "").trim();
      const node = idMap.get(cid)!;
      const pKey = c.parentId ? String(c.parentId).replace(/^COMMENT#/, "").trim() : null;
      const parent = pKey ? idMap.get(pKey) : null;
      if (parent && parent.id !== cid) {
        parent.replies = [...(parent.replies || []), node];
      } else {
        topLevelComments.push(node);
      }
    }

    const sortReplies = (n: EngagementComment) => {
      n.replies = (n.replies || []).sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      n.replies.forEach(sortReplies);
    };
    topLevelComments.forEach(sortReplies);
    topLevelComments.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

    return NextResponse.json({
      success: true,
      comments: topLevelComments,
      totalCount: flatComments.length,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error: any) {
    console.error("GET /api/engagements/[id]/comments error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load comments" },
      { status: 500 }
    );
  }
}

// ─── POST: Add a new comment or threaded reply ──────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const body = await req.json();
    const { text, parentId, authorUsername, authorUid, authorBadge, authorAvatarUrl, matchId, momentId: reqMomentId, seriesId: reqSeriesId } = body;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { success: false, error: "Comment text cannot be empty" },
        { status: 400 }
      );
    }

    // Resolve user if available from session or body
    const authUser = await getUser(req);
    const userId = authUser?.userId || authorUid || `user_anon_${Math.random().toString(36).slice(2, 7)}`;
    const userInfo = await resolveUserInfo(
      userId,
      authorUsername || authUser?.name || "",
      authUser?.email || ""
    );

    const found = await findEngagementById(cleanId, matchId).catch(() => null);
    const resolvedMatchId = String(found?.item?.matchId || matchId || "").trim() || undefined;
    const resolvedMomentId = String(found?.item?.momentId || reqMomentId || "").trim() || undefined;
    const resolvedSeriesId = String(found?.item?.seriesId || reqSeriesId || "").trim() || undefined;

    const now = Date.now();
    const commentId = `comm_${now}_${Math.random().toString(36).slice(2, 7)}`;

    // Server-resolved profile wins; the client-sent values are only a fallback
    const newComment: EngagementComment = {
      id: commentId,
      commentId,
      engagementId: cleanId,
      parentId: parentId || null,
      authorUid: userId,
      authorUsername: userInfo.username || authorUsername,
      authorAvatarUrl: userInfo.avatarUrl || authorAvatarUrl,
      authorBadge: userInfo.badge || authorBadge,
      text: text.trim(),
      createdAt: now,
      likesCount: 0,
      replies: [],
    };

    // 1. Save the comment record in DynamoDB SocialAndContent (the source of truth for the count)
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: withReactionKeys({
            contentId: `ENGAGEMENT#${cleanId}`,
            sk: `COMMENT#${commentId}`,
            entityId: `COMMENT#${cleanId}`,
            ...newComment,
            ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
            ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
            ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
          }, { userId, action: parentId ? "reply" : "comment", at: now, engagement: found?.item, matchIdHint: resolvedMatchId }),
        })
      );
    } catch (dynErr) {
      console.error("[EngagementComments POST] DynamoDB comment write failed:", dynErr);
      return NextResponse.json(
        { success: false, error: "Comment could not be saved. Please try again." },
        { status: 500 }
      );
    }

    // 1b. If this is a reply to another user's comment, store a dedicated Social Response record
    if (parentId) {
      try {
        const cleanParentId = String(parentId).replace(/^COMMENT#/, "").trim();
        let targetAuthorUid = "";
        if (cleanParentId) {
          const parentRes = await docClient.send(
            new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: `COMMENT#${cleanParentId}` },
            })
          );
          targetAuthorUid = String(parentRes.Item?.authorUid || parentRes.Item?.userId || "").trim();
        }
        if (!targetAuthorUid || userId !== targetAuthorUid) {
          await docClient.send(
            new PutCommand({
              TableName: TABLES.SocialAndContent,
              Item: {
                contentId: `ENGAGEMENT#${cleanId}`,
                sk: `SOCIAL_COMMENT#${commentId}`,
                entityId: "SOCIAL_RESPONSE#COMMENT",
                responseType: "comment",
                actorUserId: userId,
                actorUserName: newComment.authorUsername,
                userId,
                userName: newComment.authorUsername,
                commentId,
                targetCommentId: cleanParentId,
                ...(targetAuthorUid ? { targetAuthorUid } : {}),
                engagementId: cleanId,
                ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
                ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
                ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
                createdAt: now,
              },
            })
          );
        }
      } catch (srErr) {
        console.warn("[EngagementComments POST] Social response write notice:", srErr);
      }
    }

    // 2. Recount COMMENT# records (comments + replies, same as GET ?countOnly=1 and the frontend thread).
    // The count is SET everywhere below, never incremented, so it can't drift or double.
    // totalEngaged is the unique-fan count (owned by the vote route), so comments don't touch it.
    let total = 0;
    try {
      let lastKey: Record<string, any> | undefined;
      do {
        const r = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":c": `ENGAGEMENT#${cleanId}`, ":p": "COMMENT#" },
            Select: "COUNT",
            ExclusiveStartKey: lastKey,
          })
        );
        total += r.Count || 0;
        lastKey = r.LastEvaluatedKey;
      } while (lastKey);
    } catch (countErr) {
      console.warn("[EngagementComments POST] Comment recount notice:", countErr);
    }

    // 3. Firestore: comment document + engagement count
    if (db) {
      try {
        await db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanId)
          .collection("comments")
          .doc(commentId)
          .set({
            ...newComment,
            serverTimestamp: FieldValue.serverTimestamp(),
          });

        if (total > 0) {
          await db
            .collection(getFirestoreCollection("engagements"))
            .doc(cleanId)
            .set({ commentsCount: total }, { merge: true });
        }
      } catch (fsErr) {
        console.warn("[EngagementComments POST] Firestore write notice:", fsErr);
      }
    }

    // 4. Mirror the count on the engagement. persistEngagementUpdate writes the SocialAndContent META row
    // for every engagement (plus MatchMoments + Firestore for match moments), so no separate META update.
    if (total > 0) {
      try {
        const engStats = await getEngagementStats(cleanId, { consistent: true });
        if (found?.item) {
          applyEngagementStats(found.item, engStats);
          found.item.commentsCount = Math.max(total, engStats.commentsCount);
          await persistEngagementUpdate(cleanId, found.item, found.matchMomentsRecord);
        } else {
          // Dual-write count to visible_recognitions and match_room_notifications collections
          if (db) {
            try {
              await db.collection(getFirestoreCollection("visible_recognitions")).doc(cleanId).set({ commentsCount: total }, { merge: true });
            } catch {}
            try {
              await db.collection(getFirestoreCollection("match_room_notifications")).doc(cleanId).set({ commentsCount: total }, { merge: true });
            } catch {}
          }
        }
      } catch (syncErr) {
        console.warn("[EngagementComments POST] Engagement count sync notice:", syncErr);
      }
    }

    return NextResponse.json({
      success: true,
      comment: newComment,
      commentsCount: total || 1,
    });
  } catch (error: any) {
    console.error("POST /api/engagements/[id]/comments error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to post comment" },
      { status: 500 }
    );
  }
}