// app/api/admin/flipline-posts/route.ts — Admin API to publish FlipLine posts on behalf of verified bot profiles
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import cloudinary from "@/lib/cloudinary";
import { PutCommand, QueryCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_FLIPLINE_BOTS } from "@/app/api/admin/flipline-bots/route";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow sufficient time for large video uploads

const SPORT_META: Record<string, { emoji: string; label: string }> = {
  cricket: { emoji: "🏏", label: "IND vs SL" },
  football: { emoji: "⚽", label: "IND vs JPN" },
  athletics: { emoji: "🏃", label: "Asian Athletics" },
  general: { emoji: "💬", label: "General" },
  experts: { emoji: "🌟", label: "Experts Corner" },
};

function formatCurrentTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

function formatCurrentDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

const uploadToCloudinary = (
  buffer: Buffer,
  resourceType: "image" | "video"
): Promise<any> => {
  return new Promise((resolve, reject) => {
    // For large video uploads (> 40MB), use upload_chunked_stream to upload in chunks
    // Cloudinary's single upload limit is 100MB, so videos > 100MB MUST use chunked upload
    const isLargeVideo = resourceType === "video" && buffer.length > 40 * 1024 * 1024;

    if (isLargeVideo && typeof cloudinary.uploader.upload_chunked_stream === "function") {
      const chunkedStream = cloudinary.uploader.upload_chunked_stream(
        {
          folder: "flipline",
          resource_type: "video",
          chunk_size: 6 * 1024 * 1024, // 6 MB per chunk
        },
        (error: any, result: any) => {
          if (error || (result && result.error)) {
            console.error("Cloudinary chunked upload error:", error || result?.error);
            reject(error || result?.error);
          } else {
            resolve(result);
          }
        }
      );

      Readable.from(buffer).pipe(chunkedStream);
    } else {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "flipline",
          resource_type: resourceType,
        },
        (error: any, result: any) => {
          if (error || (result && result.error)) {
            console.error("Cloudinary upload_stream error:", error || result?.error);
            reject(error || result?.error);
          } else {
            resolve(result);
          }
        }
      );

      stream.end(buffer);
    }
  });
};

