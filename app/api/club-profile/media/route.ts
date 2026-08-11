// app/api/club-profile/media/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── POST: Create Media Item(s) 
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const clubProfileId = formData.get("clubProfileId") as string;

    const titles = formData.getAll("titles") as string[];
    const viewsCounts = formData.getAll("views") as string[];
    const times = formData.getAll("times") as string[];
    const thumbnailFiles = formData.getAll("thumbnails") as File[];

    if (!clubProfileId) {
      return NextResponse.json(
        { success: false, message: "clubProfileId is required" },
        { status: 400 }
      );
    }

    if (titles.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one media item is required" },
        { status: 400 }
      );
    }

    const mediaItems = [];

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i] || `Media ${i + 1}`;
      const views = viewsCounts[i] || "0";
      const time = times[i] || "";

      let thumbnailUrl = "";
      if (thumbnailFiles[i] && thumbnailFiles[i].size > 0) {
        const bytes = await thumbnailFiles[i].arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${thumbnailFiles[i].type};base64,${buffer.toString("base64")}`;
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `club-profiles/${clubProfileId}/media/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${thumbnailFiles[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = uploadRes.secure_url;
      }

      mediaItems.push({
        title,
        views,
        time,
        thumbnail: thumbnailUrl,
      });
    }

    const now = Date.now();
    const id = `club_media_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const mediaData = {
      id,
      clubProfileId,
      mediaItems,
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      entityId: `CLUB_MEDIA#${id}`,
      sk: "MEDIA#META",
      ...mediaData,
    };

    await dualWrite("clubMedia", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      media: mediaData,
    });
  } catch (error) {
    console.error("Create media error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── GET: List Media Items
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clubProfileId = searchParams.get("clubProfileId");
    const limit = parseInt(searchParams.get("limit") || "12");

    let mediaDocs: any[] = [];

    // 1. Scan DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "CLUB_MEDIA#",
      };

      if (clubProfileId) {
        filterExpr += " AND clubProfileId = :cpId";
        exprVals[":cpId"] = clubProfileId;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        mediaDocs = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^CLUB_MEDIA#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[club-profile media GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (mediaDocs.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("clubMedia");

      if (clubProfileId) {
        query = query.where("clubProfileId", "==", clubProfileId);
      }

      query = query.orderBy("createdAt", "desc").limit(limit);
      const snapshot = await query.get();

      mediaDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    mediaDocs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = mediaDocs.slice(0, limit);
    const lastDoc = paged[paged.length - 1];

    return NextResponse.json({
      success: true,
      mediaDocs: paged,
      pagination: {
        limit,
        hasMore: mediaDocs.length === limit,
        nextCursor: mediaDocs.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch media error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}