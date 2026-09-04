// app/api/comments/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { v4 as uuidv4 } from "uuid";
import {
  QueryCommand,
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

interface Comment {
  id?: string;
  contentId: string;
  contentType: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
  commentText: string;
  parentCommentId?: string | null;
  likes?: number;
  likedBy?: string[];
  replyCount?: number;
  timestamp?: number;
  createdAt: number;
  updatedAt: number;
  isFlagged?: boolean;
  flaggedAt?: number | null;
  metadata?: {
    contentTitle?: string;
    contentUrl?: string;
  };
}

// ─── GET: Fetch comments ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contentId = searchParams.get("contentId");
    const parentCommentId = searchParams.get("parentCommentId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    if (!contentId && !parentCommentId) {
      return NextResponse.json(
        { error: "contentId or parentCommentId is required" },
        { status: 400 }
      );
    }

    let comments: Array<Record<string, unknown>> = [];

    // 1. If fetching replies to a comment, use GSI parentCommentId-createdAt-index
    if (parentCommentId) {
      try {
        const replyRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            IndexName: "parentCommentId-createdAt-index",
            KeyConditionExpression: "parentCommentId = :p",
            ExpressionAttributeValues: { ":p": parentCommentId },
            Limit: limit,
          })
        );
        if (replyRes.Items && replyRes.Items.length > 0) {
          comments = replyRes.Items;
        }
      } catch (err) {
        console.warn("DynamoDB parentCommentId-createdAt-index query notice:", err);
      }
    } else {
      // 2. Fetch top-level comments for contentId
      const cleanContentId = (contentId || "").replace(/^(ARTICLE|NEWS|POST|ENGAGEMENT)#/, "").trim();
      
      // Try fast QueryCommand on primary partition key
      const candidateKeys = [`ARTICLE#${cleanContentId}`, cleanContentId, `POST#${cleanContentId}`, contentId].filter(Boolean);
      for (const candKey of candidateKeys) {
        try {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :c AND begins_with(sk, :skp)",
              ExpressionAttributeValues: {
                ":c": candKey,
                ":skp": "COMMENT#",
              },
              Limit: limit,
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            for (const item of qRes.Items) {
              if (!item.parentCommentId) comments.push(item);
            }
          }
        } catch {}
      }

      // If query found nothing, fallback to ScanCommand
      if (comments.length === 0) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: TABLES.SocialAndContent,
              FilterExpression:
                "(contentId = :c OR contentId = :cClean OR contentId = :cPrefix OR targetContentId = :c OR targetContentId = :cClean) AND (attribute_not_exists(parentCommentId) OR parentCommentId = :nullVal)",
              ExpressionAttributeValues: {
                ":c": contentId,
                ":cClean": cleanContentId,
                ":cPrefix": `ARTICLE#${cleanContentId}`,
                ":nullVal": null,
              },
              Limit: limit,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            comments = scanRes.Items;
          }
        } catch (err) {
          console.warn("DynamoDB top-level comments scan notice:", err);
        }
      }
    }

    // 3. Fallback to Firebase if DynamoDB returned no items
    if (comments.length === 0) {
      try {
        const commentsCol = getFirestoreCollection("comments");
        let query: FirebaseFirestore.Query;
        if (parentCommentId) {
          query = db
            .collection(commentsCol)
            .where("parentCommentId", "==", parentCommentId)
            .orderBy("createdAt", "asc")
            .limit(limit);
        } else {
          const cleanContentId = (contentId || "").replace(/^(ARTICLE|NEWS|POST|ENGAGEMENT)#/, "").trim();
          query = db
            .collection(commentsCol)
            .where("contentId", "in", [contentId, cleanContentId, `ARTICLE#${cleanContentId}`].filter(Boolean))
            .where("parentCommentId", "==", null)
            .orderBy("createdAt", "desc")
            .limit(limit);
        }
        const snapshot = await query.get();
        comments = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          replyCount: doc.data().replyCount || 0,
        }));
      } catch (fbErr) {
        console.warn("Firebase comments fallback notice:", fbErr);
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    const uniqueComments = comments.filter((c) => {
      const cid = String(c.id || c.commentId || (c.sk as string) || "");
      if (!cid || seen.has(cid)) return false;
      seen.add(cid);
      return true;
    });

    const formatted = uniqueComments.map((c) => ({
      id: c.id || (c.commentId as string) || (c.sk as string)?.replace(/^COMMENT#\d+#?/, "") || (c.contentId as string)?.replace(/^COMMENT#/, ""),
      commentId: c.commentId || c.id,
      ...c,
    }));

    return NextResponse.json({
      success: true,
      comments: formatted.slice(0, limit),
      data: formatted.slice(0, limit),
      total: formatted.length,
      pagination: {
        limit,
        hasMore: formatted.length > limit,
        nextCursor: null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST: Create comment ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const rawContentId = String(body.contentId || body.articleId || body.postId || body.id || "").trim();
    const cleanContentId = rawContentId.replace(/^(ARTICLE|NEWS|POST|ENGAGEMENT)#/, "").trim();
    
    const commentText = String(body.commentText || body.text || body.content || body.comment || body.message || "").trim();
    const userId = String(body.userId || body.authorUid || body.authorId || body.uid || body.user_id || `guest_${Date.now()}`).trim();
    const userName = String(body.userName || body.authorName || body.username || body.name || body.displayName || "Fan").trim();
    const contentType = String(body.contentType || body.type || "article").trim();
    const userEmail = String(body.userEmail || body.email || "").trim();
    const userAvatar = String(body.userAvatar || body.authorAvatar || body.avatar || body.photoURL || "").trim();
    const parentCommentId = body.parentCommentId || null;
    const metadata = body.metadata || {};

    if (!cleanContentId || !commentText) {
      return NextResponse.json(
        { error: "contentId and commentText (or text) are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const commentId = `cmt_${now}_${uuidv4().substring(0, 8)}`;

    const newComment: Comment = {
      id: commentId,
      contentId: cleanContentId,
      contentType,
      userId,
      userName,
      userEmail,
      userAvatar,
      commentText,
      parentCommentId,
      likes: 0,
      likedBy: [],
      replyCount: 0,
      timestamp: body.timestamp || now,
      createdAt: now,
      updatedAt: now,
      isFlagged: false,
      flaggedAt: null,
      metadata,
    };

    // 1. DynamoDB Item (Dual partition keys so both Query and Scan can find it)
    const dynamoItem = {
      ...newComment,
      contentId: `ARTICLE#${cleanContentId}`,
      targetContentId: cleanContentId,
      sk: `COMMENT#${now}#${commentId}`,
      commentId,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: dynamoItem,
        })
      );
    } catch (dynErr) {
      console.warn("DynamoDB comment insert notice:", dynErr);
    }

    // 2. Dual-Write to Firestore 'comments' collection
    try {
      await db.collection(getFirestoreCollection("comments")).doc(commentId).set({
        ...newComment,
        contentId: cleanContentId,
      });
    } catch (fbErr) {
      console.warn("Firestore comment insert notice:", fbErr);
    }

    // 3. Update replyCount or commentCount
    if (parentCommentId) {
      try {
        await db.collection(getFirestoreCollection("comments")).doc(parentCommentId).set({
          replyCount: FieldValue.increment(1),
          updatedAt: now,
        }, { merge: true });
      } catch (fbErr) {
        console.warn("Firebase increment replyCount sync notice:", fbErr);
      }
    } else {
      const contentCollection =
        contentType === "post"
          ? getFirestoreCollection("socialPosts")
          : getFirestoreCollection("cricketArticles");
      try {
        await db.collection(contentCollection).doc(cleanContentId).set({
          commentCount: FieldValue.increment(1),
          updatedAt: now,
        }, { merge: true });
      } catch (fbErr) {
        console.warn("Firebase increment article commentCount sync notice:", fbErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: commentId,
        commentId,
        comment: { id: commentId, commentId, ...newComment },
        data: { id: commentId, commentId, ...newComment },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT: Like/unlike or edit a comment ──────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { commentId, userId, action, commentText } = body;

    if (!commentId || !userId) {
      return NextResponse.json(
        { error: "commentId and userId are required" },
        { status: 400 }
      );
    }

    // 1. Fetch Comment
    let commentData: Record<string, unknown> | null = null;

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": `COMMENT#${commentId}` },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        commentData = qRes.Items[0];
      }
    } catch (err) {
      console.warn("DynamoDB comment query notice:", err);
    }

    if (!commentData) {
      try {
        const doc = await db.collection(getFirestoreCollection("comments")).doc(commentId).get();
        if (doc.exists) commentData = doc.data() as Record<string, unknown>;
      } catch (fbErr) {
        console.warn("Firebase comment fetch notice:", fbErr);
      }
    }

    if (!commentData) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const now = Date.now();

    if (action === "like" || action === "unlike") {
      const likedBy = Array.isArray(commentData.likedBy) ? [...(commentData.likedBy as string[])] : [];
      const isLiked = likedBy.includes(userId);
      let likes = typeof commentData.likes === "number" ? commentData.likes : 0;

      if (action === "like" && !isLiked) {
        likedBy.push(userId);
        likes += 1;
      } else if (action === "unlike" && isLiked) {
        const idx = likedBy.indexOf(userId);
        if (idx !== -1) likedBy.splice(idx, 1);
        likes = Math.max(0, likes - 1);
      } else {
        return NextResponse.json({ error: "Already liked or not liked" }, { status: 400 });
      }

      // Update DynamoDB
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: (commentData.contentId as string) || `COMMENT#${commentId}`,
              sk: (commentData.sk as string) || `COMMENT#${commentData.createdAt || now}`,
            },
            UpdateExpression: "SET likes = :l, likedBy = :lb, updatedAt = :u",
            ExpressionAttributeValues: {
              ":l": likes,
              ":lb": likedBy,
              ":u": now,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB update comment like notice:", err);
      }

      // Sync to Firebase
      try {
        await db.collection(getFirestoreCollection("comments")).doc(commentId).update({
          likes,
          likedBy,
          updatedAt: now,
        });
      } catch (fbErr) {
        console.warn("Firebase comment like update notice:", fbErr);
      }

      return NextResponse.json({
        success: true,
        comment: { id: commentId, ...commentData, likes, likedBy, updatedAt: now },
      });
    }

    if (commentText) {
      if (commentData.userId !== userId) {
        return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
      }

      const cleanText = commentText.trim();

      // Update DynamoDB
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: (commentData.contentId as string) || `COMMENT#${commentId}`,
              sk: (commentData.sk as string) || `COMMENT#${commentData.createdAt || now}`,
            },
            UpdateExpression: "SET commentText = :ct, updatedAt = :u",
            ExpressionAttributeValues: {
              ":ct": cleanText,
              ":u": now,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB update comment text notice:", err);
      }

      // Sync to Firebase
      try {
        await db.collection(getFirestoreCollection("comments")).doc(commentId).update({
          commentText: cleanText,
          updatedAt: now,
        });
      } catch (fbErr) {
        console.warn("Firebase update comment text notice:", fbErr);
      }

      return NextResponse.json({
        success: true,
        comment: { id: commentId, ...commentData, commentText: cleanText, updatedAt: now },
      });
    }

    return NextResponse.json({ error: "Invalid action or missing data" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete comment ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");
    const userId = searchParams.get("userId");

    if (!commentId || !userId) {
      return NextResponse.json(
        { error: "commentId and userId are required" },
        { status: 400 }
      );
    }

    // 1. Fetch Comment
    let commentData: Record<string, unknown> | null = null;
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": `COMMENT#${commentId}` },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) commentData = qRes.Items[0];
    } catch (err) {
      console.warn("DynamoDB fetch comment for delete notice:", err);
    }

    if (!commentData) {
      try {
        const doc = await db.collection(getFirestoreCollection("comments")).doc(commentId).get();
        if (doc.exists) commentData = doc.data() as Record<string, unknown>;
      } catch (fbErr) {
        console.warn("Firebase fetch comment for delete notice:", fbErr);
      }
    }

    if (!commentData) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (commentData.userId !== userId) {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }

    // 2. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.SocialAndContent,
          Key: {
            contentId: (commentData.contentId as string) || `COMMENT#${commentId}`,
            sk: (commentData.sk as string) || `COMMENT#${commentData.createdAt || Date.now()}`,
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB delete comment notice:", err);
    }

    // 3. Delete from Firebase
    try {
      await db.collection(getFirestoreCollection("comments")).doc(commentId).delete();
    } catch (fbErr) {
      console.warn("Firebase delete comment notice:", fbErr);
    }

    return NextResponse.json({ success: true, message: "Comment deleted successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}