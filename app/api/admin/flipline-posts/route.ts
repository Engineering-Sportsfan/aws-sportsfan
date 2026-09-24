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
    const scheduledOnly = searchParams.get("scheduledOnly") === "true";

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

    let cards = (res.Items || []).map((c: any) => ({
      ...c,
      author: (c.author || "").replace(/\s*\(SF360\)/gi, "").trim(),
    }));

    const now = Date.now();
    if (scheduledOnly) {
      cards = cards.filter((c: any) => {
        const schedTs = Number(c.scheduledAt) || Number(c.scheduledTimeMs);
        const isSched = c.isScheduled === true || String(c.isScheduled) === "true" || (schedTs && schedTs > now);
        return isSched && schedTs && schedTs > now;
      });
    } else {
      cards = cards.filter((c: any) => {
        const schedTs = Number(c.scheduledAt) || Number(c.scheduledTimeMs);
        const isSched = c.isScheduled === true || String(c.isScheduled) === "true";
        if (isSched && schedTs && schedTs > now) {
          return false;
        }
        return true;
      });
    }

    if (channel && channel !== "all") {
      const chTarget = channel.toLowerCase();
      cards = cards.filter((c: any) => {
        const cSport = (c.channel || c.sport || "").toLowerCase();
        const chs = Array.isArray(c.channels)
          ? c.channels.map((x: any) => String(x).toLowerCase())
          : [];
        return cSport === chTarget || chs.includes(chTarget);
      });
    }

    // Deduplication for "All" category view (and clean up legacy duplicate items created per channel)
    if (!channel || channel === "all") {
      const seen = new Set<string>();
      const deduplicated: any[] = [];

      for (const card of cards) {
        // 1. Group ID check
        if (card.groupId || card.broadcastId) {
          const gid = card.groupId || card.broadcastId;
          const groupKey = `group_${gid}`;
          if (seen.has(groupKey)) {
            const existing = deduplicated.find((d) => (d.groupId || d.broadcastId) === gid);
            if (existing) {
              const currentChannels = Array.isArray(existing.channels)
                ? [...existing.channels]
                : [existing.channel || existing.sport].filter(Boolean);
              const cardChs = Array.isArray(card.channels) && card.channels.length > 0
                ? card.channels
                : [card.channel || card.sport].filter(Boolean);
              for (const ch of cardChs) {
                if (ch && !currentChannels.includes(ch)) currentChannels.push(ch);
              }
              existing.channels = currentChannels;
              existing.allChannels = currentChannels;
            }
            continue;
          }
          seen.add(groupKey);
        }

        // 2. Legacy check: identical author, content, media, posted within 15-second window
        const authorKey = (card.author || "").toLowerCase().trim();
        const contentKey = (card.content || "").trim().toLowerCase().slice(0, 100);
        const mediaKey = card.videoUrl || card.image || card.imageUrl || "";
        const timeBucket = Math.floor(Number(card.timeMs || card.scheduledAt || card.id || 0) / 15000);
        const legacyKey = `legacy_${authorKey}_${contentKey}_${mediaKey}_${timeBucket}`;

        if (seen.has(legacyKey)) {
          const existing = deduplicated.find((d) => {
            const dAuthor = (d.author || "").toLowerCase().trim();
            const dContent = (d.content || "").trim().toLowerCase().slice(0, 100);
            const dMedia = d.videoUrl || d.image || d.imageUrl || "";
            const dBucket = Math.floor(Number(d.timeMs || d.scheduledAt || d.id || 0) / 15000);
            return dAuthor === authorKey && dContent === contentKey && dMedia === mediaKey && dBucket === timeBucket;
          });
          if (existing) {
            const currentChannels = Array.isArray(existing.channels)
              ? [...existing.channels]
              : [existing.channel || existing.sport].filter(Boolean);
            const cardChs = Array.isArray(card.channels) && card.channels.length > 0
              ? card.channels
              : [card.channel || card.sport].filter(Boolean);
            for (const ch of cardChs) {
              if (ch && !currentChannels.includes(ch)) currentChannels.push(ch);
            }
            existing.channels = currentChannels;
            existing.allChannels = currentChannels;
          }
          continue;
        }

        seen.add(legacyKey);
        deduplicated.push(card);
      }
      cards = deduplicated;
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
    let isScheduled = false;
    let scheduledAt: number | undefined;
    let day: string | undefined;
    let time: string | undefined;
    let timeMs: number | undefined;
    let poll: any = undefined;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      content = (body.content || "").trim();
      botId = body.botId || "";
      if (Array.isArray(body.channels) && body.channels.length > 0) {
        channels = body.channels.map((c: any) => String(c).trim().toLowerCase()).filter(Boolean);
      } else if (typeof body.channels === "string" && body.channels) {
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
      isScheduled = body.isScheduled === true || body.isScheduled === "true";
      scheduledAt = Number(body.scheduledAt || body.scheduledTimeMs) || undefined;
      day = body.day;
      time = body.time;
      timeMs = body.timeMs ? Number(body.timeMs) : undefined;
      poll = body.poll;
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

      isScheduled = formData.get("isScheduled") === "true";
      const schedAtStr = (formData.get("scheduledAt") as string | null) || (formData.get("scheduledTimeMs") as string | null);
      scheduledAt = schedAtStr ? Number(schedAtStr) : undefined;
      day = (formData.get("day") as string) || undefined;
      time = (formData.get("time") as string) || undefined;
      const tMsStr = formData.get("timeMs") as string | null;
      timeMs = tMsStr ? Number(tMsStr) : undefined;
      const pollRaw = formData.get("poll") as string | null;
      if (pollRaw) {
        try {
          poll = JSON.parse(pollRaw);
        } catch { }
      }
    }

    // Default to general if empty
    if (channels.length === 0) {
      channels = ["general"];
    }

    // Deduplicate channels
    channels = Array.from(new Set(channels));

    // Find bot profile
    const bot = DEFAULT_FLIPLINE_BOTS.find((b) => b.id === botId || b.userId === botId) || DEFAULT_FLIPLINE_BOTS[0];

    // Handle media uploads if any
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

    const primaryChannel = channels[0] || "general";
    const primaryMeta = SPORT_META[primaryChannel] || { emoji: "💬", label: "General" };
    const isSF360 = bot.name === "SportsFan360" || bot.id === "bot_sportsfan360";

    const broadcastId = `broadcast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const id = Date.now() + Math.floor(Math.random() * 10000);
    const postTimeMs = (isScheduled && scheduledAt) ? scheduledAt : (timeMs || baseTimeMs);
    const postTimeStr = time || timeStr;
    const postDayStr = day && day.toLowerCase() !== "just now" ? day : formatCurrentDate();
    const channelLabels = channels.map((c) => SPORT_META[c]?.label || c).join(", ");

    // Single post created with multi-channel tagging (prevents duplicate items under FLIPLINE#ALL)
    const newPost: any = {
      roomId: "FLIPLINE#ALL",
      sk: `CARD#${postTimeMs}#${id}`,
      id,
      groupId: broadcastId,
      broadcastId,
      type: isSF360 ? "" : type,
      sport: primaryChannel,
      channel: primaryChannel,
      channels: channels,
      allChannels: channels,
      sportEmoji: primaryMeta.emoji,
      sportLabel: channelLabels,
      day: postDayStr,
      time: postTimeStr,
      timeMs: postTimeMs,
      isScheduled: !!isScheduled,
      ...(scheduledAt ? { scheduledAt, scheduledTimeMs: scheduledAt } : {}),
      ...(poll ? { poll } : {}),

      // Bot author details with Verified status (no (SF360) suffix)
      author: isSF360 ? "SportsFan360" : (bot.name || "").replace(/\s*\(SF360\)/gi, "").trim(),
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
      emoji: emoji || (primaryChannel === "cricket" ? "🏏" : primaryChannel === "football" ? "⚽" : primaryChannel === "athletics" ? "🏃" : primaryChannel === "experts" ? "🌟" : "💬"),
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

    return NextResponse.json({
      success: true,
      message: `Post successfully published to ${channels.length} channel${channels.length > 1 ? "s" : ""} on behalf of ${bot.name}`,
      post: newPost,
      posts: [newPost],
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
    let channelsToUpdate: string[] | undefined;
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
      if (Array.isArray(body.channels)) {
        channelsToUpdate = body.channels.map((c: any) => String(c).toLowerCase().trim()).filter(Boolean);
      }
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
      if (formData.has("channels")) {
        try {
          const parsed = JSON.parse(formData.get("channels") as string);
          if (Array.isArray(parsed)) {
            channelsToUpdate = parsed.map((c: any) => String(c).toLowerCase().trim()).filter(Boolean);
          }
        } catch { }
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

    let finalChannels = existing.channels || (existing.channel ? [existing.channel] : [finalChannel]);
    if (channelsToUpdate && channelsToUpdate.length > 0) {
      finalChannels = channelsToUpdate;
    } else if (channel !== undefined && !finalChannels.includes(channel.toLowerCase())) {
      finalChannels = [channel.toLowerCase()];
    }

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
      channels: finalChannels,
      allChannels: finalChannels,
      groupId: existing.groupId,
      broadcastId: existing.broadcastId,
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

    // Attempt to fetch post to check for groupId/broadcastId
    let groupId: string | undefined;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: "FLIPLINE#ALL", sk },
        })
      );
      groupId = getRes.Item?.groupId || getRes.Item?.broadcastId;
    } catch { }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk,
        },
      })
    );

    // If there were legacy sister copies with the same groupId, delete them too
    if (groupId) {
      try {
        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.RealTimeChat,
            KeyConditionExpression: "roomId = :roomId AND begins_with(sk, :skPrefix)",
            FilterExpression: "groupId = :gid OR broadcastId = :gid",
            ExpressionAttributeValues: {
              ":roomId": "FLIPLINE#ALL",
              ":skPrefix": "CARD#",
              ":gid": groupId,
            },
          })
        );
        for (const item of queryRes.Items || []) {
          if (item.sk !== sk) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.RealTimeChat,
                Key: { roomId: "FLIPLINE#ALL", sk: item.sk },
              })
            );
          }
        }
      } catch (err) {
        console.warn("Error cleaning up sister broadcast records:", err);
      }
    }

    return NextResponse.json({ success: true, message: "Post deleted successfully" });
  } catch (error: unknown) {
    console.error("DELETE /api/admin/flipline-posts error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete post";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
