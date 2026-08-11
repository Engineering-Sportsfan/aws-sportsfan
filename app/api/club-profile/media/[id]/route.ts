// app/api/club-profile/media/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

type MediaItem = {
  title: string;
  views: string;
  time: string;
  thumbnail: string;
};

// ─── GET: Single Media Doc ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `CLUB_MEDIA#${id}`,
            sk: "MEDIA#META",
          },
        })
      );
      if (getRes.Item) {
        const item = getRes.Item;
        return NextResponse.json({
          success: true,
          media: {
            id: item.id || id,
            ...item,
          },
        });
      }
    } catch (e) {
      console.warn("[club-profile media [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const doc = await db.collection("clubMedia").doc(id).get();
      if (doc.exists) {
        return NextResponse.json({
          success: true,
          media: { id: doc.id, ...doc.data() },
        });
      }
    }

    return NextResponse.json(
      { success: false, message: "Media not found" },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Fetch failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── PUT: Update Media Doc 
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const formData = await req.formData();

    let existingData: Record<string, unknown> = {};

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `CLUB_MEDIA#${id}`,
            sk: "MEDIA#META",
          },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[club-profile media [id] PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      const existing = await db.collection("clubMedia").doc(id).get();
      if (existing.exists) {
        existingData = existing.data() as Record<string, unknown>;
      }
    }

    const titles = formData.getAll("titles") as string[];
    const viewsCounts = formData.getAll("views") as string[];
    const times = formData.getAll("times") as string[];
    const thumbnailFiles = formData.getAll("thumbnails") as File[];
    const existingThumbnails = formData.getAll("existingThumbnails") as string[];

    const mediaItems: MediaItem[] = [];

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i] || `Media ${i + 1}`;
      const views = viewsCounts[i] || "0";
      const time = times[i] || "";

      let thumbnailUrl = existingThumbnails[i] || "";

      if (thumbnailFiles[i] && thumbnailFiles[i].size > 0) {
        const bytes = await thumbnailFiles[i].arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${thumbnailFiles[i].type};base64,${buffer.toString("base64")}`;
        const clubProfId = (existingData.clubProfileId as string) || "general";
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `club-profiles/${clubProfId}/media/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${thumbnailFiles[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = uploadRes.secure_url;
      }

      mediaItems.push({ title, views, time, thumbnail: thumbnailUrl });
    }

    const updateData = {
      ...existingData,
      id,
      mediaItems,
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      entityId: `CLUB_MEDIA#${id}`,
      sk: "MEDIA#META",
      ...updateData,
    };

    await dualWrite("clubMedia", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      media: { ...updateData, id },
    });
  } catch (error) {
    console.error("Update media error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove Media Doc ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await dualDelete("clubMedia", id, "SportsData", {
      entityId: `CLUB_MEDIA#${id}`,
      sk: "MEDIA#META",
    });

    return NextResponse.json({ success: true, message: "Media deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}