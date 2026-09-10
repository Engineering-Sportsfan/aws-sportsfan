// app/api/flipLong/route.ts — FlipLONG Video Uploads in DynamoDB (RealTimeChat Table) & Firestore Dual-Write
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

const VIDEO_FOLDER = "IndvsSl";
const ROOM_ID = "FLIPLONG#VIDEOS";

function slugifyTitle(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "fliplong_video"
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface UploadedMediaResult {
  url: string;
  thumbnailUrl: string;
  duration: string;
  durationSeconds: number;
  format: string;
  publicId: string;
}

// ─── Cloudinary Video Upload Helper ──────────────────────────────────────────
async function uploadVideoFile(file: File, title?: string): Promise<UploadedMediaResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = `data:${file.type || "video/mp4"};base64,${buffer.toString("base64")}`;

  const baseName = title ? slugifyTitle(title) : "fliplong";
  const uploadResult = await cloudinary.uploader.upload(base64, {
    resource_type: "video",
    asset_folder: VIDEO_FOLDER,
    public_id: `${baseName}_${Date.now()}`,
    display_name: title || baseName,
    overwrite: false,
  });

  const durationSec = uploadResult.duration ? Math.round(uploadResult.duration) : 0;
  const durationStr = formatDuration(durationSec);

  const deliveryUrl = cloudinary.url(uploadResult.public_id, {
    resource_type: "video",
    format: "mp4",
    transformation: [{ quality: "auto" }],
  }) || uploadResult.secure_url;

  const thumbnailUrl = cloudinary.url(uploadResult.public_id, {
    resource_type: "video",
    format: "jpg",
    transformation: [{ width: 400, height: 300, crop: "fill" }],
  }) || "";

  return {
    url: deliveryUrl,
    thumbnailUrl,
    duration: durationStr,
    durationSeconds: durationSec,
    format: uploadResult.format || "mp4",
    publicId: uploadResult.public_id,
  };
}

