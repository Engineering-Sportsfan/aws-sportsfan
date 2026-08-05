// app/api/matchesplaylist/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import cloudinary from "@/lib/cloudinary";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface DropItem {
  title: string;
  duration: string;
  description: string;
  mediaUrl: string;
  thumbnail: string;
  listens: number;
  signals: number;
  engagement: number;
}

interface PlaylistData {
  id?: string;
  matchesPlaylistId: string;
  audioDrops: DropItem[];
  videoDrops: DropItem[];
  createdAt?: number;
  updatedAt?: number;
}

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ─── GET: Single Playlist by ID ─────────────────────────────────────────────
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
            entityId: `MATCH_PLAYLIST#${id}`,
            sk: "PLAYLIST#META",
          },
        })
      );
      if (getRes.Item) {
        const item = getRes.Item;
        return NextResponse.json({
          success: true,
          playlist: {
            id: item.id || id,
            ...item,
          },
        });
      }
    } catch (e) {
      console.warn("[matchesplaylist [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore (both collections: matchPlaylists and matchesPlaylistId)
    if (db) {
      let doc = await db.collection("matchPlaylists").doc(id).get();
      if (!doc.exists) {
        doc = await db.collection("matchesPlaylistId").doc(id).get();
      }

      if (doc.exists) {
        return NextResponse.json({
          success: true,
          playlist: {
            id: doc.id,
            ...doc.data(),
          },
        });
      }
    }

    return NextResponse.json(
      { success: false, message: "Playlist not found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Error fetching playlist:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch playlist" },
      { status: 500 }
    );
  }
}

// ─── PUT: Update Playlist ───────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let existingData: Record<string, unknown> = {};

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `MATCH_PLAYLIST#${id}`,
            sk: "PLAYLIST#META",
          },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[matchesplaylist [id] PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      let doc = await db.collection("matchPlaylists").doc(id).get();
      if (!doc.exists) {
        doc = await db.collection("matchesPlaylistId").doc(id).get();
      }
      if (doc.exists) {
        existingData = doc.data() as Record<string, unknown>;
      }
    }

    const contentType = req.headers.get("content-type") || "";
    const isFormData = contentType.includes("multipart/form-data");

    let audioDrops: DropItem[] = (existingData.audioDrops as DropItem[]) || [];
    let videoDrops: DropItem[] = (existingData.videoDrops as DropItem[]) || [];
    let matchesPlaylistId: string = (existingData.matchesPlaylistId as string) || "";

    if (isFormData) {
      const formData = await req.formData();

      const newMatchesPlaylistId = formData.get("matchesPlaylistId") as string;
      if (newMatchesPlaylistId) {
        matchesPlaylistId = newMatchesPlaylistId;
      }

      const existingAudioDropsStr = formData.get("existingAudioDrops") as string;
      const existingVideoDropsStr = formData.get("existingVideoDrops") as string;

      if (existingAudioDropsStr) {
        audioDrops = JSON.parse(existingAudioDropsStr) as DropItem[];
      }
      if (existingVideoDropsStr) {
        videoDrops = JSON.parse(existingVideoDropsStr) as DropItem[];
      }

      const deleteAudioIndices = formData.getAll("deleteAudioIndices") as string[];
      const deleteVideoIndices = formData.getAll("deleteVideoIndices") as string[];

      if (deleteAudioIndices.length > 0) {
        audioDrops = audioDrops.filter((_: DropItem, index: number) =>
          !deleteAudioIndices.includes(index.toString())
        );
      }
      if (deleteVideoIndices.length > 0) {
        videoDrops = videoDrops.filter((_: DropItem, index: number) =>
          !deleteVideoIndices.includes(index.toString())
        );
      }

      const audioFiles = formData.getAll("audioFiles") as File[];
      const audioTitles = formData.getAll("audioTitles") as string[];
      const audioDescriptions = formData.getAll("audioDescriptions") as string[];
      const audioListens = formData.getAll("audioListens") as string[];
      const audioSignals = formData.getAll("audioSignals") as string[];
      const audioEngagement = formData.getAll("audioEngagement") as string[];
      const audioThumbnails = formData.getAll("audioThumbnails") as File[];

      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        if (!file || file.size === 0) continue;

        const title = audioTitles[i] || `Audio ${audioDrops.length + 1}`;
        const description = audioDescriptions[i] || "";
        const listens = Number(audioListens[i]) || 0;
        const signals = Number(audioSignals[i]) || 0;
        const engagement = Number(audioEngagement[i]) || 0;

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `matches/playlists/${matchesPlaylistId}/audio`,
          resource_type: "video",
          public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
        });

        let thumbnailUrl = "";
        if (audioThumbnails[i]) {
          const thumbBytes = await audioThumbnails[i].arrayBuffer();
          const thumbBuffer = Buffer.from(thumbBytes);
          const thumbBase64 = `data:${audioThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;

          const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
            folder: `matches/playlists/${matchesPlaylistId}/audio/thumbnails`,
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

      const videoFiles = formData.getAll("videoFiles") as File[];
      const videoTitles = formData.getAll("videoTitles") as string[];
      const videoDescriptions = formData.getAll("videoDescriptions") as string[];
      const videoListens = formData.getAll("videoListens") as string[];
      const videoSignals = formData.getAll("videoSignals") as string[];
      const videoEngagement = formData.getAll("videoEngagement") as string[];
      const videoThumbnails = formData.getAll("videoThumbnails") as File[];

      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i];
        if (!file || file.size === 0) continue;

        const title = videoTitles[i] || `Video ${videoDrops.length + 1}`;
        const description = videoDescriptions[i] || "";
        const listens = Number(videoListens[i]) || 0;
        const signals = Number(videoSignals[i]) || 0;
        const engagement = Number(videoEngagement[i]) || 0;

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: `matches/playlists/${matchesPlaylistId}/video`,
          resource_type: "video",
          public_id: `${Date.now()}-${file.name.replace(/\s/g, "_")}`,
        });

        let thumbnailUrl = "";
        if (videoThumbnails[i]) {
          const thumbBytes = await videoThumbnails[i].arrayBuffer();
          const thumbBuffer = Buffer.from(thumbBytes);
          const thumbBase64 = `data:${videoThumbnails[i].type};base64,${thumbBuffer.toString("base64")}`;

          const thumbUpload = await cloudinary.uploader.upload(thumbBase64, {
            folder: `matches/playlists/${matchesPlaylistId}/video/thumbnails`,
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
    } else {
      const body = await req.json();
      if (body.matchesPlaylistId !== undefined) matchesPlaylistId = body.matchesPlaylistId;
      if (body.audioDrops !== undefined) audioDrops = body.audioDrops;
      if (body.videoDrops !== undefined) videoDrops = body.videoDrops;
    }

    const updatedData = {
      ...existingData,
      id,
      matchesPlaylistId,
      audioDrops,
      videoDrops,
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      entityId: `MATCH_PLAYLIST#${id}`,
      sk: `PLAYLIST#${matchesPlaylistId || "META"}`,
      ...updatedData,
    };

    await dualWrite("matchPlaylists", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      playlist: { ...updatedData, id },
    });
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await dualDelete("matchPlaylists", id, "SportsData", {
      entityId: `MATCH_PLAYLIST#${id}`,
      sk: "PLAYLIST#META",
    });

    return NextResponse.json({
      success: true,
      message: "Playlist deleted",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Delete failed" },
      { status: 500 }
    );
  }
}