// ─── GET /api/admin/flipline-posts — Fetch all FlipLine posts for admin management ─
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel");

    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :roomId AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":roomId": "FLIPLINE#ALL",
          ":skPrefix": "CARD#",
        },
        ScanIndexForward: false,
      })
    );

    let cards = res.Items || [];

    if (channel && channel !== "all") {
      cards = cards.filter(
        (c: any) =>
          (c.channel || c.sport || "").toLowerCase() === channel.toLowerCase()
      );
    }

    return NextResponse.json({ success: true, posts: cards, total: cards.length });
  } catch (error: unknown) {
    console.error("GET /api/admin/flipline-posts error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch posts";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/admin/flipline-posts — Create post on behalf of a Bot ──────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let content = "";
    let botId = "";
    let channels: string[] = [];
    let type = "analyst";
    let source = "SF360";
    let emoji = "";
    let fomoMsg = "";
    let fomoCount = 0;
    let flipResponse = "";
    let isKey = false;
    let customScore = "";
    let directImageUrl = "";
    let directVideoUrl = "";
    let uploadedFiles: File[] = [];

    if (contentType.includes("application/json")) {
      const body = await req.json();
      content = (body.content || "").trim();
      botId = body.botId || "";
      if (Array.isArray(body.channels) && body.channels.length > 0) {
        channels = body.channels.map((c: any) => String(c).trim().toLowerCase()).filter(Boolean);
      } else if (typeof body.channels === "string" && body.channels.trim()) {
        try {
          const parsed = JSON.parse(body.channels);
          if (Array.isArray(parsed)) {
            channels = parsed.map((c: any) => String(c).trim().toLowerCase()).filter(Boolean);
          } else {
            channels = body.channels.split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);
          }
        } catch {
          channels = body.channels.split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);
        }
      } else if (body.channel || body.sport) {
        channels = [(body.channel || body.sport).trim().toLowerCase()];
      }
      type = body.type || "analyst";
      source = body.source || "SF360";
      emoji = body.emoji || "";
      fomoMsg = body.fomoMsg || "";
      fomoCount = Number(body.fomoCount) || 0;
      flipResponse = body.flipResponse || "";
      isKey = !!body.isKey;
      customScore = body.score || "";
      directImageUrl = body.image || "";
      directVideoUrl = body.videoUrl || "";
    } else {
      const formData = await req.formData();
      content = ((formData.get("content") as string) || "").trim();
      botId = (formData.get("botId") as string) || "";

      const rawChannels = formData.get("channels") as string | null;
      const allSelectedChannels = formData.getAll("selectedChannels") as string[];

      if (rawChannels) {
        try {
          const parsed = JSON.parse(rawChannels);
          if (Array.isArray(parsed)) {
            channels = parsed.map((c: any) => String(c).trim().toLowerCase()).filter(Boolean);
          } else {
            channels = rawChannels.split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);
          }
        } catch {
          channels = rawChannels.split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);
        }
      } else if (allSelectedChannels && allSelectedChannels.length > 0) {
        channels = allSelectedChannels.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
      } else {
        const singleCh = ((formData.get("channel") || formData.get("sport") || "general") as string).toLowerCase().trim();
        channels = [singleCh || "general"];
      }

      type = (formData.get("type") as string) || "analyst";
      source = (formData.get("source") as string) || "SF360";
      emoji = (formData.get("emoji") as string) || "";
      fomoMsg = (formData.get("fomoMsg") as string) || "";
      fomoCount = parseInt((formData.get("fomoCount") as string) || "0", 10);
      flipResponse = (formData.get("flipResponse") as string) || "";
      isKey = formData.get("isKey") === "true";
      customScore = (formData.get("score") as string) || "";
      directImageUrl = (formData.get("imageUrl") as string) || "";
      directVideoUrl = (formData.get("videoUrl") as string) || "";
      uploadedFiles = formData.getAll("media") as File[];
    }

    // Default to general if empty
    if (channels.length === 0) {
      channels = ["general"];
    }

    // Deduplicate channels
    channels = Array.from(new Set(channels));

    // Find bot profile
    const bot = DEFAULT_FLIPLINE_BOTS.find((b) => b.id === botId || b.userId === botId) || DEFAULT_FLIPLINE_BOTS[0];

    // Handle media uploads if any (upload once and share across all channel posts)
    let imageUrl = directImageUrl;
    let videoUrl = directVideoUrl;

    for (const file of uploadedFiles) {
      if (!file || file.size === 0) continue;
      const isVideo = file.type.startsWith("video/");
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadRes = await uploadToCloudinary(buffer, isVideo ? "video" : "image");
      if (isVideo) {
        videoUrl = uploadRes.secure_url;
      } else {
        imageUrl = uploadRes.secure_url;
      }
    }

    const baseTimeMs = Date.now();
    const timeStr = formatCurrentTime();
    const tags = content ? content.match(/#[a-zA-Z0-9_]+/g) || [] : [];
    const createdPosts = [];

    // Publish to each selected channel
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const timeMs = baseTimeMs + i;
      const id = Date.now() + Math.floor(Math.random() * 10000) + i;
      const meta = SPORT_META[channel] || { emoji: "💬", label: "General" };

      const isSF360 = bot.name === "SportsFan360" || bot.id === "bot_sportsfan360";

      const newPost = {
        roomId: "FLIPLINE#ALL",
        sk: `CARD#${timeMs}#${id}`,
        id,
        type: isSF360 ? "" : type,
        sport: channel,
        channel,
        sportEmoji: meta.emoji,
        sportLabel: meta.label,
        day: formatCurrentDate(),
        time: timeStr,
        timeMs,

        // Bot author details with Verified status
        author: isSF360 ? "SportsFan360" : `${bot.name} (SF360)`,
        handle: bot.handle,
        adminPhoto: bot.photoUrl,
        authorPhoto: bot.photoUrl,
        isVerified: true,
        verifiedFlipLineAdmin: true,
        badge: isSF360 ? "" : (bot.badge || ""),
        title: isSF360 ? "" : (bot.title || ""),
        isBot: true,
        botId: bot.id,
        userId: bot.userId,
        isUserPost: true,

        source,
        content,
        emoji: emoji || (channel === "cricket" ? "🏏" : channel === "football" ? "⚽" : channel === "athletics" ? "🏃" : channel === "experts" ? "🌟" : "💬"),
        likes: 0,
        likedBy: [],
        comments: [],
        isKey,
        tags,

        scoreChip: customScore
          ? { score: customScore, status: "Live", statusType: "live" }
          : undefined,

        fomoMsg: fomoMsg || `${bot.name}'s update is getting live reactions in FlipLine`,
        fomoCount: fomoCount || Math.floor(Math.random() * 200) + 50,
        ctaType: "watchalong",
        flipResponse: flipResponse || undefined,

        hasAttachedImage: !!imageUrl,
        hasAttachedVideo: !!videoUrl,
        image: imageUrl || undefined,
        videoUrl: videoUrl || undefined,
        mediaType: videoUrl ? "video" : imageUrl ? "image" : undefined,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLES.RealTimeChat,
          Item: newPost,
        })
      );

      createdPosts.push(newPost);
    }

    return NextResponse.json({
      success: true,
      message: `Post successfully published to ${channels.length} channel${channels.length > 1 ? "s" : ""} on behalf of ${bot.name}`,
      post: createdPosts[0],
      posts: createdPosts,
      channels,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/flipline-posts error:", error);
    let msg = "Failed to publish post";
    if (error instanceof Error) {
      msg = error.message;
    } else if (typeof error === "object" && error !== null) {
      msg = (error as any).message || (error as any).error || JSON.stringify(error);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/admin/flipline-posts — Update an existing FlipLine post ─────────
export async function PUT(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let sk = "";
    let content: string | undefined;
    let channel: string | undefined;
    let fomoMsg: string | undefined;
    let fomoCount: number | undefined;
    let customScore: string | undefined;
    let directImageUrl: string | undefined;
    let directVideoUrl: string | undefined;
    let removeMedia = false;
    let uploadedFiles: File[] = [];

    if (contentType.includes("application/json")) {
      const body = await req.json();
      sk = body.sk || "";
      content = body.content !== undefined ? (body.content || "").trim() : undefined;
      channel = body.channel || body.sport;
      fomoMsg = body.fomoMsg;
      fomoCount = body.fomoCount !== undefined ? Number(body.fomoCount) : undefined;
      customScore = body.score;
      directImageUrl = body.image;
      directVideoUrl = body.videoUrl;
      removeMedia = !!body.removeMedia;
    } else {
      const formData = await req.formData();
      sk = (formData.get("sk") as string) || "";
      if (formData.has("content")) {
        content = ((formData.get("content") as string) || "").trim();
      }
      if (formData.has("channel")) {
        channel = (formData.get("channel") as string).toLowerCase();
      }
      if (formData.has("fomoMsg")) {
        fomoMsg = (formData.get("fomoMsg") as string) || "";
      }
      if (formData.has("fomoCount")) {
        fomoCount = parseInt((formData.get("fomoCount") as string) || "0", 10);
      }
      if (formData.has("score")) {
        customScore = (formData.get("score") as string) || "";
      }
      if (formData.has("imageUrl")) {
        directImageUrl = (formData.get("imageUrl") as string) || "";
      }
      if (formData.has("videoUrl")) {
        directVideoUrl = (formData.get("videoUrl") as string) || "";
      }
      if (formData.has("removeMedia")) {
        removeMedia = formData.get("removeMedia") === "true";
      }
      uploadedFiles = formData.getAll("media") as File[];
    }

    if (!sk) {
      return NextResponse.json({ error: "Missing required 'sk'" }, { status: 400 });
    }

    // Handle new media upload if provided
    let imageUrl = directImageUrl;
    let videoUrl = directVideoUrl;

    for (const file of uploadedFiles) {
      if (!file || file.size === 0) continue;
      const isVideo = file.type.startsWith("video/");
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadRes = await uploadToCloudinary(buffer, isVideo ? "video" : "image");
      if (isVideo) {
        videoUrl = uploadRes.secure_url;
      } else {
        imageUrl = uploadRes.secure_url;
      }
    }

    // Fetch existing item to merge
    const existingRes = await docClient.send(
      new GetCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk,
        },
      })
    );

    if (!existingRes.Item) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const existing = existingRes.Item;
    const finalContent = content !== undefined ? content : existing.content;
    const finalChannel = channel !== undefined ? channel.toLowerCase() : (existing.channel || existing.sport || "general");
    const meta = SPORT_META[finalChannel] || { emoji: "🏆", label: "General" };
    const finalTags = finalContent ? finalContent.match(/#[a-zA-Z0-9_]+/g) || [] : [];

    let finalImageUrl = existing.image;
    let finalVideoUrl = existing.videoUrl;
    let finalMediaType = existing.mediaType;

    if (removeMedia) {
      finalImageUrl = undefined;
      finalVideoUrl = undefined;
      finalMediaType = undefined;
    } else {
      if (imageUrl !== undefined) finalImageUrl = imageUrl || undefined;
      if (videoUrl !== undefined) finalVideoUrl = videoUrl || undefined;
      if (finalVideoUrl) finalMediaType = "video";
      else if (finalImageUrl) finalMediaType = "image";
      else finalMediaType = undefined;
    }

    const isSF360 = (existing.author && existing.author.toLowerCase() === "sportsfan360") || existing.botId === "bot_sportsfan360";

    const updatedPost = {
      ...existing,
      type: isSF360 ? "" : existing.type,
      badge: isSF360 ? "" : existing.badge,
      title: isSF360 ? "" : existing.title,
      content: finalContent,
      channel: finalChannel,
      sport: finalChannel,
      sportEmoji: meta.emoji,
      sportLabel: meta.label,
      tags: finalTags,
      fomoMsg: fomoMsg !== undefined ? fomoMsg : existing.fomoMsg,
      fomoCount: fomoCount !== undefined ? fomoCount : existing.fomoCount,
      scoreChip: customScore !== undefined
        ? (customScore ? { score: customScore, status: "Live", statusType: "live" } : undefined)
        : existing.scoreChip,
      image: finalImageUrl,
      videoUrl: finalVideoUrl,
      mediaType: finalMediaType,
      hasAttachedImage: !!finalImageUrl,
      hasAttachedVideo: !!finalVideoUrl,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: updatedPost,
      })
    );

    return NextResponse.json({
      success: true,
      message: "Post updated successfully",
      post: updatedPost,
    });
  } catch (error: unknown) {
    console.error("PUT /api/admin/flipline-posts error:", error);
    let msg = "Failed to update post";
    if (error instanceof Error) {
      msg = error.message;
    } else if (typeof error === "object" && error !== null) {
      msg = (error as any).message || (error as any).error || JSON.stringify(error);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/admin/flipline-posts — Delete a FlipLine post by sk ──────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sk = searchParams.get("sk");

    if (!sk) {
      return NextResponse.json({ error: "Missing required query parameter: 'sk'" }, { status: 400 });
    }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk,
        },
      })
    );

    return NextResponse.json({ success: true, message: "Post deleted successfully" });
  } catch (error: unknown) {
    console.error("DELETE /api/admin/flipline-posts error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete post";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
