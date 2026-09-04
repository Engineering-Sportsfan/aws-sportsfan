// app/api/cricket-articles/[id]/route.ts — AWS DynamoDB (SocialAndContent Table) & Firebase
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
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
  const lastPart = parts[parts.length - 1];
  return decodeURIComponent(lastPart || "");
}

// ─── GET: Fetch single article by ID ──────────────────────────────────────────
export async function GET(
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
        `ARTICLE#${rawId}`,
        `NEWS#${rawId}`,
      ])
    );

    let article: Record<string, unknown> | null = null;

    // 1. Query DynamoDB SocialAndContent table
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
          article = qRes.Items[0];
          break;
        }
      } catch (dynErr) {
        console.warn(`DynamoDB article fetch candidate [${cand}] notice:`, dynErr);
      }
    }

    // 2. Fallback to Firebase
    if (!article) {
      const collections = Array.from(
        new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
      );

      for (const col of collections) {
        try {
          const docRef = db.collection(col).doc(cleanId);
          const doc = await docRef.get();
          if (doc.exists) {
            article = { id: doc.id, ...doc.data() };
            break;
          }
          const rawDocRef = db.collection(col).doc(rawId);
          const rawDoc = await rawDocRef.get();
          if (rawDoc.exists) {
            article = { id: rawDoc.id, ...rawDoc.data() };
            break;
          }
        } catch (fbErr) {
          console.warn(`Firebase article fetch [${col}] notice:`, fbErr);
        }
      }
    }

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        article: {
          id:
            (article.contentId as string)?.replace(/^(ARTICLE|NEWS)#/, "") ||
            article.articleId ||
            article.id ||
            cleanId,
          ...article,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT: Update article by ID (Media is optional) ────────────────────────────
export async function PUT(
  req: NextRequest,
  context?: { params?: { id?: string } | Promise<{ id?: string }> }
) {
  try {
    const rawId = await extractId(req, context);

    if (!rawId) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }

    const contentType = req.headers.get("content-type") || "";
    let badge: string | undefined;
    let title: string | undefined;
    let description: string[] | undefined;
    let readTime: string | undefined;
    let author: string | undefined;
    let views: string | undefined;
    let tags: string[] | undefined;
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
      const imageParam = formData.get("image") as string | null;

      if (file && file.size > 0) {
        imageUrl = await uploadMediaFile(file, title);
      } else if (existingImage !== null && existingImage !== undefined) {
        imageUrl = existingImage;
      } else if (imageParam !== null && imageParam !== undefined) {
        imageUrl = imageParam;
      }
    } else {
      const body = await req.json();
      ({ badge, title, description, readTime, author, views, tags } = body);
      imageUrl = body.image;
    }

    const cleanId = rawId.replace(/^(ARTICLE|NEWS)#/, "").trim();
    const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
    if (badge && !validBadges.includes(badge as BadgeType)) {
      return NextResponse.json({ error: "Invalid badge type" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (badge !== undefined) updates.badge = badge;
    if (title !== undefined) updates.title = title.trim();
    if (author !== undefined) updates.author = author.trim();
    if (description !== undefined) updates.description = description;
    if (readTime !== undefined) updates.readTime = readTime.trim();
    if (views !== undefined) updates.views = views.trim();
    if (tags !== undefined) updates.tags = tags;
    if (imageUrl !== undefined) updates.image = imageUrl; // Allows setting "" if cleared

    const candidates = Array.from(
      new Set([
        `ARTICLE#${cleanId}`,
        `NEWS#${cleanId}`,
        cleanId,
        rawId,
      ])
    );

    // 1. Update in DynamoDB
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
            const updateExprParts: string[] = ["updatedAt = :u"];
            const exprVals: Record<string, unknown> = { ":u": updates.updatedAt };

            if (updates.title !== undefined) {
              updateExprParts.push("title = :t");
              exprVals[":t"] = updates.title;
            }
            if (updates.badge !== undefined) {
              updateExprParts.push("badge = :b");
              exprVals[":b"] = updates.badge;
            }
            if (updates.author !== undefined) {
              updateExprParts.push("author = :a");
              exprVals[":a"] = updates.author;
            }
            if (updates.description !== undefined) {
              updateExprParts.push("description = :d");
              exprVals[":d"] = updates.description;
            }
            if (updates.readTime !== undefined) {
              updateExprParts.push("readTime = :rt");
              exprVals[":rt"] = updates.readTime;
            }
            if (updates.views !== undefined) {
              updateExprParts.push("views = :v");
              exprVals[":v"] = updates.views;
            }
            if (updates.image !== undefined) {
              updateExprParts.push("image = :img");
              exprVals[":img"] = updates.image;
            }
            if (updates.tags !== undefined) {
              updateExprParts.push("tags = :tags");
              exprVals[":tags"] = updates.tags;
            }

            await docClient.send(
              new UpdateCommand({
                TableName: TABLES.SocialAndContent,
                Key: {
                  contentId: item.contentId as string,
                  sk: item.sk as string,
                },
                UpdateExpression: `SET ${updateExprParts.join(", ")}`,
                ExpressionAttributeValues: exprVals,
              })
            );
          }
        }
      } catch (dynErr) {
        console.warn(`DynamoDB article update candidate [${cand}] notice:`, dynErr);
      }
    }

    // 2. Update in Firebase
    const collections = Array.from(
      new Set([getFirestoreCollection("cricketArticles"), "cricketArticles"])
    );

    for (const col of collections) {
      try {
        await db.collection(col).doc(cleanId).set(updates, { merge: true });
        if (rawId !== cleanId) {
          await db.collection(col).doc(rawId).set(updates, { merge: true });
        }
      } catch (fbErr) {
        console.warn(`Firebase article update [${col}] notice:`, fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Article updated successfully",
      updates,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete article by ID ─────────────────────────────────────────────
export async function DELETE(
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
        `ARTICLE#${rawId}`,
        `NEWS#${rawId}`,
      ])
    );

    let deletedFromDynamoCount = 0;

    // 1. Delete all matching candidate items from DynamoDB SocialAndContent table
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
            deletedFromDynamoCount++;
            console.log(`[Cricket Articles] 🗑️ Deleted DynamoDB item -> contentId: [${item.contentId}], sk: [${item.sk}]`);
          }
        }
      } catch (dynErr: any) {
        console.warn(`DynamoDB article delete candidate [${cand}] notice:`, dynErr?.message || dynErr);
      }
    }

    // 2. Targeted Scan fallback if not found via Query
    if (deletedFromDynamoCount === 0) {
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
            deletedFromDynamoCount++;
            console.log(`[Cricket Articles] 🗑️ Deleted DynamoDB scanned item -> contentId: [${item.contentId}], sk: [${item.sk}]`);
          }
        }
      } catch (scanErr: any) {
        console.warn("DynamoDB article fallback scan delete notice:", scanErr?.message || scanErr);
      }
    }

    // 3. Delete from Firebase across collections
    const firebaseCollections = Array.from(
      new Set([
        getFirestoreCollection("cricketArticles"),
        "cricketArticles",
        "cricket_articles",
      ])
    );

    for (const col of firebaseCollections) {
      try {
        await db.collection(col).doc(cleanId).delete().catch(() => {});
        await db.collection(col).doc(rawId).delete().catch(() => {});
        if (rawId !== cleanId) {
          await db.collection(col).doc(`ARTICLE#${cleanId}`).delete().catch(() => {});
          await db.collection(col).doc(`NEWS#${cleanId}`).delete().catch(() => {});
        }
      } catch (fbErr: any) {
        console.warn(`Firebase article delete [${col}] notice:`, fbErr?.message || fbErr);
      }
    }

    console.log(`[Cricket Articles] ⚡ Article [${rawId}] completely deleted from DynamoDB & Firebase`);

    return NextResponse.json({
      success: true,
      message: `Article ${rawId} deleted successfully`,
      deletedCount: deletedFromDynamoCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
