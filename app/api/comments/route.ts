// app/api/comments/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  QueryCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

interface Comment {
  id?: string;
  commentId?: string;
  contentId: string;
  targetContentId?: string;
  articleId?: string;
  contentType: string;
  userId: string;
  authorUid?: string;
  userName: string;
  authorName?: string;
  userEmail?: string;
  authorEmail?: string;
  userAvatar?: string;
  authorAvatarUrl?: string;
  commentText: string;
  text?: string;
  parentCommentId?: string | null;
  likes?: number;
  likeCount?: number;
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
    const contentId =
      searchParams.get("contentId") ||
      searchParams.get("articleId") ||
      searchParams.get("postId") ||
      searchParams.get("id");
    const parentCommentId = searchParams.get("parentCommentId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    if (!contentId && !parentCommentId) {
      return NextResponse.json(
        { error: "contentId, articleId, postId, or parentCommentId is required" },
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

      // Fallback scan for replies if GSI query empty/failed
      if (comments.length === 0) {
        try {
          const scanReplies = await docClient.send(
            new ScanCommand({
              TableName: TABLES.SocialAndContent,
              FilterExpression: "parentCommentId = :p",
              ExpressionAttributeValues: { ":p": parentCommentId },
              Limit: limit,
            })
          );
          if (scanReplies.Items && scanReplies.Items.length > 0) {
            comments = scanReplies.Items;
          }
        } catch (scanErr) {
          console.warn("DynamoDB replies scan notice:", scanErr);
        }
      }
    } else {
      // 2. Fetch top-level comments for contentId
      const cleanContentId = (contentId || "")
        .replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST|ENGAGEMENT)#/i, "")
        .trim();

      // Try fast QueryCommand on primary partition key
      const candidateKeys = [
        `ARTICLE#${cleanContentId}`,
        cleanContentId,
        `POST#${cleanContentId}`,
        `NEWS#${cleanContentId}`,
        `ARTICLE_CRICKET#${cleanContentId}`,
        contentId,
      ].filter(Boolean) as string[];

      for (const candKey of Array.from(new Set(candidateKeys))) {
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
              if (!item.parentCommentId || item.parentCommentId === "") {
                comments.push(item);
              }
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
                "(contentId = :c OR contentId = :cClean OR contentId = :cPrefix OR targetContentId = :c OR targetContentId = :cClean OR articleId = :cClean) AND (begins_with(sk, :skp) OR attribute_exists(commentId) OR attribute_exists(commentText)) AND (attribute_not_exists(parentCommentId) OR parentCommentId = :nullVal OR parentCommentId = :emptyVal)",
              ExpressionAttributeValues: {
                ":c": contentId,
                ":cClean": cleanContentId,
                ":cPrefix": `ARTICLE#${cleanContentId}`,
                ":skp": "COMMENT#",
                ":nullVal": null,
                ":emptyVal": "",
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
    if (comments.length === 0 && db) {
      try {
        const commentsCol = getFirestoreCollection("comments");
        if (parentCommentId) {
          const snap = await db
            .collection(commentsCol)
            .where("parentCommentId", "==", parentCommentId)
            .limit(limit)
            .get();

          comments = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            replyCount: doc.data().replyCount || 0,
          }));
        } else {
          const cleanContentId = (contentId || "")
            .replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST|ENGAGEMENT)#/i, "")
            .trim();

          const candidates = Array.from(
            new Set([contentId, cleanContentId, `ARTICLE#${cleanContentId}`, `POST#${cleanContentId}`].filter(Boolean) as string[])
          );

          for (const cand of candidates) {
            const snap = await db
              .collection(commentsCol)
              .where("contentId", "==", cand)
              .limit(limit)
              .get();

            if (!snap.empty) {
              const docs = snap.docs
                .map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                  replyCount: doc.data().replyCount || 0,
                }))
                .filter((item: any) => !item.parentCommentId || item.parentCommentId === "");
              comments.push(...docs);
            }
          }
        }
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

    const formatted = uniqueComments.map((c) => {
      const commentId = String(
        c.commentId ||
        c.id ||
        (c.sk as string)?.replace(/^COMMENT#\d+#?/, "")?.replace(/^COMMENT#/, "") ||
        (c.contentId as string)?.replace(/^COMMENT#/, "") ||
        ""
      );
      const text = String(c.commentText || c.text || c.content || c.comment || c.message || "");
      const userId = String(c.userId || c.authorUid || c.authorId || c.uid || c.user_id || "");
      const userName = String(c.userName || c.authorName || c.authorUsername || c.username || c.name || c.displayName || "Fan");
      const userAvatar = String(c.userAvatar || c.authorAvatar || c.authorAvatarUrl || c.avatar || c.photoURL || "");
      const userEmail = String(c.userEmail || c.authorEmail || c.email || "");
      const likes = typeof c.likes === "number" ? c.likes : Array.isArray(c.likedBy) ? c.likedBy.length : 0;
      const likedBy = Array.isArray(c.likedBy) ? (c.likedBy as string[]) : [];

      return {
        ...c,
        id: commentId,
        commentId,
        userId,
        authorUid: userId,
        userName,
        authorName: userName,
        userAvatar,
        authorAvatarUrl: userAvatar,
        userEmail,
        authorEmail: userEmail,
        commentText: text,
        text,
        likes,
        likeCount: likes,
        likedBy,
      };
    });

    return NextResponse.json(
      {
        success: true,
        comments: formatted.slice(0, limit),
        data: formatted.slice(0, limit),
        total: formatted.length,
        pagination: {
          limit,
          hasMore: formatted.length > limit,
          nextCursor: null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
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
    const cleanContentId = rawContentId.replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST|ENGAGEMENT)#/i, "").trim();

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
      commentId,
      contentId: cleanContentId,
      targetContentId: cleanContentId,
      articleId: cleanContentId,
      contentType,
      userId,
      authorUid: userId,
      userName,
      authorName: userName,
      userEmail,
      authorEmail: userEmail,
      userAvatar,
      authorAvatarUrl: userAvatar,
      commentText,
      text: commentText,
      parentCommentId,
      likes: 0,
      likeCount: 0,
      likedBy: [],
      replyCount: 0,
      timestamp: body.timestamp || now,
      createdAt: now,
      updatedAt: now,
      isFlagged: false,
      flaggedAt: null,
      metadata,
    };

    // 1. DynamoDB Item
    const dynamoItem = {
      ...newComment,
      contentId: `ARTICLE#${cleanContentId}`,
      targetContentId: cleanContentId,
      articleId: cleanContentId,
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
        await db.collection(getFirestoreCollection("comments")).doc(parentCommentId).set(
          {
            replyCount: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn("Firebase increment replyCount sync notice:", fbErr);
      }
    } else {
      const isPost = contentType === "post" || contentType.includes("post");
      const contentCollection = isPost
        ? getFirestoreCollection("socialPosts")
        : getFirestoreCollection("cricketArticles");

      try {
        await db.collection(contentCollection).doc(cleanContentId).set(
          {
            commentCount: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn("Firebase increment article commentCount sync notice:", fbErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: commentId,
        commentId,
        comment: newComment,
        data: newComment,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT / PATCH: Like/unlike or edit a comment ──────────────────────────────
export async function PUT(req: NextRequest) {
  return handleUpdate(req);
}

export async function PATCH(req: NextRequest) {
  return handleUpdate(req);
}

async function handleUpdate(req: NextRequest) {
  try {
    const body = await req.json();
    const commentId = String(body.commentId || body.id || "").trim();
    const userId = String(body.userId || body.authorUid || body.authorId || body.uid || "").trim();
    const { action } = body;
    const commentText = body.commentText ?? body.text ?? body.content;

    if (!commentId || !userId) {
      return NextResponse.json(
        { error: "commentId and userId are required" },
        { status: 400 }
      );
    }

    // 1. Fetch Comment
    let commentData: Record<string, unknown> | null = null;

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "commentId = :cid OR id = :cid OR contains(sk, :cid)",
          ExpressionAttributeValues: { ":cid": commentId },
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        commentData = scanRes.Items[0];
      }
    } catch (err) {
      console.warn("DynamoDB comment scan notice:", err);
    }

    if (!commentData && db) {
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

    if (action === "like" || action === "unlike" || action === "toggle") {
      let likedBy = Array.isArray(commentData.likedBy) ? [...(commentData.likedBy as string[])] : [];
      const isLiked = likedBy.includes(userId);
      let likes = typeof commentData.likes === "number" ? commentData.likes : likedBy.length;

      if (action === "toggle") {
        if (isLiked) {
          likedBy = likedBy.filter((u) => u !== userId);
          likes = Math.max(0, likes - 1);
        } else {
          likedBy.push(userId);
          likes += 1;
        }
      } else if (action === "like" && !isLiked) {
        likedBy.push(userId);
        likes += 1;
      } else if (action === "unlike" && isLiked) {
        const idx = likedBy.indexOf(userId);
        if (idx !== -1) likedBy.splice(idx, 1);
        likes = Math.max(0, likes - 1);
      }

      // Update DynamoDB
      if (commentData.contentId && commentData.sk) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: commentData.contentId as string,
                sk: commentData.sk as string,
              },
              UpdateExpression: "SET likes = :l, likeCount = :l, likedBy = :lb, updatedAt = :u",
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
      }

      // Sync to Firebase
      try {
        await db.collection(getFirestoreCollection("comments")).doc(commentId).set(
          {
            likes,
            likeCount: likes,
            likedBy,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn("Firebase comment like update notice:", fbErr);
      }

      return NextResponse.json({
        success: true,
        comment: { id: commentId, commentId, ...commentData, likes, likeCount: likes, likedBy, updatedAt: now },
      });
    }

    if (commentText !== undefined) {
      const commentOwner = String(commentData.userId || commentData.authorUid || "");
      if (commentOwner && commentOwner !== userId) {
        return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
      }

      const cleanText = String(commentText).trim();

      // Update DynamoDB
      if (commentData.contentId && commentData.sk) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: commentData.contentId as string,
                sk: commentData.sk as string,
              },
              UpdateExpression: "SET commentText = :ct, #txt = :ct, updatedAt = :u",
              ExpressionAttributeNames: { "#txt": "text" },
              ExpressionAttributeValues: {
                ":ct": cleanText,
                ":u": now,
              },
            })
          );
        } catch (err) {
          console.warn("DynamoDB update comment text notice:", err);
        }
      }

      // Sync to Firebase
      try {
        await db.collection(getFirestoreCollection("comments")).doc(commentId).set(
          {
            commentText: cleanText,
            text: cleanText,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn("Firebase update comment text notice:", fbErr);
      }

      return NextResponse.json({
        success: true,
        comment: { id: commentId, commentId, ...commentData, commentText: cleanText, text: cleanText, updatedAt: now },
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
    const commentId = searchParams.get("commentId") || searchParams.get("id");
    const userId = searchParams.get("userId") || searchParams.get("authorUid");

    if (!commentId) {
      return NextResponse.json(
        { error: "commentId is required" },
        { status: 400 }
      );
    }

    // 1. Fetch Comment
    let commentData: Record<string, unknown> | null = null;
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "commentId = :cid OR id = :cid OR contains(sk, :cid)",
          ExpressionAttributeValues: { ":cid": commentId },
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) commentData = scanRes.Items[0];
    } catch (err) {
      console.warn("DynamoDB fetch comment for delete notice:", err);
    }

    if (!commentData && db) {
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

    const commentOwner = String(commentData.userId || commentData.authorUid || "");
    if (userId && commentOwner && commentOwner !== userId) {
      return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
    }

    // 2. Delete from DynamoDB
    if (commentData.contentId && commentData.sk) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: commentData.contentId as string,
              sk: commentData.sk as string,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB delete comment notice:", err);
      }
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