// app/api/team360-playlist/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const team360PostId = formData.get("team360PostId") as string;

    const audioFiles = formData.getAll("audioFiles") as File[];
    const audioTitles = formData.getAll("audioTitles") as string[];
    const audioDescriptions = formData.getAll("audioDescriptions") as string[];
    const audioListens = formData.getAll("audioListens") as string[];
    const audioSignals = formData.getAll("audioSignals") as string[];
    const audioEngagement = formData.getAll("audioEngagement") as string[];

    const videoFiles = formData.getAll("videoFiles") as File[];
    const videoTitles = formData.getAll("videoTitles") as string[];
    const videoDescriptions = formData.getAll("videoDescriptions") as string[];
    const videoListens = formData.getAll("videoListens") as string[];
    const videoSignals = formData.getAll("videoSignals") as string[];
    const videoEngagement = formData.getAll("videoEngagement") as string[];

    const audioThumbnails = formData.getAll("audioThumbnails") as File[];
    const videoThumbnails = formData.getAll("videoThumbnails") as File[];

    if (!team360PostId) {
      return NextResponse.json(
        { success: false, message: "team360PostId is required" },
        { status: 400 }
      );
    }

    const audioDrops = [];
    const videoDrops = [];

    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      }
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    };

    // Process audio files
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      if (!file || file.size === 0) continue;
      const title = audioTitles[i] || `Audio ${i + 1}`;
      const description = audioDescriptions[i] || "";
      const listens = Number(audioListens[i]) || 0;
      const signals = Number(audioSignals[i]) || 0;
      const engagement = Number(audioEngagement[i]) || 0;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: `team360/playlists/${team360PostId}/audio`,
        resource_type: "video",
        public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
      });

      let thumbnailUrl = "";
      if (audioThumbnails[i]) {
        const thumbBytes = await audioThumbnails[i].arrayBuffer();
        const thumbBuffer = Buffer.from(thumbBytes);
        const thumbBase64 = `data:${audioThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;

        const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
          folder: `team360/playlists/${team360PostId}/audio/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${audioThumbnails[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = thumbUpload.secure_url;
      }

      const duration = uploadRes.duration || 0;

      audioDrops.push({
        title,
        duration: formatDuration(duration),
        description,
        mediaUrl: uploadRes.secure_url,
        thumbnail: thumbnailUrl,
        listens,
        signals,
        engagement,
      });
    }

    // Process video files
    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      if (!file || file.size === 0) continue;
      const title = videoTitles[i] || `Video ${i + 1}`;
      const description = videoDescriptions[i] || "";
      const listens = Number(videoListens[i]) || 0;
      const signals = Number(videoSignals[i]) || 0;
      const engagement = Number(videoEngagement[i]) || 0;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: `team360/playlists/${team360PostId}/video`,
        resource_type: "video",
        public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
      });

      let thumbnailUrl = "";
      if (videoThumbnails[i]) {
        const thumbBytes = await videoThumbnails[i].arrayBuffer();
        const thumbBuffer = Buffer.from(thumbBytes);
        const thumbBase64 = `data:${videoThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;

        const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
          folder: `team360/playlists/${team360PostId}/video/thumbnails`,
          public_id: `${Date.now()}-thumbnail-${videoThumbnails[i].name.replace(/\s/g, "_")}`,
        });
        thumbnailUrl = thumbUpload.secure_url;
      }

      const duration = uploadRes.duration || 0;

      videoDrops.push({
        title,
        duration: formatDuration(duration),
        description,
        mediaUrl: uploadRes.secure_url,
        thumbnail: thumbnailUrl,
        listens,
        signals,
        engagement,
      });
    }

    const now = Date.now();
    const id = `team360_playlist_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const playlistData = {
      id,
      team360PostId,
      audioDrops,
      videoDrops,
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      entityId: `TEAM360_PLAYLIST#${id}`,
      sk: `PLAYLIST#${team360PostId}`,
      ...playlistData,
    };

    await dualWrite("team360Playlists", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      playlist: playlistData,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const team360PostId = searchParams.get("team360PostId");
    const limit = parseInt(searchParams.get("limit") || "50");

    let playlists: any[] = [];

    // 1. Scan DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "TEAM360_PLAYLIST#",
      };

      if (team360PostId) {
        filterExpr += " AND team360PostId = :tId";
        exprVals[":tId"] = team360PostId;
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
        playlists = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^TEAM360_PLAYLIST#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[team360-playlist GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (playlists.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("team360Playlists");

      if (team360PostId) {
        query = query.where("team360PostId", "==", team360PostId);
      }

      query = query.orderBy("createdAt", "desc").limit(limit);
      const snapshot = await query.get();

      playlists = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    playlists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = playlists.slice(0, limit);
    const lastDoc = paged[paged.length - 1];

    return NextResponse.json({
      success: true,
      playlists: paged,
      pagination: {
        limit,
        hasMore: playlists.length === limit,
        nextCursor: playlists.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}