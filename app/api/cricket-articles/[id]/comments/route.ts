// app/api/cricket-articles/[id]/comments/route.ts — Cricket Article Comments API
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { v4 as uuidv4 } from "uuid";
import {
  QueryCommand,
  ScanCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * Extracts the cricket article ID safely from route params, URL path, query params, or body.
 * Ignores path segments that match keywords like "cricket-articles", "comments", "comment", "api".
 */
export async function extractArticleId(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
): Promise<string> {
  if (context?.params) {
    const p = await Promise.resolve(context.params);
    if (p?.id) {
      const decoded = decodeURIComponent(p.id).trim();
      if (decoded && !["comments", "comment", "cricket-articles"].includes(decoded.toLowerCase())) {
        return decoded;
      }
    }
  }

  const url = new URL(req.url);

  // 1. Check query parameters first
  const queryId =
    url.searchParams.get("articleId") ||
    url.searchParams.get("contentId") ||
    url.searchParams.get("id") ||
    url.searchParams.get("content_id");
  if (queryId && queryId.trim()) {
    return decodeURIComponent(queryId.trim());
  }

  // 2. Parse URL path segments
  const parts = url.pathname.split("/").filter(Boolean);
  const idIdx = parts.indexOf("cricket-articles");
  if (idIdx !== -1 && parts[idIdx + 1]) {
    const nextPart = decodeURIComponent(parts[idIdx + 1]).trim();
    if (!["comments", "comment", "like", "likes", "view", "views"].includes(nextPart.toLowerCase())) {
      return nextPart;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart === "comments" || lastPart === "comment") {
    const prevPart = parts[parts.length - 2];
    if (prevPart && !["cricket-articles", "api"].includes(prevPart.toLowerCase())) {
      return decodeURIComponent(prevPart.trim());
    }
  } else if (lastPart && !["cricket-articles", "api"].includes(lastPart.toLowerCase())) {
    return decodeURIComponent(lastPart.trim());
  }

  return "";
}

/**
 * Normalizes a raw comment item from DynamoDB or Firestore into a standard frontend shape.
 */
function normalizeComment(c: Record<string, unknown>, fallbackArticleId?: string) {
  const commentId = String(
    c.commentId ||
    c.id ||
    (c.sk as string)?.replace(/^COMMENT#\d+#?/, "")?.replace(/^COMMENT#/, "") ||
    (c.contentId as string)?.replace(/^COMMENT#/, "") ||
    ""
  );

  const cleanArticleId = fallbackArticleId ||
    String(c.articleId || c.contentId || c.targetContentId || "")
      .replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "")
      .trim();

  const text = String(
    c.commentText ??
    c.text ??
    c.content ??
    c.comment ??
    c.message ??
    ""
  ).trim();

  const userId = String(
    c.userId ??
    c.authorUid ??
    c.authorId ??
    c.uid ??
    c.user_id ??
    ""
  ).trim();

  const userName = String(
    c.userName ??
    c.authorName ??
    c.authorUsername ??
    c.username ??
    c.name ??
    c.displayName ??
    "Fan"
  ).trim();

  const userAvatar = String(
    c.userAvatar ??
    c.authorAvatar ??
    c.authorAvatarUrl ??
    c.avatar ??
    c.photoURL ??
    ""
  ).trim();

  const userEmail = String(
    c.userEmail ??
    c.authorEmail ??
    c.email ??
    ""
  ).trim();

  const createdAt = Number(c.createdAt || c.timestamp || Date.now());
  const updatedAt = Number(c.updatedAt || c.createdAt || createdAt);
  const likes = typeof c.likes === "number" ? c.likes : Array.isArray(c.likedBy) ? c.likedBy.length : 0;
  const likedBy = Array.isArray(c.likedBy) ? (c.likedBy as string[]) : [];
  const replyCount = typeof c.replyCount === "number" ? c.replyCount : 0;
  const parentCommentId = (c.parentCommentId as string | null) || null;
  const isFlagged = Boolean(c.isFlagged);
  const flaggedAt = c.flaggedAt ? Number(c.flaggedAt) : null;
  const contentType = String(c.contentType || "article");

  return {
    ...c,
    id: commentId,
    commentId,
    contentId: cleanArticleId,
    targetContentId: cleanArticleId,
    articleId: cleanArticleId,
    contentType,
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
    replyCount,
    parentCommentId,
    isFlagged,
    flaggedAt,
    createdAt,
    updatedAt,
    timestamp: createdAt,
  };
}

// ─── GET: Fetch comments for this cricket article ────────────────────────────
export async function GET(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawId = await extractArticleId(req, context);
    const { searchParams } = new URL(req.url);
    const parentCommentId = searchParams.get("parentCommentId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const cleanId = rawId
      ? rawId.replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "").trim()
      : (searchParams.get("contentId") || searchParams.get("articleId") || searchParams.get("id"))
          ?.replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "")
          .trim() || "";

    if (!cleanId && !parentCommentId) {
      return NextResponse.json(
        { error: "Article ID (or contentId) or parentCommentId is required" },
        { status: 400 }
      );
    }

    let rawComments: Array<Record<string, unknown>> = [];

    // 1. If fetching replies to a comment
    if (parentCommentId) {
      // 1A. Try Query on GSI parentCommentId-createdAt-index
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
          rawComments = replyRes.Items;
        }
      } catch (err) {
        console.warn("[Cricket Article Comments GET] GSI parentCommentId query notice:", err);
      }

      // 1B. Fallback Scan on DynamoDB for parentCommentId if GSI not found / empty
      if (rawComments.length === 0) {
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
            rawComments = scanReplies.Items;
          }
        } catch (scanErr) {
          console.warn("[Cricket Article Comments GET] Replies scan notice:", scanErr);
        }
      }
    } else {
      // 2. Fetch top-level comments for this article
      const candidateKeys = [
        `ARTICLE#${cleanId}`,
        cleanId,
        `NEWS#${cleanId}`,
        `ARTICLE_CRICKET#${cleanId}`,
      ];

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
              if (!item.parentCommentId || item.parentCommentId === "") {
                rawComments.push(item);
              }
            }
          }
        } catch (dynErr) {
          console.warn(`[Cricket Article Comments GET] Query candidate [${candKey}] notice:`, dynErr);
        }
      }

      // 2B. Fallback Scan on DynamoDB if candidate queries returned 0 items
      if (rawComments.length === 0) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: TABLES.SocialAndContent,
              FilterExpression:
                "(contentId = :c1 OR contentId = :c2 OR contentId = :c3 OR targetContentId = :c1 OR targetContentId = :c2 OR articleId = :c1 OR articleId = :c2) AND (begins_with(sk, :skp) OR attribute_exists(commentId) OR attribute_exists(commentText)) AND (attribute_not_exists(parentCommentId) OR parentCommentId = :nullVal OR parentCommentId = :emptyVal)",
              ExpressionAttributeValues: {
                ":c1": cleanId,
                ":c2": `ARTICLE#${cleanId}`,
                ":c3": `ARTICLE_CRICKET#${cleanId}`,
                ":skp": "COMMENT#",
                ":nullVal": null,
                ":emptyVal": "",
              },
              Limit: limit,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            rawComments = scanRes.Items;
          }
        } catch (scanErr) {
          console.warn("[Cricket Article Comments GET] Scan notice:", scanErr);
        }
      }
    }

    // 3. Fallback to Firestore if DynamoDB returned no items
    if (rawComments.length === 0 && db) {
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("comments"), "comments"])
        );

        for (const col of collections) {
          if (parentCommentId) {
            const snap = await db
              .collection(col)
              .where("parentCommentId", "==", parentCommentId)
              .limit(limit)
              .get();

            if (!snap.empty) {
              const items = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }));
              rawComments.push(...items);
              break;
            }
          } else {
            // Query by cleanId and ARTICLE#cleanId without compound filters to avoid index errors
            const candidates = [cleanId, `ARTICLE#${cleanId}`];
            for (const cand of candidates) {
              const snap = await db
                .collection(col)
                .where("contentId", "==", cand)
                .limit(limit)
                .get();

              if (!snap.empty) {
                const items = snap.docs
                  .map((doc) => ({ id: doc.id, ...doc.data() }))
                  .filter((item: any) => !item.parentCommentId || item.parentCommentId === "");
                rawComments.push(...items);
              }
            }
            if (rawComments.length > 0) break;
          }
        }
      } catch (fbErr) {
        console.warn("[Cricket Article Comments GET] Firebase fallback notice:", fbErr);
      }
    }

    // De-duplicate comments
    const seen = new Set<string>();
    const uniqueComments = rawComments.filter((c) => {
      const cid = String(
        c.commentId ||
        c.id ||
        (c.sk as string)?.replace(/^COMMENT#\d+#?/, "")?.replace(/^COMMENT#/, "") ||
        ""
      );
      if (!cid || seen.has(cid)) return false;
      seen.add(cid);
      return true;
    });

    // Normalize and sort by createdAt desc (or asc for replies)
    const formatted = uniqueComments.map((c) => normalizeComment(c, cleanId));
    formatted.sort((a, b) =>
      parentCommentId ? a.createdAt - b.createdAt : b.createdAt - a.createdAt
    );

    const paginated = formatted.slice(0, limit);

    return NextResponse.json(
      {
        success: true,
        comments: paginated,
        data: paginated,
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
    console.error("GET /api/cricket-articles/[id]/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST: Create comment for this cricket article ───────────────────────────
export async function POST(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawId = await extractArticleId(req, context);
    const body = await req.json().catch(() => ({}));

    const cleanContentId = (
      rawId ||
      body.contentId ||
      body.articleId ||
      body.id ||
      body.content_id ||
      ""
    )
      .replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST|ENGAGEMENT)#/i, "")
      .trim();

    const commentText = String(
      body.commentText ||
      body.text ||
      body.content ||
      body.comment ||
      body.message ||
      ""
    ).trim();

    const userId = String(
      body.userId ||
      body.authorUid ||
      body.authorId ||
      body.uid ||
      body.user_id ||
      `guest_${Date.now()}`
    ).trim();

    const userName = String(
      body.userName ||
      body.authorName ||
      body.authorUsername ||
      body.username ||
      body.name ||
      body.displayName ||
      "Fan"
    ).trim();

    const contentType = String(body.contentType || body.type || "article").trim();
    const userEmail = String(body.userEmail || body.authorEmail || body.email || "").trim();
    const userAvatar = String(
      body.userAvatar ||
      body.authorAvatar ||
      body.authorAvatarUrl ||
      body.avatar ||
      body.photoURL ||
      ""
    ).trim();
    const parentCommentId = body.parentCommentId || null;
    const metadata = body.metadata || {};

    if (!cleanContentId || !commentText) {
      return NextResponse.json(
        { error: "Article ID (contentId or articleId) and comment text are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const commentId = `cmt_${now}_${uuidv4().substring(0, 8)}`;

    const newComment = {
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
      likedBy: [] as string[],
      replyCount: 0,
      timestamp: body.timestamp || now,
      createdAt: now,
      updatedAt: now,
      isFlagged: false,
      flaggedAt: null,
      metadata,
    };

    // 1. DynamoDB: Put comment item
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
      console.warn("[Cricket Article Comments POST] DynamoDB comment insert notice:", dynErr);
    }

    // 2. Dual-Write to Firestore
    try {
      const collections = Array.from(
        new Set([getFirestoreCollection("comments"), "comments"])
      );
      for (const col of collections) {
        await db.collection(col).doc(commentId).set({
          ...newComment,
          contentId: cleanContentId,
        });
      }
    } catch (fbErr) {
      console.warn("[Cricket Article Comments POST] Firestore comment insert notice:", fbErr);
    }

    // 3. Increment commentCount on article or replyCount on parent comment
    if (parentCommentId) {
      // Increment replyCount in DynamoDB
      try {
        const parentScan = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent,
            FilterExpression: "commentId = :cid OR sk = :sk",
            ExpressionAttributeValues: {
              ":cid": parentCommentId,
              ":sk": `COMMENT#${parentCommentId}`,
            },
          })
        );
        if (parentScan.Items && parentScan.Items.length > 0) {
          const parentItem = parentScan.Items[0];
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: parentItem.contentId as string,
                sk: parentItem.sk as string,
              },
              UpdateExpression: "SET replyCount = if_not_exists(replyCount, :zero) + :inc, updatedAt = :u",
              ExpressionAttributeValues: { ":zero": 0, ":inc": 1, ":u": now },
            })
          );
        }
      } catch (dynReplyErr) {
        console.warn("[Cricket Article Comments POST] Parent replyCount update DynamoDB notice:", dynReplyErr);
      }

      // Increment replyCount in Firestore
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("comments"), "comments"])
        );
        for (const col of collections) {
          await db.collection(col).doc(parentCommentId).set(
            {
              replyCount: FieldValue.increment(1),
              updatedAt: now,
            },
            { merge: true }
          );
        }
      } catch {}
    } else {
      // Increment commentCount on parent article in DynamoDB
      const articleCandidateKeys = [
        `ARTICLE#${cleanContentId}`,
        cleanContentId,
        `NEWS#${cleanContentId}`,
        `ARTICLE_CRICKET#${cleanContentId}`,
      ];

      for (const cand of articleCandidateKeys) {
        try {
          const artQuery = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :c",
              ExpressionAttributeValues: { ":c": cand },
              Limit: 1,
            })
          );

          if (artQuery.Items && artQuery.Items.length > 0) {
            const artItem = artQuery.Items[0];
            await docClient.send(
              new UpdateCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: artItem.contentId as string, sk: artItem.sk as string },
                UpdateExpression: "SET commentCount = if_not_exists(commentCount, :zero) + :inc, updatedAt = :u",
                ExpressionAttributeValues: { ":zero": 0, ":inc": 1, ":u": now },
              })
            );
            break;
          }
        } catch (err) {
          console.warn("[Cricket Article Comments POST] commentCount DynamoDB update notice:", err);
        }
      }

      // Increment commentCount in Firestore
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
        );
        for (const col of collections) {
          await db.collection(col).doc(cleanContentId).set(
            {
              commentCount: FieldValue.increment(1),
              updatedAt: now,
            },
            { merge: true }
          );
        }
      } catch {}
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
    console.error("POST /api/cricket-articles/[id]/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT / PATCH: Like, unlike, toggle or edit a comment ─────────────────────
export async function PUT(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  return handleCommentUpdate(req, context);
}

export async function PATCH(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  return handleCommentUpdate(req, context);
}

async function handleCommentUpdate(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawArticleId = await extractArticleId(req, context);
    const body = await req.json().catch(() => ({}));
    const commentId = String(body.commentId || body.id || "").trim();
    const userId = String(
      body.userId || body.authorUid || body.authorId || body.uid || body.user_id || ""
    ).trim();
    const action = body.action; // "like" | "unlike" | "toggle"
    const commentText = body.commentText ?? body.text ?? body.content;

    if (!commentId || !userId) {
      return NextResponse.json(
        { error: "commentId and userId are required" },
        { status: 400 }
      );
    }

    const cleanArticleId = rawArticleId.replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "").trim();

    // 1. Locate comment in DynamoDB
    let commentItem: Record<string, unknown> | null = null;

    // Fast query if articleId is known
    if (cleanArticleId) {
      const candidates = [`ARTICLE#${cleanArticleId}`, cleanArticleId];
      for (const cand of candidates) {
        try {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :c AND begins_with(sk, :skp)",
              FilterExpression: "commentId = :cid OR id = :cid",
              ExpressionAttributeValues: {
                ":c": cand,
                ":skp": "COMMENT#",
                ":cid": commentId,
              },
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            commentItem = qRes.Items[0];
            break;
          }
        } catch {}
      }
    }

    // Full table scan without Limit: 1 (safe & thorough)
    if (!commentItem) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent,
            FilterExpression: "commentId = :cid OR id = :cid OR contains(sk, :cid)",
            ExpressionAttributeValues: { ":cid": commentId },
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          commentItem = scanRes.Items[0];
        }
      } catch (err) {
        console.warn("[Cricket Article Comments PUT] DynamoDB comment scan notice:", err);
      }
    }

    // 2. Fetch from Firestore fallback if not in DynamoDB
    if (!commentItem && db) {
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("comments"), "comments"])
        );
        for (const col of collections) {
          const doc = await db.collection(col).doc(commentId).get();
          if (doc.exists) {
            commentItem = { id: doc.id, ...doc.data() };
            break;
          }
        }
      } catch {}
    }

    const now = Date.now();

    // ── CASE A: LIKE / UNLIKE / TOGGLE ACTION ─────────────────────────────────
    if (action === "like" || action === "unlike" || action === "toggle") {
      let likedBy = Array.isArray(commentItem?.likedBy)
        ? [...(commentItem!.likedBy as string[])]
        : [];
      let likes = typeof commentItem?.likes === "number"
        ? (commentItem!.likes as number)
        : likedBy.length;
      const isLiked = likedBy.includes(userId);

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
        likedBy = likedBy.filter((u) => u !== userId);
        likes = Math.max(0, likes - 1);
      }

      // Update DynamoDB item
      if (commentItem && commentItem.contentId && commentItem.sk) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: commentItem.contentId as string,
                sk: commentItem.sk as string,
              },
              UpdateExpression: "SET likes = :l, likeCount = :l, likedBy = :lb, updatedAt = :u",
              ExpressionAttributeValues: {
                ":l": likes,
                ":lb": likedBy,
                ":u": now,
              },
            })
          );
        } catch (dynErr) {
          console.warn("[Cricket Article Comments PUT] DynamoDB like update notice:", dynErr);
        }
      }

      // Dual-write to Firestore
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("comments"), "comments"])
        );
        for (const col of collections) {
          await db.collection(col).doc(commentId).set(
            { likes, likeCount: likes, likedBy, updatedAt: now },
            { merge: true }
          );
        }
      } catch {}

      const updated = normalizeComment(
        {
          ...(commentItem || {}),
          id: commentId,
          commentId,
          likes,
          likeCount: likes,
          likedBy,
          updatedAt: now,
        },
        cleanArticleId
      );

      return NextResponse.json({
        success: true,
        comment: updated,
        data: updated,
      });
    }

    // ── CASE B: EDIT COMMENT TEXT ─────────────────────────────────────────────
    if (commentText !== undefined) {
      const cleanText = String(commentText).trim();

      if (commentItem && commentItem.contentId && commentItem.sk) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: commentItem.contentId as string,
                sk: commentItem.sk as string,
              },
              UpdateExpression: "SET commentText = :t, #txt = :t, updatedAt = :u",
              ExpressionAttributeNames: { "#txt": "text" },
              ExpressionAttributeValues: { ":t": cleanText, ":u": now },
            })
          );
        } catch (dynErr) {
          console.warn("[Cricket Article Comments PUT] DynamoDB text update notice:", dynErr);
        }
      }

      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("comments"), "comments"])
        );
        for (const col of collections) {
          await db.collection(col).doc(commentId).set(
            { commentText: cleanText, text: cleanText, updatedAt: now },
            { merge: true }
          );
        }
      } catch {}

      const updated = normalizeComment(
        {
          ...(commentItem || {}),
          id: commentId,
          commentId,
          commentText: cleanText,
          text: cleanText,
          updatedAt: now,
        },
        cleanArticleId
      );

      return NextResponse.json({
        success: true,
        comment: updated,
        data: updated,
      });
    }

    return NextResponse.json({ error: "Invalid action or missing commentText" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/cricket-articles/[id]/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete comment (DynamoDB and Firestore) ─────────────────────────
export async function DELETE(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawArticleId = await extractArticleId(req, context);
    const { searchParams } = new URL(req.url);
    let commentId = searchParams.get("commentId") || searchParams.get("id");

    if (!commentId) {
      const body = await req.json().catch(() => ({}));
      commentId = body?.commentId || body?.id;
    }

    if (!commentId) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }

    const cleanArticleId = rawArticleId.replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "").trim();

    // 1. Locate comment item in DynamoDB
    let commentItem: Record<string, unknown> | null = null;

    if (cleanArticleId) {
      const candidates = [`ARTICLE#${cleanArticleId}`, cleanArticleId];
      for (const cand of candidates) {
        try {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :c AND begins_with(sk, :skp)",
              FilterExpression: "commentId = :cid OR id = :cid",
              ExpressionAttributeValues: {
                ":c": cand,
                ":skp": "COMMENT#",
                ":cid": commentId,
              },
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            commentItem = qRes.Items[0];
            break;
          }
        } catch {}
      }
    }

    if (!commentItem) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent,
            FilterExpression: "commentId = :cid OR id = :cid OR contains(sk, :cid)",
            ExpressionAttributeValues: { ":cid": commentId },
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          commentItem = scanRes.Items[0];
        }
      } catch (err) {
        console.warn("[Cricket Article Comments DELETE] DynamoDB scan notice:", err);
      }
    }

    // 2. Delete item from DynamoDB
    if (commentItem && commentItem.contentId && commentItem.sk) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: commentItem.contentId as string,
              sk: commentItem.sk as string,
            },
          })
        );
      } catch (err) {
        console.warn("[Cricket Article Comments DELETE] DynamoDB delete notice:", err);
      }
    }

    // 3. Delete from Firestore
    try {
      const collections = Array.from(
        new Set([getFirestoreCollection("comments"), "comments"])
      );
      for (const col of collections) {
        await db.collection(col).doc(commentId).delete().catch(() => {});
      }
    } catch {}

    // 4. Decrement commentCount on article if top-level, or replyCount on parent comment
    const parentCommentId = commentItem?.parentCommentId as string | undefined;
    const resolvedArticleId =
      cleanArticleId ||
      String(commentItem?.contentId || commentItem?.targetContentId || commentItem?.articleId || "")
        .replace(/^(ARTICLE_CRICKET|ARTICLE|NEWS|POST)#/i, "")
        .trim();

    const now = Date.now();

    if (parentCommentId) {
      // Decrement replyCount on parent in Firestore
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("comments"), "comments"])
        );
        for (const col of collections) {
          await db.collection(col).doc(parentCommentId).set(
            {
              replyCount: FieldValue.increment(-1),
              updatedAt: now,
            },
            { merge: true }
          );
        }
      } catch {}
    } else if (resolvedArticleId) {
      // Decrement commentCount on article in Firestore
      try {
        const collections = Array.from(
          new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
        );
        for (const col of collections) {
          await db.collection(col).doc(resolvedArticleId).set(
            {
              commentCount: FieldValue.increment(-1),
              updatedAt: now,
            },
            { merge: true }
          );
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: "Comment deleted successfully",
      id: commentId,
      commentId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/cricket-articles/[id]/comments error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}