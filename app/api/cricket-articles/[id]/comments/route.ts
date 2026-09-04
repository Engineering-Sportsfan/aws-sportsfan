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

async function extractId(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
): Promise<string> {
  if (context?.params) {
    const p = await Promise.resolve(context.params);
    if (p?.id) return decodeURIComponent(p.id);
  }
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idIdx = parts.indexOf("cricket-articles");
  if (idIdx !== -1 && parts[idIdx + 1] && parts[idIdx + 1] !== "comments" && parts[idIdx + 1] !== "comment") {
    return decodeURIComponent(parts[idIdx + 1]);
  }
  const lastPart = parts[parts.length - 1];
  return decodeURIComponent(
    lastPart === "comments" || lastPart === "comment" ? parts[parts.length - 2] || "" : lastPart || ""
  );
}

// ─── GET: Fetch comments for this cricket article ────────────────────────────
export async function GET(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawId = await extractId(req, context);
    const { searchParams } = new URL(req.url);
    const parentCommentId = searchParams.get("parentCommentId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const cleanId = rawId ? rawId.replace(/^(ARTICLE|NEWS)#/, "").trim() : searchParams.get("contentId")?.replace(/^(ARTICLE|NEWS)#/, "").trim() || "";

    if (!cleanId && !parentCommentId) {
      return NextResponse.json({ error: "Article ID or parentCommentId is required" }, { status: 400 });
    }

    let comments: Array<Record<string, unknown>> = [];

    // 1. If fetching replies to a comment
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
        console.warn("DynamoDB reply query notice:", err);
      }
    } else {
      // 2. Fetch top-level comments for this article
      const candidateKeys = [`ARTICLE#${cleanId}`, cleanId, `NEWS#${cleanId}`];
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

      // Fallback: Scan if query returned 0 items
      if (comments.length === 0) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: TABLES.SocialAndContent,
              FilterExpression:
                "(contentId = :c1 OR contentId = :c2 OR targetContentId = :c1 OR targetContentId = :c2) AND (attribute_not_exists(parentCommentId) OR parentCommentId = :nullVal)",
              ExpressionAttributeValues: {
                ":c1": cleanId,
                ":c2": `ARTICLE#${cleanId}`,
                ":nullVal": null,
              },
              Limit: limit,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            comments = scanRes.Items;
          }
        } catch (err) {
          console.warn("DynamoDB comments scan notice:", err);
        }
      }
    }

    // 3. Fallback to Firebase
    if (comments.length === 0 && db) {
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
          query = db
            .collection(commentsCol)
            .where("contentId", "in", [cleanId, `ARTICLE#${cleanId}`])
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

    // De-duplicate comments
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
    const rawId = await extractId(req, context);
    const body = await req.json().catch(() => ({}));

    const cleanContentId = (
      rawId ||
      body.contentId ||
      body.articleId ||
      body.id ||
      ""
    ).replace(/^(ARTICLE|NEWS|POST|ENGAGEMENT)#/, "").trim();

    const commentText = String(
      body.commentText || body.text || body.content || body.comment || body.message || ""
    ).trim();
    const userId = String(
      body.userId || body.authorUid || body.authorId || body.uid || body.user_id || `guest_${Date.now()}`
    ).trim();
    const userName = String(
      body.userName || body.authorName || body.username || body.name || body.displayName || "Fan"
    ).trim();
    const contentType = String(body.contentType || body.type || "article").trim();
    const userEmail = String(body.userEmail || body.email || "").trim();
    const userAvatar = String(body.userAvatar || body.authorAvatar || body.avatar || body.photoURL || "").trim();
    const parentCommentId = body.parentCommentId || null;
    const metadata = body.metadata || {};

    if (!cleanContentId || !commentText) {
      return NextResponse.json(
        { error: "Article ID (contentId) and comment text are required" },
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
      contentType,
      userId,
      userName,
      userEmail,
      userAvatar,
      commentText,
      parentCommentId,
      likes: 0,
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

    // 2. Dual-Write to Firestore
    try {
      await db.collection(getFirestoreCollection("comments")).doc(commentId).set({
        ...newComment,
        contentId: cleanContentId,
      });
    } catch (fbErr) {
      console.warn("Firestore comment insert notice:", fbErr);
    }

    // 3. Increment commentCount on article or replyCount on parent comment
    if (parentCommentId) {
      try {
        await db.collection(getFirestoreCollection("comments")).doc(parentCommentId).set(
          {
            replyCount: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true }
        );
      } catch {}
        } else {
      // Increment commentCount on the parent article — locate its actual
      // item first instead of guessing at sk shapes. Guessing caused
      // UpdateCommand to upsert phantom article-shaped rows for every
      // non-matching key tried (DynamoDB Update creates a new item when
      // the given Key doesn't already exist).
      try {
        const artQuery = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :c AND begins_with(sk, :skp)",
            ExpressionAttributeValues: {
              ":c": `ARTICLE#${cleanContentId}`,
              ":skp": "ARTICLE#",
            },
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
        }
      } catch (err) {
        console.warn("commentCount update notice:", err);
      }

      try {
        const artCol = getFirestoreCollection("cricketArticles");
        await db.collection(artCol).doc(cleanContentId).set(
          {
            commentCount: FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true }
        );
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

// // ─── PUT / PATCH: Like, edit or toggle a comment ─────────────────────────────
// export async function PUT(
//   req: NextRequest,
//   context?: { params?: { id?: string } | Promise<{ id?: string }> }
// ) {
//   try {
//     const body = await req.json();
//     const { commentId, userId, action, commentText } = body;

//     if (!commentId || !userId) {
//       return NextResponse.json({ error: "commentId and userId are required" }, { status: 400 });
//     }

//     let commentData: Record<string, unknown> | null = null;

//     try {
//       const qRes = await docClient.send(
//         new QueryCommand({
//           TableName: TABLES.SocialAndContent,
//           KeyConditionExpression: "contentId = :c",
//           ExpressionAttributeValues: { ":c": `COMMENT#${commentId}` },
//           Limit: 1,
//         })
//       );
//       if (qRes.Items && qRes.Items.length > 0) {
//         commentData = qRes.Items[0];
//       }
//     } catch {}

//     if (!commentData && db) {
//       try {
//         const doc = await db.collection(getFirestoreCollection("comments")).doc(commentId).get();
//         if (doc.exists) commentData = doc.data() as Record<string, unknown>;
//       } catch {}
//     }

//     const now = Date.now();

//     if (action === "like" || action === "unlike" || action === "toggle") {
//       let likedBy = Array.isArray(commentData?.likedBy) ? [...(commentData?.likedBy as string[])] : [];
//       let likes = typeof commentData?.likes === "number" ? commentData.likes : 0;
//       const isLiked = likedBy.includes(userId);

//       if (action === "toggle") {
//         if (isLiked) {
//           likedBy = likedBy.filter((u) => u !== userId);
//           likes = Math.max(0, likes - 1);
//         } else {
//           likedBy.push(userId);
//           likes += 1;
//         }
//       } else if (action === "like" && !isLiked) {
//         likedBy.push(userId);
//         likes += 1;
//       } else if (action === "unlike" && isLiked) {
//         likedBy = likedBy.filter((u) => u !== userId);
//         likes = Math.max(0, likes - 1);
//       }

//       try {
//         await db.collection(getFirestoreCollection("comments")).doc(commentId).set(
//           { likes, likedBy, updatedAt: now },
//           { merge: true }
//         );
//       } catch {}

//       return NextResponse.json({
//         success: true,
//         comment: { id: commentId, ...commentData, likes, likedBy, updatedAt: now },
//       });
//     }

//     if (commentText) {
//       const cleanText = String(commentText).trim();
//       try {
//         await db.collection(getFirestoreCollection("comments")).doc(commentId).set(
//           { commentText: cleanText, updatedAt: now },
//           { merge: true }
//         );
//       } catch {}

//       return NextResponse.json({
//         success: true,
//         comment: { id: commentId, ...commentData, commentText: cleanText, updatedAt: now },
//       });
//     }

//     return NextResponse.json({ error: "Invalid action" }, { status: 400 });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── DELETE: Delete comment ──────────────────────────────────────────────────
// export async function DELETE(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const commentId = searchParams.get("commentId");

//     if (!commentId) {
//       return NextResponse.json({ error: "commentId is required" }, { status: 400 });
//     }

//     try {
//       await db.collection(getFirestoreCollection("comments")).doc(commentId).delete();
//     } catch {}

//     return NextResponse.json({ success: true, message: "Comment deleted" });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }



// ─── PUT: Like, unlike, or edit a comment ─────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { commentId, userId, action, commentText } = body;

    if (!commentId || !userId) {
      return NextResponse.json({ error: "commentId and userId are required" }, { status: 400 });
    }

    // Comments are stored under contentId="ARTICLE#<articleId>", keyed by sk.
    // We don't know the parent articleId here, so locate the item by scanning
    // on the commentId attribute (comments volume is modest; revisit with a
    // commentId GSI if this table grows large).
    let commentItem: Record<string, unknown> | null = null;
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "commentId = :cid",
          ExpressionAttributeValues: { ":cid": commentId },
          Limit: 1,
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        commentItem = scanRes.Items[0];
      }
    } catch (err) {
      console.warn("DynamoDB comment lookup notice:", err);
    }

    const now = Date.now();

    if (action === "like" || action === "unlike" || action === "toggle") {
      let likedBy = Array.isArray(commentItem?.likedBy) ? [...(commentItem!.likedBy as string[])] : [];
      let likes = typeof commentItem?.likes === "number" ? (commentItem!.likes as number) : 0;
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

      // Update DynamoDB (the real source of truth for GET)
      if (commentItem) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: commentItem.contentId as string, sk: commentItem.sk as string },
              UpdateExpression: "SET likes = :l, likedBy = :lb, updatedAt = :u",
              ExpressionAttributeValues: { ":l": likes, ":lb": likedBy, ":u": now },
            })
          );
        } catch (err) {
          console.warn("DynamoDB comment like update notice:", err);
        }
      }

      // Dual-write to Firestore
      try {
        await db.collection(getFirestoreCollection("comments")).doc(commentId).set(
          { likes, likedBy, updatedAt: now },
          { merge: true }
        );
      } catch {}

      return NextResponse.json({
        success: true,
        comment: { id: commentId, commentId, ...commentItem, likes, likedBy, updatedAt: now },
      });
    }

    if (commentText) {
      const cleanText = String(commentText).trim();

      if (commentItem) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: commentItem.contentId as string, sk: commentItem.sk as string },
              UpdateExpression: "SET commentText = :t, updatedAt = :u",
              ExpressionAttributeValues: { ":t": cleanText, ":u": now },
            })
          );
        } catch (err) {
          console.warn("DynamoDB comment edit update notice:", err);
        }
      }

      try {
        await db.collection(getFirestoreCollection("comments")).doc(commentId).set(
          { commentText: cleanText, updatedAt: now },
          { merge: true }
        );
      } catch {}

      return NextResponse.json({
        success: true,
        comment: { id: commentId, commentId, ...commentItem, commentText: cleanText, updatedAt: now },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete comment (from BOTH DynamoDB and Firestore) ───────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }

    // Locate and delete the actual DynamoDB item (previously this route only
    // deleted from Firestore, leaving the DynamoDB copy — the primary read
    // source for GET — untouched, so "deleted" comments kept reappearing).
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "commentId = :cid",
          ExpressionAttributeValues: { ":cid": commentId },
          Limit: 1,
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        const item = scanRes.Items[0];
        await docClient.send(
          new DeleteCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: item.contentId as string, sk: item.sk as string },
          })
        );
      }
    } catch (err) {
      console.warn("DynamoDB comment delete notice:", err);
    }

    try {
      await db.collection(getFirestoreCollection("comments")).doc(commentId).delete();
    } catch {}

    return NextResponse.json({ success: true, message: "Comment deleted" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}