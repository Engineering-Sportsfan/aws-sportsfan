// // app/api/cricket-articles/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import { dualWrite } from "@/lib/dualWrite";
// import { ScanCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

// // ─── POST: Create a new article ───────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const {
//       badge,
//       title,
//       description,
//       readTime,
//       author,
//       views,
//       image,
//       tags,
//     } = body;

//     const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
//     if (!title || !image) {
//       return NextResponse.json({ error: "title and image are required" }, { status: 400 });
//     }
//     if (badge && !validBadges.includes(badge)) {
//       return NextResponse.json(
//         { error: "Invalid badge type. Must be FEATURE, ANALYSIS, OPINION, or NEWS" },
//         { status: 400 }
//       );
//     }

//     const now = Date.now();
//     const articleId = `art_${now}_${Math.random().toString(36).substring(2, 9)}`;

//     const newArticle = {
//       articleId,
//       badge: badge || "NEWS",
//       title,
//       description,
//       author: author || "SportsFan Staff",
//       readTime: readTime || "5 min read",
//       views: views || "0 views",
//       image,
//       tags: Array.isArray(tags) ? tags : [],
//       createdAt: now,
//       updatedAt: now,
//     };

//     // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
//     const dynamoItem = {
//       contentId: `ARTICLE#${articleId}`,
//       sk: `ARTICLE#${now}`,
//       ...newArticle,
//     };

//     await dualWrite("cricketArticles", articleId, "SocialAndContent", dynamoItem);

//     return NextResponse.json(
//       {
//         success: true,
//         id: articleId,
//         article: { id: articleId, ...newArticle },
//       },
//       { status: 201 }
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("Error creating article:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── GET: List cricket articles ───────────────────────────────────────────────
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
//     const badge = searchParams.get("badge");

//     let articles: Array<Record<string, unknown>> = [];

//     // 1. Scan DynamoDB SocialAndContent table
//     try {
//       let filterExpression = "(begins_with(contentId, :aPrefix) OR begins_with(contentId, :nPrefix))";
//       const expressionAttributeValues: Record<string, unknown> = {
//         ":aPrefix": "ARTICLE#",
//         ":nPrefix": "NEWS#",
//       };

//       if (badge && ["FEATURE", "ANALYSIS", "OPINION", "NEWS"].includes(badge)) {
//         filterExpression += " AND badge = :bd";
//         expressionAttributeValues[":bd"] = badge;
//       }

//       const scanRes = await docClient.send(
//         new ScanCommand({
//           TableName: "SocialAndContent",
//           FilterExpression: filterExpression,
//           ExpressionAttributeValues: expressionAttributeValues,
//           Limit: limit,
//         })
//       );

//       if (scanRes.Items && scanRes.Items.length > 0) {
//         articles = scanRes.Items.map((item) => ({
//           id: (item.contentId as string)?.replace(/^(ARTICLE|NEWS)#/, "") || item.articleId || item.id,
//           ...item,
//         }));
//       }
//     } catch (dynErr) {
//       console.warn("DynamoDB articles scan notice:", dynErr);
//     }

//     // 2. Fallback to Firebase
//     if (articles.length === 0) {
//       try {
//         let query = db.collection("cricketArticles").orderBy("createdAt", "desc");
//         if (badge && ["FEATURE", "ANALYSIS", "OPINION", "NEWS"].includes(badge)) {
//           query = query.where("badge", "==", badge);
//         }

//         const snapshot = await query.limit(limit).get();
//         articles = snapshot.docs.map((doc) => ({
//           id: doc.id,
//           ...doc.data(),
//         }));
//       } catch (fbErr) {
//         console.warn("Firebase articles fallback notice:", fbErr);
//       }
//     }

//     return NextResponse.json({
//       success: true,
//       articles,
//       pagination: {
//         limit,
//         hasMore: articles.length === limit,
//         nextCursor: null,
//       },
//     }, { headers: { "Cache-Control": "no-store" } });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("Error fetching articles:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// app/api/cricket-articles/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

// Cloudinary Dynamic Folders — videos live under IndvsSl (same folder the
// cricket media browser reads from), images live under Images.
const VIDEO_FOLDER = "IndvsSl";
const IMAGE_FOLDER = "Images";

// ─── Cloudinary upload helper ─────────────────────────────────────────────────
async function uploadMediaFile(file: File): Promise<string> {
  const isVideo = file.type.startsWith("video/");
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

  const uploadResult = await cloudinary.uploader.upload(base64, {
    resource_type: isVideo ? "video" : "image",
    asset_folder: isVideo ? VIDEO_FOLDER : IMAGE_FOLDER,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });

  if (isVideo) {
    // Force a browser-playable mp4 delivery URL for video.
    return cloudinary.url(uploadResult.public_id, {
      resource_type: "video",
      format: "mp4",
      transformation: [{ quality: "auto" }],
    });
  }

  return uploadResult.secure_url;
}

// ─── POST: Create a new article ───────────────────────────────────────────────
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
      // File comes straight from the client — upload it to Cloudinary here.
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
        imageUrl = await uploadMediaFile(file);
      } else if (existingImage) {
        imageUrl = existingImage;
      }
    } else {
      // Backwards-compatible JSON path (image already a URL).
      const body = await req.json();
      ({ badge, title, description, readTime, author, views, tags = [] } = body);
      imageUrl = body.image;
    }

    const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
    if (!title || !imageUrl) {
      return NextResponse.json({ error: "title and image/video are required" }, { status: 400 });
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
      title,
      description,
      author: author || "SportsFan Staff",
      readTime: readTime || "5 min read",
      views: views || "0 views",
      image: imageUrl,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: now,
      updatedAt: now,
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      contentId: `ARTICLE#${articleId}`,
      sk: `ARTICLE#${now}`,
      ...newArticle,
    };

    await dualWrite("cricketArticles", articleId, "SocialAndContent", dynamoItem);

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
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const badge = searchParams.get("badge");

    let articles: Array<Record<string, unknown>> = [];

    // 1. Scan DynamoDB SocialAndContent table
    try {
      let filterExpression = "(begins_with(contentId, :aPrefix) OR begins_with(contentId, :nPrefix))";
      const expressionAttributeValues: Record<string, unknown> = {
        ":aPrefix": "ARTICLE#",
        ":nPrefix": "NEWS#",
      };

      if (badge && ["FEATURE", "ANALYSIS", "OPINION", "NEWS"].includes(badge)) {
        filterExpression += " AND badge = :bd";
        expressionAttributeValues[":bd"] = badge;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: filterExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: limit,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        articles = scanRes.Items.map((item) => ({
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
        let query = db.collection("cricketArticles").orderBy("createdAt", "desc");
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

    return NextResponse.json({
      success: true,
      articles,
      pagination: {
        limit,
        hasMore: articles.length === limit,
        nextCursor: null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching articles:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}