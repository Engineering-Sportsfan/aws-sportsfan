// app/api/cricket-articles/[id]/like/route.ts — Like / Unlike Cricket Article API
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, UpdateCommand, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

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
  // URL pattern: /api/cricket-articles/[id]/like -> parts[2] is id
  const idIdx = parts.indexOf("cricket-articles");
  if (idIdx !== -1 && parts[idIdx + 1] && parts[idIdx + 1] !== "like") {
    return decodeURIComponent(parts[idIdx + 1]);
  }
  const lastPart = parts[parts.length - 1];
  return decodeURIComponent(lastPart === "like" || lastPart === "likes" ? parts[parts.length - 2] || "" : lastPart || "");
}

export async function POST(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawId = await extractId(req, context);
    if (!rawId) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "like"; // "like" | "unlike" | "toggle"
    const userId = (body.userId || body.user?.userId || body.email || "guest").trim();

    const cleanId = rawId.replace(/^(ARTICLE|NEWS)#/, "").trim();
    const candidates = Array.from(
      new Set([
        `ARTICLE#${cleanId}`,
        `NEWS#${cleanId}`,
        cleanId,
        rawId,
      ])
    );

    let articleItem: Record<string, unknown> | null = null;
    let matchedCand = candidates[0];

    // 1. Fetch current article from DynamoDB
    for (const cand of candidates) {
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :c",
            ExpressionAttributeValues: { ":c": cand },
            Limit: 1,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          articleItem = qRes.Items[0];
          matchedCand = cand;
          break;
        }
      } catch (dynErr) {
        console.warn(`DynamoDB article like lookup [${cand}] notice:`, dynErr);
      }
    }

    // Fallback to Firestore if needed
    if (!articleItem) {
      const collections = Array.from(
        new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
      );
      for (const col of collections) {
        try {
          const doc = await db.collection(col).doc(cleanId).get();
          if (doc.exists) {
            articleItem = { id: doc.id, ...doc.data() };
            break;
          }
        } catch {}
      }
    }

    const now = Date.now();
    let currentLikes = Number(articleItem?.likes ?? articleItem?.likeCount ?? 0);
    let likedBy: string[] = Array.isArray(articleItem?.likedBy)
      ? [...(articleItem.likedBy as string[])]
      : [];

    const isCurrentlyLiked = likedBy.includes(userId);
    let isLiked = isCurrentlyLiked;

    if (action === "toggle") {
      if (isCurrentlyLiked) {
        likedBy = likedBy.filter((u) => u !== userId);
        currentLikes = Math.max(0, currentLikes - 1);
        isLiked = false;
      } else {
        if (!likedBy.includes(userId)) likedBy.push(userId);
        currentLikes += 1;
        isLiked = true;
      }
    } else if (action === "unlike") {
      if (isCurrentlyLiked) {
        likedBy = likedBy.filter((u) => u !== userId);
        currentLikes = Math.max(0, currentLikes - 1);
      }
      isLiked = false;
    } else {
      // default "like"
      if (!isCurrentlyLiked) {
        if (!likedBy.includes(userId)) likedBy.push(userId);
        currentLikes += 1;
      }
      isLiked = true;
    }

    // 2. Update DynamoDB SocialAndContent table
    for (const cand of candidates) {
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :c",
            ExpressionAttributeValues: { ":c": cand },
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          for (const it of qRes.Items) {
            await docClient.send(
              new UpdateCommand({
                TableName: TABLES.SocialAndContent,
                Key: {
                  contentId: it.contentId as string,
                  sk: it.sk as string,
                },
                UpdateExpression: "SET likes = :l, likeCount = :l, likedBy = :lb, updatedAt = :u",
                ExpressionAttributeValues: {
                  ":l": currentLikes,
                  ":lb": likedBy,
                  ":u": now,
                },
              })
            );
          }
        }
      } catch (dynErr) {
        console.warn(`DynamoDB article like update [${cand}] notice:`, dynErr);
      }
    }

    // 3. Store user like engagement record in DynamoDB (matches FlipLine & Roar pattern)
    if (userId && userId !== "guest") {
      try {
        if (isLiked) {
          await docClient.send(
            new PutCommand({
              TableName: TABLES.SocialAndContent,
              Item: {
                contentId: `ARTICLE#${cleanId}`,
                sk: `LIKE#${userId}`,
                userId,
                articleId: cleanId,
                createdAt: now,
              },
            })
          );
        } else {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: `ARTICLE#${cleanId}`,
                sk: `LIKE#${userId}`,
              },
            })
          );
        }
      } catch (engErr) {
        console.warn("DynamoDB article like engagement item notice:", engErr);
      }
    }

    // 4. Update Firestore collections
    const collections = Array.from(
      new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
    );
    for (const col of collections) {
      try {
        await db.collection(col).doc(cleanId).set(
          {
            likes: currentLikes,
            likeCount: currentLikes,
            likedBy,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn(`Firestore article like update [${col}] notice:`, fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      id: cleanId,
      likes: currentLikes,
      likeCount: currentLikes,
      likedBy,
      isLiked,
      action: isLiked ? "liked" : "unliked",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/cricket-articles/[id]/like error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  return POST(req, context);
}
