// app/api/cricket-articles/route.ts — AWS DynamoDB (SocialAndContent Table) & Firebase Dual-Write
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

const VIDEO_FOLDER = "IndvsSl";
const IMAGE_FOLDER = "Images";

function slugifyTitle(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "article"
  );
}

// ─── Cloudinary upload helper ─────────────────────────────────────────────────
async function uploadMediaFile(file: File, articleTitle?: string): Promise<string> {
  const isVideo = file.type.startsWith("video/");
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

  if (isVideo) {
    const baseName = articleTitle ? slugifyTitle(articleTitle) : "article";
    const uploadResult = await cloudinary.uploader.upload(base64, {
      resource_type: "video",
      asset_folder: VIDEO_FOLDER,
      public_id: `${baseName}_${Date.now()}`,
      display_name: articleTitle || baseName,
      overwrite: false,
    });

    return cloudinary.url(uploadResult.public_id, {
      resource_type: "video",
      format: "mp4",
      transformation: [{ quality: "auto" }],
    });
  }

  const uploadResult = await cloudinary.uploader.upload(base64, {
    resource_type: "image",
    asset_folder: IMAGE_FOLDER,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });

  return uploadResult.secure_url;
}

// ─── POST: Create a new article (Media is completely optional) ────────────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let badge: string | undefined;
    let title: string | undefined;
    let description: string[] | undefined;
    let readTime: string | undefined;
    let author: string | undefined;
    let views: string | undefined;
    let tags: string[] = [];
    let imageUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      badge = (formData.get("badge") as string) || undefined;
      title = (formData.get("title") as string) || undefined;
      readTime = (formData.get("readTime") as string) || undefined;
      author = (formData.get("author") as string) || undefined;
      views = (formData.get("views") as string) || undefined;

      const descriptionRaw = formData.get("description") as string | null;
      if (descriptionRaw) {
        try {
          description = JSON.parse(descriptionRaw);
        } catch {
          description = [descriptionRaw];
        }
      }

      const tagsRaw = formData.get("tags") as string | null;
      if (tagsRaw) {
        try {
          tags = JSON.parse(tagsRaw);
        } catch {
          tags = [];
        }
      }

      const file = formData.get("file") as File | null;
      const existingImage = formData.get("existingImage") as string | null;

      if (file && file.size > 0) {
        imageUrl = await uploadMediaFile(file, title);
      } else if (existingImage) {
        imageUrl = existingImage;
      }
    } else {
      const body = await req.json();
      ({ badge, title, description, readTime, author, views, tags = [] } = body);
      imageUrl = body.image;
    }

    const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (badge && !validBadges.includes(badge as BadgeType)) {
      return NextResponse.json(
        { error: "Invalid badge type. Must be FEATURE, ANALYSIS, OPINION, or NEWS" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const articleId = `art_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newArticle = {
      articleId,
      badge: (badge as BadgeType) || "NEWS",
      title: title.trim(),
      description: Array.isArray(description) ? description : [description || ""],
      author: (author && author.trim()) || "SportsFan Staff",
      readTime: (readTime && readTime.trim()) || "5 min read",
      views: (views && views.trim()) || "0 views",
      image: imageUrl || "", // Media is optional — defaults to empty string if not provided
      tags: Array.isArray(tags) ? tags : [],
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      contentId: `ARTICLE#${articleId}`,
      sk: `ARTICLE#${now}`,
      ...newArticle,
    };

    await dualWrite("cricketArticles", articleId, TABLES.SocialAndContent, dynamoItem);

    return NextResponse.json(
      {
        success: true,
        id: articleId,
        article: { id: articleId, ...newArticle },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET: List cricket articles ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const badge = searchParams.get("badge");

    let articles: Array<Record<string, unknown>> = [];

    // 1. Scan DynamoDB SocialAndContent table
    try {
      // let filterExpression = "(begins_with(contentId, :aPrefix) OR begins_with(contentId, :nPrefix))";
      // const expressionAttributeValues: Record<string, unknown> = {
      //   ":aPrefix": "ARTICLE#",
      //   ":nPrefix": "NEWS#",
      // };
      let filterExpression =
  "(begins_with(contentId, :aPrefix) OR begins_with(contentId, :nPrefix)) " +
  "AND (begins_with(sk, :askPrefix) OR begins_with(sk, :nskPrefix))";
const expressionAttributeValues: Record<string, unknown> = {
  ":aPrefix": "ARTICLE#",
  ":nPrefix": "NEWS#",
  ":askPrefix": "ARTICLE#",
  ":nskPrefix": "NEWS#",
};

      if (badge && ["FEATURE", "ANALYSIS", "OPINION", "NEWS"].includes(badge)) {
        filterExpression += " AND badge = :bd";
        expressionAttributeValues[":bd"] = badge;
      }

      let items: Record<string, unknown>[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;
      let pageCount = 0;
      const MAX_PAGES = 50;

      do {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );
        items = items.concat(scanRes.Items || []);
        lastEvaluatedKey = scanRes.LastEvaluatedKey as Record<string, unknown> | undefined;
        pageCount += 1;
      } while (lastEvaluatedKey && pageCount < MAX_PAGES);

      if (items.length > 0) {
        articles = items
          .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
          .slice(0, limit)
          .map((item) => ({
            id: (item.contentId as string)?.replace(/^(ARTICLE|NEWS)#/, "") || item.articleId || item.id,
            ...item,
          }));
      }
    } catch (dynErr) {
      console.warn("DynamoDB articles scan notice:", dynErr);
    }

    // 2. Fallback to Firebase
    if (articles.length === 0) {
      try {
        let query = db.collection(getFirestoreCollection("cricketArticles")).orderBy("createdAt", "desc");
        if (badge && ["FEATURE", "ANALYSIS", "OPINION", "NEWS"].includes(badge)) {
          query = query.where("badge", "==", badge);
        }

        const snapshot = await query.limit(limit).get();
        articles = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (fbErr) {
        console.warn("Firebase articles fallback notice:", fbErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        articles,
        pagination: {
          limit,
          hasMore: articles.length === limit,
          nextCursor: null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching articles:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete article(s) by ID or array of IDs ──────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let ids: string[] = [];

    const queryId = searchParams.get("id") || searchParams.get("articleId");
    if (queryId) {
      ids.push(queryId);
    }

    try {
      const body = await req.json();
      if (Array.isArray(body?.ids)) {
        ids.push(...body.ids);
      } else if (body?.id) {
        ids.push(body.id);
      } else if (body?.articleId) {
        ids.push(body.articleId);
      }
    } catch {}

    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return NextResponse.json({ error: "Article ID or IDs array is required" }, { status: 400 });
    }

    let totalDeletedFromDynamo = 0;

    const firebaseCollections = Array.from(
      new Set([
        getFirestoreCollection("cricketArticles"),
        "cricketArticles",
        "cricket_articles",
      ])
    );

    for (const id of uniqueIds) {
      const cleanId = id.replace(/^(ARTICLE|NEWS)#/, "").trim();
      const candidates = Array.from(
        new Set([
          `ARTICLE#${cleanId}`,
          `NEWS#${cleanId}`,
          cleanId,
          id,
          `ARTICLE#${id}`,
          `NEWS#${id}`,
        ])
      );

      let deletedForThisId = 0;

      // 1. Query candidate keys in DynamoDB
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
            for (const item of qRes.Items) {
              await docClient.send(
                new DeleteCommand({
                  TableName: TABLES.SocialAndContent,
                  Key: {
                    contentId: item.contentId as string,
                    sk: item.sk as string,
                  },
                })
              );
              deletedForThisId++;
              totalDeletedFromDynamo++;
              console.log(`[Cricket Articles] 🗑️ Deleted DynamoDB item -> contentId: [${item.contentId}], sk: [${item.sk}]`);
            }
          }
        } catch (dynErr: any) {
          console.warn(`DynamoDB article delete candidate [${cand}] notice:`, dynErr?.message || dynErr);
        }
      }

      // 2. Targeted Scan fallback if not found by query
      if (deletedForThisId === 0) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: TABLES.SocialAndContent,
              FilterExpression: "contentId = :c1 OR contentId = :c2 OR articleId = :id OR id = :id",
              ExpressionAttributeValues: {
                ":c1": `ARTICLE#${cleanId}`,
                ":c2": `NEWS#${cleanId}`,
                ":id": cleanId,
              },
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            for (const item of scanRes.Items) {
              await docClient.send(
                new DeleteCommand({
                  TableName: TABLES.SocialAndContent,
                  Key: {
                    contentId: item.contentId as string,
                    sk: item.sk as string,
                  },
                })
              );
              totalDeletedFromDynamo++;
              console.log(`[Cricket Articles] 🗑️ Deleted DynamoDB scanned item -> contentId: [${item.contentId}], sk: [${item.sk}]`);
            }
          }
        } catch (scanErr: any) {
          console.warn("DynamoDB article fallback scan delete notice:", scanErr?.message || scanErr);
        }
      }

      // 3. Delete from Firebase collections
      for (const col of firebaseCollections) {
        try {
          await db.collection(col).doc(cleanId).delete().catch(() => {});
          await db.collection(col).doc(id).delete().catch(() => {});
          if (id !== cleanId) {
            await db.collection(col).doc(`ARTICLE#${cleanId}`).delete().catch(() => {});
            await db.collection(col).doc(`NEWS#${cleanId}`).delete().catch(() => {});
          }
        } catch (fbErr: any) {
          console.warn(`Firebase article delete [${col}] notice:`, fbErr?.message || fbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${uniqueIds.length} article(s) deleted successfully`,
      deletedCount: totalDeletedFromDynamo,
      deletedIds: uniqueIds,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting article(s):", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}