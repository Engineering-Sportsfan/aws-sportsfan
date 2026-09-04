// app/api/cricket-articles/[id]/view/route.ts — View Count Increment API
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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
  if (idIdx !== -1 && parts[idIdx + 1] && !["view", "views"].includes(parts[idIdx + 1])) {
    return decodeURIComponent(parts[idIdx + 1]);
  }
  const lastPart = parts[parts.length - 1];
  return decodeURIComponent(lastPart === "view" || lastPart === "views" ? parts[parts.length - 2] || "" : lastPart || "");
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

    // 1. Fetch current view count
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
          break;
        }
      } catch (dynErr) {
        console.warn(`DynamoDB view lookup [${cand}] notice:`, dynErr);
      }
    }

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
    let currentViews = typeof articleItem?.viewCount === "number" ? articleItem.viewCount : 0;
    if (!currentViews && articleItem?.views) {
      const parsed = parseInt(String(articleItem.views).replace(/[^\d]/g, ""), 10);
      if (!isNaN(parsed)) currentViews = parsed;
    }
    const newViewCount = currentViews + 1;
    const formattedViews = `${newViewCount} views`;

    // 2. Update DynamoDB
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
                UpdateExpression: "SET viewCount = :vc, views = :v, updatedAt = :u",
                ExpressionAttributeValues: {
                  ":vc": newViewCount,
                  ":v": formattedViews,
                  ":u": now,
                },
              })
            );
          }
        }
      } catch (dynErr) {
        console.warn(`DynamoDB view update [${cand}] notice:`, dynErr);
      }
    }

    // 3. Update Firestore
    const collections = Array.from(
      new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
    );
    for (const col of collections) {
      try {
        await db.collection(col).doc(cleanId).set(
          {
            viewCount: newViewCount,
            views: formattedViews,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn(`Firestore view update [${col}] notice:`, fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      id: cleanId,
      viewCount: newViewCount,
      views: formattedViews,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/cricket-articles/[id]/view error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  return POST(req, context);
}
