// api\engagements\[id]\comments\route.ts

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { QueryCommand, PutCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { EngagementComment } from "@/types/engagements";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";

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
        flatComments = res.Items.map((item) => ({
          id: item.commentId || String(item.sk).replace(/^COMMENT#/, ""),
          commentId: item.commentId || String(item.sk).replace(/^COMMENT#/, ""),
          engagementId: cleanId,
          parentId: item.parentId || null,
          authorUid: item.authorUid || "guest",
          authorUsername: item.authorUsername || "SportsFan",
          authorAvatarUrl: item.authorAvatarUrl || null,
          authorBadge: item.authorBadge || null,
          text: item.text || "",
          createdAt: Number(item.createdAt || Date.now()),
          likesCount: Number(item.likesCount || item.likes || 0),
          ...item,
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[EngagementComments GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore subcollection if DynamoDB empty
    if (!fetchedFromDynamo && db) {
      try {
        const snap = await db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanId)
          .collection("comments")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        if (!snap.empty) {
          flatComments = snap.docs.map((doc) => ({
            id: doc.id,
            commentId: doc.id,
            engagementId: cleanId,
            ...doc.data(),
          }));
        }
      } catch (fsErr) {
        console.warn("[EngagementComments GET] Firestore fallback notice:", fsErr);
      }
    }

    // Build threaded hierarchy: nest replies under parent comments
    const topLevelComments: EngagementComment[] = [];
    const replyMap = new Map<string, EngagementComment[]>();

    for (const c of flatComments) {
      if (c.parentId) {
        const existing = replyMap.get(c.parentId) || [];
        existing.push(c);
        replyMap.set(c.parentId, existing);
      }
    }

    for (const c of flatComments) {
      if (!c.parentId) {
        const replies = (replyMap.get(c.commentId) || []).sort(
          (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
        );
        topLevelComments.push({
          ...c,
          replies,
        });
      }
    }

    // Sort top level comments by createdAt desc
    topLevelComments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      success: true,
      comments: topLevelComments,
      totalCount: flatComments.length,
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
    const { text, parentId, authorUsername, authorUid, authorBadge, authorAvatarUrl, matchId } = body;

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

    const now = Date.now();
    const commentId = `comm_${now}_${Math.random().toString(36).slice(2, 7)}`;

    const newComment: EngagementComment = {
      id: commentId,
      commentId,
      engagementId: cleanId,
      parentId: parentId || null,
      authorUid: userId,
      authorUsername: authorUsername || userInfo.username,
      authorAvatarUrl: authorAvatarUrl || userInfo.avatarUrl,
      authorBadge: authorBadge || userInfo.badge,
      text: text.trim(),
      createdAt: now,
      likesCount: 0,
      replies: [],
    };

    // 1. Dual-write to DynamoDB SocialAndContent table
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${cleanId}`,
            sk: `COMMENT#${commentId}`,
            entityId: `COMMENT#${cleanId}`,
            ...newComment,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[EngagementComments POST] DynamoDB write notice:", dynErr);
    }

    // 2. Dual-write to Firestore
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

        await db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanId)
          .update({
            commentsCount: FieldValue.increment(1),
            totalEngaged: FieldValue.increment(1),
          });
      } catch (fsErr) {
        console.warn("[EngagementComments POST] Firestore write notice:", fsErr);
      }
    }

    // 3. Atomically increment commentsCount in DynamoDB SocialAndContent
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: "ENGAGEMENT#META" },
          UpdateExpression:
            "SET commentsCount = if_not_exists(commentsCount, :zero) + :inc, totalEngaged = if_not_exists(totalEngaged, :zero) + :inc",
          ExpressionAttributeValues: {
            ":inc": 1,
            ":zero": 0,
          },
        })
      );
    } catch (dynUpdateErr) {
      console.warn("[EngagementComments POST] DynamoDB counter update notice:", dynUpdateErr);
    }

    // 4. Update MatchMoments table if engagement is a match moment
    let currentCommentsCount = 1;
    let currentTotalEngaged = 1;
    try {
      const found = await findEngagementById(cleanId, matchId);
      if (found?.item) {
        currentCommentsCount = (Number(found.item.commentsCount) || 0) + 1;
        currentTotalEngaged = (Number(found.item.totalEngaged) || 0) + 1;
        found.item.commentsCount = currentCommentsCount;
        found.item.totalEngaged = currentTotalEngaged;
        await persistEngagementUpdate(cleanId, found.item, found.matchMomentsRecord);
      }
    } catch (syncErr) {
      console.warn("[EngagementComments POST] MatchMoments sync notice:", syncErr);
    }

    return NextResponse.json({
      success: true,
      comment: newComment,
      commentsCount: currentCommentsCount,
      totalEngaged: currentTotalEngaged,
    });
  } catch (error: any) {
    console.error("POST /api/engagements/[id]/comments error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to post comment" },
      { status: 500 }
    );
  }
}
