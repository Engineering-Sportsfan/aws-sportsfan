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
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
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
            TableName: "SocialAndContent",
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
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "SocialAndContent",
            FilterExpression: "contentId = :c AND (attribute_not_exists(parentCommentId) OR parentCommentId = :nullVal)",
            ExpressionAttributeValues: {
              ":c": contentId,
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

    // 3. Fallback to Firebase if DynamoDB returned no items
    if (comments.length === 0) {
      try {
        let query: FirebaseFirestore.Query;
        if (parentCommentId) {
          query = db
            .collection("comments")
            .where("parentCommentId", "==", parentCommentId)
            .orderBy("createdAt", "asc")
            .limit(limit);
        } else {
          query = db
            .collection("comments")
            .where("contentId", "==", contentId)
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

    const formatted = comments.map((c) => ({
      id: c.id || (c.commentId as string) || (c.contentId as string)?.replace(/^COMMENT#/, ""),
      ...c,
    }));

    return NextResponse.json({
      success: true,
      comments: formatted.slice(0, limit),
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
    const {
      contentId,
      contentType,
      commentText,
      userId,
      userName,
      userEmail,
      userAvatar,
      parentCommentId,
      timestamp,
      metadata,
    } = body;

    if (!contentId || !contentType || !commentText || !userId || !userName) {
      return NextResponse.json(
        { error: "contentId, contentType, commentText, userId, and userName are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const commentId = uuidv4();

    const newComment: Comment = {
      id: commentId,
      contentId,
      contentType,
      userId,
      userName,
      userEmail: userEmail || "",
      userAvatar: userAvatar || "",
      commentText: commentText.trim(),
      parentCommentId: parentCommentId || null,
      likes: 0,
      likedBy: [],
      replyCount: 0,
      timestamp: timestamp || null,
      createdAt: now,
      updatedAt: now,
      isFlagged: false,
      flaggedAt: null,
      metadata: metadata || {},
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      ...newComment,
      contentId: `COMMENT#${commentId}`,
      sk: `COMMENT#${now}`,
      commentId,
    };

    await dualWrite("comments", commentId, "SocialAndContent", dynamoItem);

    if (parentCommentId) {
      try {
        await db.collection("comments").doc(parentCommentId).update({
          replyCount: FieldValue.increment(1),
          updatedAt: now,
        });
      } catch (fbErr) {
        console.warn("Firebase increment replyCount sync notice:", fbErr);
      }
    } else {
      const contentCollection = contentType === "post" ? "socialPosts" : "articles";
      try {
        await db.collection(contentCollection).doc(contentId).update({
          commentCount: FieldValue.increment(1),
          updatedAt: now,
        });
      } catch (fbErr) {
        console.warn("Firebase increment post commentCount sync notice:", fbErr);
      }
    }

    return NextResponse.json(
      { success: true, id: commentId, comment: { id: commentId, ...newComment } },
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
          TableName: "SocialAndContent",
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
        const doc = await db.collection("comments").doc(commentId).get();
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
            TableName: "SocialAndContent",
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
        await db.collection("comments").doc(commentId).update({
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
            TableName: "SocialAndContent",
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
        await db.collection("comments").doc(commentId).update({
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
          TableName: "SocialAndContent",
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
        const doc = await db.collection("comments").doc(commentId).get();
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
          TableName: "SocialAndContent",
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
      await db.collection("comments").doc(commentId).delete();
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