// ─── POST: Upload & Save FlipLong Video ───────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let title: string | undefined;
    let description: string | string[] = "";
    let author: string | undefined;
    let userId: string | undefined;
    let email: string | undefined;
    let authorPhoto: string | undefined;
    let sport = "general";
    let isScheduled = false;
    let scheduledAt: number | undefined;
    let day: string | undefined;
    let time: string | undefined;
    let timeMs: number | undefined;
    let customDuration: string | undefined;

    let mediaResult: UploadedMediaResult | null = null;
    let existingUrl: string | undefined;
    let existingThumbnailUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      title = (formData.get("title") as string) || undefined;
      const descRaw = formData.get("description") as string | null;
      if (descRaw) {
        try {
          description = JSON.parse(descRaw);
        } catch {
          description = descRaw;
        }
      }

      author = (formData.get("author") as string) || undefined;
      userId = (formData.get("userId") as string) || undefined;
      email = (formData.get("email") as string) || undefined;
      authorPhoto = (formData.get("authorPhoto") as string) || undefined;
      sport = (formData.get("sport") as string) || "general";

      const isScheduledStr = formData.get("isScheduled") as string | null;
      isScheduled = isScheduledStr === "true";

      const scheduledAtStr =
        (formData.get("scheduledAt") as string | null) ||
        (formData.get("scheduledTimeMs") as string | null);
      scheduledAt = scheduledAtStr ? Number(scheduledAtStr) : undefined;

      day = (formData.get("day") as string) || undefined;
      time = (formData.get("time") as string) || undefined;
      const timeMsStr = formData.get("timeMs") as string | null;
      timeMs = isScheduled && scheduledAt ? scheduledAt : timeMsStr ? Number(timeMsStr) : Date.now();
      customDuration = (formData.get("duration") as string | null) || undefined;

      existingUrl = (formData.get("videoUrl") as string | null) || (formData.get("url") as string | null) || undefined;
      existingThumbnailUrl = (formData.get("thumbnailUrl") as string | null) || undefined;

      const file = (formData.get("file") as File | null) || (formData.get("video") as File | null);
      if (file && file.size > 0) {
        mediaResult = await uploadVideoFile(file, title);
      }
    } else {
      const body = await req.json();
      ({
        title,
        description = "",
        author,
        userId,
        email,
        authorPhoto,
        sport = "general",
        duration: customDuration,
      } = body);

      existingUrl = body.videoUrl || body.url || body.mediaUrl;
      existingThumbnailUrl = body.thumbnailUrl;
      isScheduled = body.isScheduled === true || body.isScheduled === "true";
      scheduledAt = body.scheduledAt
        ? Number(body.scheduledAt)
        : body.scheduledTimeMs
        ? Number(body.scheduledTimeMs)
        : undefined;
      day = body.day;
      time = body.time;
      timeMs = isScheduled && scheduledAt ? scheduledAt : body.timeMs ? Number(body.timeMs) : Date.now();
    }

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: "Title is required" }, { status: 400 });
    }

    const finalUrl = mediaResult?.url || existingUrl || "";
    const finalThumbnail = mediaResult?.thumbnailUrl || existingThumbnailUrl || "";
    const finalDuration = customDuration || mediaResult?.duration || "0:00";
    const finalDurationSeconds = mediaResult?.durationSeconds || 0;

    const now = Date.now();
    const id = `vid_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newVideo = {
      id,
      videoId: id,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : description,
      url: finalUrl,
      mediaUrl: finalUrl,
      videoUrl: finalUrl,
      thumbnailUrl: finalThumbnail,
      duration: finalDuration,
      durationSeconds: finalDurationSeconds,
      format: mediaResult?.format || "mp4",
      resourceType: "video",
      type: "VIDEO",
      badge: "VIDEO",
      sport: sport.toLowerCase(),
      author: (author && author.trim()) || "SportsFan",
      authorPhoto: authorPhoto || "",
      userId: userId || "",
      email: email || "",
      isScheduled,
      ...(scheduledAt ? { scheduledAt, scheduledTimeMs: scheduledAt } : {}),
      ...(day ? { day } : {}),
      ...(time ? { time } : {}),
      timeMs: timeMs || now,
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      roomId: ROOM_ID,
      sk: `VIDEO#${now}#${id}`,
      entityId: `FLIPLONG#${id}`,
      contentId: `VIDEO#${id}`,
      ...newVideo,
    };

    // 1. Primary write to RealTimeChat + dual-write to Firestore flipLongVideos
    await dualWrite("flipLongVideos", id, TABLES.RealTimeChat, dynamoItem);

    return NextResponse.json(
      {
        success: true,
        id,
        video: newVideo,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error uploading FlipLONG video";
    console.error("Error creating FlipLONG video:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── GET: List FlipLong Videos ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const includeScheduled = searchParams.get("includeScheduled") === "true";
    const scheduledOnly = searchParams.get("scheduledOnly") === "true";
    const userParam = (searchParams.get("userId") || searchParams.get("user") || "").trim().toLowerCase();
    const emailParam = (searchParams.get("email") || searchParams.get("userEmail") || "").trim().toLowerCase();
    const authorParam = (searchParams.get("author") || "").trim().toLowerCase();
    const search = searchParams.get("search")?.toLowerCase().trim();

    let videos: Array<Record<string, any>> = [];

    // 1. Query DynamoDB RealTimeChat table for roomId = FLIPLONG#VIDEOS
    try {
      const queryRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.RealTimeChat,
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":r": ROOM_ID,
            ":skPrefix": "VIDEO#",
          },
          ScanIndexForward: false, // newest first
          Limit: 200,
        })
      );

      if (queryRes.Items && queryRes.Items.length > 0) {
        videos = queryRes.Items as Array<Record<string, any>>;
      }
    } catch (dynErr) {
      console.warn("DynamoDB flipLong query notice:", dynErr);
    }

    // 1b. Fallback scan if query is empty
    if (videos.length === 0) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.RealTimeChat,
            FilterExpression: "roomId = :r OR begins_with(sk, :skPrefix) OR begins_with(entityId, :ePrefix)",
            ExpressionAttributeValues: {
              ":r": ROOM_ID,
              ":skPrefix": "VIDEO#",
              ":ePrefix": "FLIPLONG#",
            },
            Limit: 200,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          videos = scanRes.Items as Array<Record<string, any>>;
        }
      } catch (scanErr) {
        console.warn("DynamoDB flipLong scan notice:", scanErr);
      }
    }

    // 2. Fallback to Firebase Firestore if needed
    if (videos.length === 0 && db) {
      try {
        const snapshot = await db
          .collection(getFirestoreCollection("flipLongVideos"))
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        videos = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (fbErr) {
        console.warn("Firestore flipLong fallback notice:", fbErr);
      }
    }

    const nowMs = Date.now();

    // 3. Process & Filter
    let filtered = videos.filter((item) => {
      const isSched = item.isScheduled === true || item.isScheduled === "true";
      const schedTime = Number(item.scheduledAt) || Number(item.scheduledTimeMs);

      if (scheduledOnly) {
        const isFutureSched = isSched || (schedTime && schedTime > nowMs);
        if (!isFutureSched || !schedTime || schedTime <= nowMs) {
          return false;
        }

        if (userParam || emailParam || authorParam) {
          const itemUserId = String(item.userId || "").toLowerCase();
          const itemEmail = String(item.email || "").toLowerCase();
          const itemAuthor = String(item.author || "").toLowerCase();
          const matches =
            (userParam && (itemUserId === userParam || itemEmail === userParam || itemAuthor === userParam)) ||
            (emailParam && (itemEmail === emailParam || itemUserId === emailParam)) ||
            (authorParam && itemAuthor === authorParam);
          if (!matches) return false;
        }

        return true;
      }

      if (!includeScheduled) {
        if (isSched || (schedTime && schedTime > 0)) {
          if (schedTime && schedTime > nowMs) {
            return false; // Future scheduled — hide from live feed
          }
        }
      }

      if (search && item.title) {
        if (!item.title.toLowerCase().includes(search)) return false;
      }

      return true;
    });

    if (scheduledOnly) {
      filtered.sort((a, b) => {
        const aTime = Number(a.scheduledAt || a.scheduledTimeMs || a.timeMs || 0);
        const bTime = Number(b.scheduledAt || b.scheduledTimeMs || b.timeMs || 0);
        return aTime - bTime;
      });
    } else {
      filtered.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    }

    const mappedVideos = filtered.slice(0, limit).map((v) => {
      const cleanId = v.id || v.videoId || (v.sk as string)?.replace(/^VIDEO#\d+#/, "") || "video";
      return {
        id: cleanId,
        videoId: cleanId,
        title: v.title || "Untitled Video",
        description: v.description || "",
        url: v.url || v.videoUrl || v.mediaUrl || "",
        mediaUrl: v.mediaUrl || v.url || v.videoUrl || "",
        videoUrl: v.videoUrl || v.url || v.mediaUrl || "",
        thumbnailUrl: v.thumbnailUrl || "",
        duration: v.duration || "0:00",
        durationSeconds: v.durationSeconds || 0,
        format: v.format || "mp4",
        resourceType: "video",
        type: "VIDEO",
        badge: "VIDEO",
        sport: v.sport || "general",
        author: v.author || "SportsFan",
        authorPhoto: v.authorPhoto || "",
        userId: v.userId || "",
        email: v.email || "",
        isScheduled: v.isScheduled === true || v.isScheduled === "true",
        scheduledAt: v.scheduledAt,
        scheduledTimeMs: v.scheduledTimeMs,
        day: v.day,
        time: v.time,
        timeMs: v.timeMs || v.createdAt,
        createdAt: v.createdAt ? new Date(v.createdAt).toISOString() : new Date().toISOString(),
        createdAtMs: v.createdAt || Date.now(),
        sk: v.sk,
        roomId: v.roomId || ROOM_ID,
      };
    });

    return NextResponse.json(
      {
        success: true,
        videos: mappedVideos,
        mediaFiles: mappedVideos,
        totalCount: mappedVideos.length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error fetching FlipLONG videos";
    console.error("Error fetching FlipLONG videos:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── DELETE: Delete a FlipLong Video ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || searchParams.get("videoId");

    if (!id) {
      return NextResponse.json({ success: false, error: "Video ID is required" }, { status: 400 });
    }

    const cleanId = id.replace(/^(VIDEO|FLIPLONG)#/, "").trim();

    // 1. Delete from DynamoDB RealTimeChat table
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.RealTimeChat,
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":r": ROOM_ID,
            ":skPrefix": "VIDEO#",
          },
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        for (const item of qRes.Items) {
          if (
            item.id === cleanId ||
            item.videoId === cleanId ||
            (item.sk as string)?.includes(cleanId)
          ) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.RealTimeChat,
                Key: {
                  roomId: ROOM_ID,
                  sk: item.sk,
                },
              })
            );
          }
        }
      }
    } catch (dynErr) {
      console.warn("DynamoDB flipLong delete notice:", dynErr);
    }

    // 2. Delete from Firestore flipLongVideos
    if (db) {
      try {
        await db.collection(getFirestoreCollection("flipLongVideos")).doc(cleanId).delete();
      } catch (fbErr) {
        console.warn("Firestore flipLong delete notice:", fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully",
      id: cleanId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error deleting FlipLONG video";
    console.error("Error deleting FlipLONG video:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
