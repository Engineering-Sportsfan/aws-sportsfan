import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import cloudinary from "@/lib/cloudinary";
import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface FlipLineReply {
  id: string;
  userId?: string;
  userName: string;
  userHandle?: string;
  userAvatar?: string;
  adminPhoto?: string;
  authorPhoto?: string;
  content: string;
  replyTo?: string;
  time: string;
  createdAt: number;
  likes: number;
  likedBy?: string[];
}

export interface FlipLineComment {
  id: string;
  userId?: string;
  userName: string;
  userHandle?: string;
  userAvatar?: string;
  adminPhoto?: string;
  authorPhoto?: string;
  content: string;
  time: string;
  createdAt: number;
  likes: number;
  likedBy?: string[];
  replies: FlipLineReply[];
}

export interface FlipLineScoreChip {
  score: string;
  status: string;
  statusType: "live" | "upcoming" | "break" | "final" | "info";
}

export interface FlipLineCard {
  roomId: string;
  sk: string;
  id: number | string;
  type: string;
  sport: string;
  channel?: string;
  sportEmoji: string;
  sportLabel: string;
  day?: string;
  time?: string;
  timeMs: number;
  author: string;
  handle?: string;
  source?: string;
  content: string;
  emoji?: string;
  likes: number;
  likedBy?: string[];
  comments?: FlipLineComment[];
  isKey?: boolean;
  tags?: string[];
  scoreChip?: FlipLineScoreChip;
  fomoMsg?: string;
  fomoCount?: number;
  ctaType?: string;
  flipResponse?: string;
  isVerified?: boolean;
  adminPhoto?: string;
  authorPhoto?: string;
  isUserPost?: boolean;
  userId?: string;
  email?: string;
  hasAttachedImage?: boolean;
  hasAttachedVideo?: boolean;
  image?: string;
  videoUrl?: string;
  mediaType?: "image" | "video" | "audio";
}

const SPORT_META: Record<string, { emoji: string; label: string; defaultScore?: FlipLineScoreChip }> = {
  cricket: {
    emoji: "🏏",
    label: "IND vs SL",
    defaultScore: { score: "Live Match", status: "Live", statusType: "live" },
  },
  football: {
    emoji: "⚽",
    label: "IND vs JPN",
    defaultScore: { score: "Live Match", status: "Live", statusType: "live" },
  },
  athletics: {
    emoji: "🏃",
    label: "Asian Athletics",
  },
  general: {
    emoji: "💬",
    label: "General",
  },
};

const SEED_CARDS = [
  {
    id: 1,
    type: "analyst",
    sport: "cricket",
    channel: "cricket",
    sportEmoji: "🏏",
    sportLabel: "IND vs SL",
    day: "Day 1 · Morning",
    timeMs: 642,
    time: "10:42 AM",
    author: "Anand Vasu",
    handle: "@anandvasu",
    source: "Watch Along",
    content:
      "Rohit Sharma looks in excellent touch at the top. His intent to attack the spinners early is exactly what India need on this Galle surface. Watch that sweep shot — he's been working on it.",
    emoji: "🎙️",
    likes: 1243,
    isKey: true,
    tags: ["#RohitSharma", "#IndvsSL"],
    scoreChip: { score: "IND 48/0 (11 ov)", status: "Live", statusType: "live" as const },
    fomoMsg: "Anand's analysis is getting wild reactions — 312 fans debating in Watch Along right now",
    fomoCount: 312,
    ctaType: "watchalong",
    flipResponse:
      "Rohit's sweep has been his go-to at Galle historically — 68% of his runs against spin here come through that shot. India are targeting the left-arm spinner gap at mid-wicket. Teams batting first here score 15–20% more on Day 1 than Day 3 📊",
    comments: [
      {
        id: "c_seed_101",
        userId: "u_fan1",
        userName: "CricketGuru",
        userHandle: "@cric_guru",
        userAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=cric_guru",
        content: "Totally agree! His sweep shot against Jayasuriya was textbook technique.",
        time: "10:45 AM",
        createdAt: 1717000000000,
        likes: 14,
        likedBy: [],
        replies: [
          {
            id: "r_seed_201",
            userId: "u_fan2",
            userName: "GalleWatcher",
            userHandle: "@galle_watcher",
            userAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=galle",
            content: "Pitch is turning already though, let's see how he handles the bounce in session 2.",
            replyTo: "@cric_guru",
            time: "10:48 AM",
            createdAt: 1717000180000,
            likes: 5,
            likedBy: [],
          },
        ],
      },
    ],
  },

  {
    id: 2,
    type: "fan",
    sport: "cricket",
    channel: "cricket",
    sportEmoji: "🏏",
    sportLabel: "IND vs SL",
    day: "Day 1 · Morning",
    timeMs: 655,
    time: "10:55 AM",
    author: "CricketCrazy_Rohan",
    handle: "@rohancric22",
    source: "ROAR Room",
    content: "🔥🔥 BUMRAH IS UNREAL!!!! That inswinger to dismiss Karunaratne was CINEMA. Someone get this man an Oscar 😤",
    emoji: "😤",
    likes: 892,
    isKey: true,
    tags: [],
    scoreChip: { score: "SL 22/1 (6.3 ov)", status: "Live — Wicket!", statusType: "live" as const },
    fomoMsg: "892 fans are celebrating Bumrah's wicket right now — the room is going insane",
    fomoCount: 892,
    ctaType: "room",
    flipResponse:
      "Bumrah's inswinger to left-handers has a 78% success rate in Asia over the last 3 years. He pitched it on a perfect 7.5m length from over the wicket — Karunaratne had no answer. This is why he's ranked #1 in Test bowling 🎯",
    comments: [],
  },

  {
    id: 3,
    type: "official",
    sport: "cricket",
    channel: "cricket",
    sportEmoji: "🏏",
    sportLabel: "IND vs SL",
    day: "Day 1 · Morning",
    timeMs: 675,
    time: "11:15 AM",
    author: "SF360",
    source: "Official Drop",
    content: "Bumrah's 5th wicket — a classic inswinger that shattered the stumps. Watch the full clip.",
    emoji: "🎬",
    mediaType: "video" as const,
    likes: 5671,
    isKey: true,
    tags: [],
    scoreChip: { score: "SL 76/5 (24 ov)", status: "Live", statusType: "live" as const },
    fomoMsg: "5.6K fans watched this drop in 10 mins — you're missing out on the conversation",
    fomoCount: 5671,
    ctaType: "drop",
    flipResponse:
      "Bumrah's 5-wicket hauls at Galle: this is his 2nd. Historically when India bowl out the opposition under 180 here, they win 89% of the time. Sri Lanka are in serious trouble heading to lunch 📊",
    comments: [],
  },

  {
    id: 13,
    type: "analyst",
    sport: "athletics",
    channel: "athletics",
    sportEmoji: "🏃",
    sportLabel: "Delhi State Athletics",
    day: "Day 1 · Morning",
    timeMs: 676,
    time: "11:15 AM",
    author: "Rajaraman G",
    handle: "@g_rajaraman",
    source: "via X",
    content:
      "The Jawaharlal Nehru Stadium was bereft of spectators, media & influences who throng international sports events. But it was heartening to watch athletes combat the elements – rain on Friday & humidity on Sunday – to deliver their best in the Delhi State Athletics Championships",
    emoji: "🏟️",
    likes: 1876,
    isKey: false,
    tags: ["#DelhiAthletics", "#Athletics"],
    scoreChip: { score: "Delhi State Athletics", status: "Completed", statusType: "final" as const },
    fomoMsg: "Rajaraman's ground report from JN Stadium is resonating with 245 fans in Athletics room",
    fomoCount: 245,
    ctaType: "watchalong",
    flipResponse:
      "Delhi State Athletics is the breeding ground for national-level talent. Competing in rain and humidity builds mental toughness. Several athletes here will represent India in the Asian Athletics Championships next month 🏆",
    comments: [],
  },

  {
    id: 8,
    type: "analyst",
    sport: "athletics",
    channel: "athletics",
    sportEmoji: "🏃",
    sportLabel: "Asian Athletics",
    day: "Day 1 · Morning",
    timeMs: 677,
    time: "11:16 AM",
    author: "Rajaraman G",
    handle: "@g_rajaraman",
    source: "Watch Along",
    content:
      "Neeraj Chopra is warming up and he looks incredibly focused. His approach run has a different energy today — that step count adjustment he made in training is visible. This could be a massive throw.",
    emoji: "🏟️",
    likes: 677,
    isKey: false,
    tags: ["#NeerajChopra", "#AsianAthletics"],
    scoreChip: { score: "Javelin Final · Attempt 1", status: "Upcoming", statusType: "upcoming" as const },
    fomoMsg: "Rajaraman's preview is pulling 200+ fans into the Athletics Watch Along — join the room",
    fomoCount: 200,
    ctaType: "watchalong",
    flipResponse:
      "Neeraj's personal best is 89.94m. At this venue, athletes have thrown 1.8% better on average due to altitude. His 2026 form: 3 competitions, 3 wins, avg 87.6m. If he hits 88m+ today, he's on World Championship medal pace 🏆",
    comments: [],
  },

  {
    id: 9,
    type: "fan",
    sport: "football",
    channel: "football",
    sportEmoji: "⚽",
    sportLabel: "IND vs JPN",
    day: "Day 1 · Afternoon",
    timeMs: 851,
    time: "2:10 PM",
    author: "GoalMachine_Dev",
    handle: "@dev_football",
    source: "ROAR Room",
    content: "SUNIL CHHETRI IS BACK AND HE JUST SCORED 😭😭😭 India 1-0 Japan!! The crowd is ERUPTING!! ⚽🇮🇳🔥",
    emoji: "⚽",
    likes: 1893,
    isKey: true,
    tags: ["#IndiaFootball", "#Chhetri"],
    scoreChip: { score: "IND 1 – 0 JPN", status: "Live · 67'", statusType: "live" as const },
    fomoMsg: "1.8K fans are going absolutely wild in Football ROAR Room — massive goal!!",
    fomoCount: 1893,
    ctaType: "room",
    flipResponse:
      "Chhetri's 91st international goal! At 41, scoring in a competitive fixture is remarkable. India's win probability just jumped from 28% to 61%. Japan haven't conceded to India since 2019 — this is historic ⚽🏆",
    comments: [
      {
        id: "c_seed_102",
        userId: "u_fan3",
        userName: "IndianFootballHub",
        userHandle: "@ifhub",
        userAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ifhub",
        content: "Captain, Leader, Legend! What a finish from outside the box!",
        time: "2:12 PM",
        createdAt: 1717000300000,
        likes: 38,
        likedBy: [],
        replies: [],
      },
    ],
  },

  {
    id: 100,
    type: "fan",
    sport: "general",
    channel: "general",
    sportEmoji: "💬",
    sportLabel: "General",
    day: "Day 1 · Afternoon",
    timeMs: 860,
    time: "2:25 PM",
    author: "SportsFan_Community",
    handle: "@sportsfan_general",
    source: "General Lounge",
    content: "Welcome to the General Channel! Share any thoughts, weekend plans, favourite sports memories, or connect with fellow fans here. No sports restriction! 🎉💬",
    emoji: "💬",
    likes: 420,
    isKey: false,
    tags: ["#General", "#Community"],
    fomoMsg: "420 fans are hanging out in General Lounge right now",
    fomoCount: 420,
    ctaType: "room",
    flipResponse: "The General Channel connects fans across all sports boundaries without any restrictions!",
    comments: [],
  },

  {
    id: 15,
    type: "fan",
    sport: "football",
    channel: "football",
    sportEmoji: "⚽",
    sportLabel: "IND vs JPN",
    day: "Day 1 · Evening",
    timeMs: 1020,
    time: "5:00 PM",
    author: "BlueTigers_Fan",
    handle: "@bluetigers_in",
    source: "ROAR Room",
    content: "FULL TIME. INDIA 1-0 JAPAN. I can't believe what I just witnessed 😭🇮🇳 Chhetri you absolute LEGEND. History made tonight!",
    emoji: "🏆",
    likes: 4291,
    isKey: true,
    tags: ["#BlueTigers", "#INDvJPN"],
    scoreChip: { score: "IND 1 – 0 JPN", status: "Full Time", statusType: "final" as const },
    fomoMsg: "4.2K fans celebrating in Football ROAR — biggest India football moment in years",
    fomoCount: 4291,
    ctaType: "room",
    flipResponse:
      "India's first competitive win over Japan since 2011. Chhetri's goal was India's 91st international goal. Full-time stats: India 38% possession, 6 shots, 3 on target. A classic counter-attack performance by Igor Stimac's men 🏆",
    comments: [],
  },
];

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

function generateId(prefix = "id_"): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

const uploadToCloudinary = (
  buffer: Buffer,
  resourceType: "image" | "video"
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "flipline",
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    stream.end(buffer);
  });
};

// ─── GET: Fetch FlipLine Cards (Supports channel/sport filtering) ─────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channelParam = (searchParams.get("channel") || searchParams.get("sport") || "").trim().toLowerCase();

    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :roomId AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":roomId": "FLIPLINE#ALL",
          ":skPrefix": "CARD#",
        },
        ScanIndexForward: false,
        Limit: 50,
      })
    );

    let cards = (res.Items as FlipLineCard[]) || [];

    if (cards.length === 0) {
      console.log("FlipLine cards empty in DynamoDB, auto-seeding default cards...");
      const putPromises = SEED_CARDS.map(async (card) => {
        const item = {
          ...card,
          roomId: "FLIPLINE#ALL",
          sk: `CARD#${card.timeMs}#${card.id}`,
          channel: card.channel || card.sport,
          comments: card.comments || [],
        };
        await docClient.send(
          new PutCommand({
            TableName: TABLES.RealTimeChat,
            Item: item,
          })
        );
        return item;
      });

      const seededItems = await Promise.all(putPromises);
      cards = seededItems.sort((a, b) => b.timeMs - a.timeMs);
    }

    // Ensure all returned cards have properly structured comments array, likedBy array, and channel
    cards = cards.map((card) => ({
      ...card,
      channel: card.channel || card.sport || "general",
      comments: Array.isArray(card.comments) ? card.comments : [],
      likes: typeof card.likes === "number" ? card.likes : 0,
      likedBy: Array.isArray(card.likedBy) ? card.likedBy : [],
    }));

    // Filter by channel/sport if specified and not 'all'
    if (channelParam && channelParam !== "all") {
      cards = cards.filter((card) => {
        const cardSport = (card.sport || "").toLowerCase();
        const cardChannel = (card.channel || "").toLowerCase();
        return cardSport === channelParam || cardChannel === channelParam;
      });
    }

    return NextResponse.json({
      success: true,
      env: process.env.APP_ENV || "prod",
      targetTable: TABLES.RealTimeChat,
      data: cards,
    });
  } catch (error) {
    console.error("Failed to fetch FlipLine cards:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ─── POST: Create Card or Perform Comment/Reply Actions ───────────────────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // If client sends JSON payload, check for action-based operations (comment, reply, like)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { action } = body;

      if (action) {
        return handleFlipLineAction(body);
      }

      // JSON-based post creation
      const rawChannel = (body.channel || body.sport || "general").toString().trim().toLowerCase();
      const sport = rawChannel;
      const meta = SPORT_META[sport] || { emoji: "🏆", label: "General" };

      const timeMs = Date.now();
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const timeStr = body.time || formatCurrentTime();
      const tags = typeof body.content === "string" ? body.content.match(/#[a-zA-Z0-9_]+/g) || [] : [];

      const newCard: FlipLineCard = {
        roomId: "FLIPLINE#ALL",
        sk: `CARD#${timeMs}#${id}`,
        id,
        type: body.type || "fan",
        sport,
        channel: sport,
        sportEmoji: body.sportEmoji || meta.emoji,
        sportLabel: body.sportLabel || meta.label,
        day: body.day && body.day.toLowerCase() !== "just now" ? body.day : formatCurrentDate(),
        isVerified: !!body.isVerified,
        adminPhoto: body.adminPhoto,
        authorPhoto: body.authorPhoto,
        time: timeStr,
        timeMs,
        author: body.author || "Fan",
        handle: body.handle,
        source: body.source || "FlipLine",
        content: body.content || "",
        emoji: body.emoji,
        likes: typeof body.likes === "number" ? body.likes : 0,
        likedBy: [],
        comments: [],
        isKey: !!body.isKey,
        tags,
        scoreChip: sport === "general" ? undefined : (body.scoreChip || meta.defaultScore),
        fomoMsg: body.fomoMsg || "",
        fomoCount: body.fomoCount || 0,
        ctaType: body.ctaType || "room",
        flipResponse: body.flipResponse || "",
        isUserPost: true,
        userId: body.userId,
        email: body.email,
        image: body.image,
        videoUrl: body.videoUrl,
        mediaType: body.mediaType,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLES.RealTimeChat,
          Item: newCard,
        })
      );

      return NextResponse.json({
        success: true,
        env: process.env.APP_ENV || "prod",
        targetTable: TABLES.RealTimeChat,
        data: newCard,
      });
    }

    // Multipart Form Data handling
    const formData = await req.formData();
    const content = formData.get("content") as string;
    const rawSport = ((formData.get("channel") || formData.get("sport") || "general") as string).trim().toLowerCase();
    const sport = rawSport;
    const type = (formData.get("type") as string) || "fan";
    const author = (formData.get("author") as string) || "Fan";
    const handle = (formData.get("handle") as string) || undefined;
    const source = (formData.get("source") as string) || "FlipLine";
    const likes = parseInt((formData.get("likes") as string) || "0");
    const isKey = formData.get("isKey") === "true";
    const emoji = (formData.get("emoji") as string) || undefined;
    const fomoMsg = (formData.get("fomoMsg") as string) || undefined;
    const fomoCount = parseInt((formData.get("fomoCount") as string) || "0");
    const ctaType = (formData.get("ctaType") as string) || "room";
    const flipResponse = (formData.get("flipResponse") as string) || "";
    const userId = (formData.get("userId") as string) || undefined;
    const email = (formData.get("email") as string) || undefined;
    const day = (formData.get("day") as string) || undefined;
    const time = (formData.get("time") as string) || undefined;
    const isVerified = formData.get("isVerified") === "true";
    const adminPhoto = (formData.get("adminPhoto") as string) || undefined;
    const authorPhoto = (formData.get("authorPhoto") as string) || undefined;

    console.log("FlipLine POST received:", {
      content: content?.substring(0, 30),
      channel: sport,
      sport,
      userId,
      email,
    });

    const mediaFiles = formData.getAll("media") as File[];
    let imageUrl = "";
    let videoUrl = "";

    for (const file of mediaFiles) {
      if (!file || file.size === 0) continue;

      const isVideo = file.type.startsWith("video/");

      if (isVideo && file.size > 100 * 1024 * 1024) {
        return NextResponse.json(
          {
            success: false,
            error: "Video must be smaller than 100 MB",
          },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploadRes = await uploadToCloudinary(
        buffer,
        isVideo ? "video" : "image"
      );

      if (isVideo) {
        videoUrl = uploadRes.secure_url;
      } else {
        imageUrl = uploadRes.secure_url;
      }
    }

    const timeMs = Date.now();
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const timeStr = time || formatCurrentTime();
    const meta = SPORT_META[sport] || { emoji: "🏆", label: "General" };
    const tags = content ? content.match(/#[a-zA-Z0-9_]+/g) || [] : [];

    const newCard: FlipLineCard = {
      roomId: "FLIPLINE#ALL",
      sk: `CARD#${timeMs}#${id}`,
      id,
      type,
      sport,
      channel: sport,
      sportEmoji: meta.emoji,
      sportLabel: meta.label,
      day: day && day.toLowerCase() !== "just now" ? day : formatCurrentDate(),
      isVerified,
      adminPhoto,
      authorPhoto,
      time: timeStr,
      timeMs,
      author,
      handle,
      source,
      content,
      emoji,
      likes,
      likedBy: [],
      comments: [],
      isKey,
      tags,

      scoreChip:
        sport === "general"
          ? undefined
          : meta.defaultScore,

      fomoMsg: fomoMsg || "",
      fomoCount,
      ctaType,
      flipResponse,
      isUserPost: true,
      userId,
      email,

      hasAttachedImage: !!imageUrl,
      hasAttachedVideo: !!videoUrl,

      image: imageUrl || undefined,
      videoUrl: videoUrl || undefined,

      mediaType: videoUrl
        ? "video"
        : imageUrl
          ? "image"
          : undefined,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: newCard,
      })
    );

    return NextResponse.json({
      success: true,
      env: process.env.APP_ENV || "prod",
      targetTable: TABLES.RealTimeChat,
      data: newCard,
    });
  } catch (error) {
    console.error("Failed to create FlipLine post:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ─── PATCH: Commenting, Replying, Liking (Card, Comment, Reply) ───────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    return handleFlipLineAction(body);
  } catch (error) {
    console.error("Failed to process FlipLine PATCH action:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ─── Action Handler Helper ───────────────────────────────────────────────────
async function handleFlipLineAction(body: any) {
  const { sk, action, userId } = body;

  if (!sk || !action) {
    return NextResponse.json({ success: false, error: "Missing required fields: 'sk' and 'action'" }, { status: 400 });
  }

  // 1. Fetch target card
  const cardRes = await docClient.send(
    new GetCommand({
      TableName: TABLES.RealTimeChat,
      Key: { roomId: "FLIPLINE#ALL", sk },
    })
  );
  const card = cardRes.Item as FlipLineCard | undefined;
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // 2. Post/Card Like or Unlike
  if (action === "like") {
    const likedBy = Array.isArray(card.likedBy) ? [...card.likedBy] : [];
    let likes = typeof card.likes === "number" ? card.likes : 0;
    if (userId && !likedBy.includes(userId)) {
      likedBy.push(userId);
      likes += 1;
    } else if (!userId) {
      likes += 1;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: "FLIPLINE#ALL", sk },
        UpdateExpression: "SET likes = :l, likedBy = :lb",
        ExpressionAttributeValues: { ":l": likes, ":lb": likedBy },
      })
    );
    return NextResponse.json({ success: true, likes, likedBy });
  }

  if (action === "unlike") {
    let likedBy = Array.isArray(card.likedBy) ? [...card.likedBy] : [];
    let likes = typeof card.likes === "number" ? card.likes : 0;
    if (userId && likedBy.includes(userId)) {
      likedBy = likedBy.filter((u) => u !== userId);
      likes = Math.max(0, likes - 1);
    } else if (!userId) {
      likes = Math.max(0, likes - 1);
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: "FLIPLINE#ALL", sk },
        UpdateExpression: "SET likes = :l, likedBy = :lb",
        ExpressionAttributeValues: { ":l": likes, ":lb": likedBy },
      })
    );
    return NextResponse.json({ success: true, likes, likedBy });
  }

  let comments: FlipLineComment[] = Array.isArray(card.comments) ? [...card.comments] : [];

  // 3. Add a top-level Comment to the post
  if (action === "add_comment" || action === "comment") {
    const content = (body.content || body.commentText || body.text || "").trim();
    if (!content) {
      return NextResponse.json({ success: false, error: "Comment content cannot be empty" }, { status: 400 });
    }

    const newComment: FlipLineComment = {
      id: body.id || generateId("c_"),
      userId: body.userId || userId,
      userName: body.userName || body.author || "SportsFan",
      userHandle: body.userHandle || body.handle || "@sportsfan",
      userAvatar: body.adminPhoto || body.authorPhoto || body.userAvatar,
      adminPhoto: body.adminPhoto,
      authorPhoto: body.authorPhoto,
      content,
      time: body.time || formatCurrentTime(),
      createdAt: body.createdAt || Date.now(),
      likes: 0,
      likedBy: [],
      replies: [],
    };

    comments.push(newComment);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk: sk,
        },
        UpdateExpression: "SET comments = :comments",
        ExpressionAttributeValues: {
          ":comments": comments,
        },
      })
    );

    return NextResponse.json({
      success: true,
      message: "Comment added successfully",
      comment: newComment,
      comments,
    });
  }

  // 4. Add a nested Reply to an existing comment
  if (action === "add_reply" || action === "reply") {
    const { commentId } = body;
    const content = (body.content || body.replyText || body.text || "").trim();

    if (!commentId) {
      return NextResponse.json({ success: false, error: "Missing 'commentId' for reply" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ success: false, error: "Reply content cannot be empty" }, { status: 400 });
    }

    const commentIndex = comments.findIndex((c) => c.id === commentId);
    if (commentIndex === -1) {
      return NextResponse.json({ success: false, error: `Comment '${commentId}' not found` }, { status: 404 });
    }

    const targetComment = comments[commentIndex];
    const newReply: FlipLineReply = {
      id: body.id || generateId("r_"),
      userId: body.userId || userId,
      userName: body.userName || body.author || "SportsFan",
      userHandle: body.userHandle || body.handle || "@sportsfan",
      userAvatar: body.adminPhoto || body.authorPhoto || body.userAvatar,
      adminPhoto: body.adminPhoto,
      authorPhoto: body.authorPhoto,
      content,
      replyTo: body.replyTo || targetComment.userHandle || targetComment.userName,
      time: body.time || formatCurrentTime(),
      createdAt: body.createdAt || Date.now(),
      likes: 0,
      likedBy: [],
    };

    const existingReplies = Array.isArray(targetComment.replies) ? targetComment.replies : [];
    targetComment.replies = [...existingReplies, newReply];
    comments[commentIndex] = targetComment;

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk: sk,
        },
        UpdateExpression: "SET comments = :comments",
        ExpressionAttributeValues: {
          ":comments": comments,
        },
      })
    );

    return NextResponse.json({
      success: true,
      message: "Reply added successfully",
      reply: newReply,
      comment: targetComment,
      comments,
    });
  }

  // 5. Like or Unlike a Comment
  if (action === "like_comment" || action === "unlike_comment") {
    const { commentId } = body;
    if (!commentId) {
      return NextResponse.json({ success: false, error: "Missing 'commentId'" }, { status: 400 });
    }

    const commentIndex = comments.findIndex((c) => c.id === commentId);
    if (commentIndex === -1) {
      return NextResponse.json({ success: false, error: `Comment '${commentId}' not found` }, { status: 404 });
    }

    const targetComment = { ...comments[commentIndex] };
    const likedBy = Array.isArray(targetComment.likedBy) ? [...targetComment.likedBy] : [];
    const isAlreadyLiked = userId ? likedBy.includes(userId) : false;

    if (action === "unlike_comment" || isAlreadyLiked) {
      targetComment.likes = Math.max(0, (targetComment.likes || 1) - 1);
      if (userId) {
        targetComment.likedBy = likedBy.filter((u) => u !== userId);
      }
    } else {
      targetComment.likes = (targetComment.likes || 0) + 1;
      if (userId) {
        likedBy.push(userId);
        targetComment.likedBy = likedBy;
      }
    }

    comments[commentIndex] = targetComment;

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk: sk,
        },
        UpdateExpression: "SET comments = :comments",
        ExpressionAttributeValues: {
          ":comments": comments,
        },
      })
    );

    return NextResponse.json({
      success: true,
      comment: targetComment,
      comments,
    });
  }

  // 6. Like or Unlike a Reply
  if (action === "like_reply" || action === "unlike_reply") {
    const { commentId, replyId } = body;
    if (!commentId || !replyId) {
      return NextResponse.json({ success: false, error: "Missing 'commentId' or 'replyId'" }, { status: 400 });
    }

    const commentIndex = comments.findIndex((c) => c.id === commentId);
    if (commentIndex === -1) {
      return NextResponse.json({ success: false, error: `Comment '${commentId}' not found` }, { status: 404 });
    }

    const targetComment = { ...comments[commentIndex] };
    const replies = Array.isArray(targetComment.replies) ? [...targetComment.replies] : [];
    const replyIndex = replies.findIndex((r) => r.id === replyId);

    if (replyIndex === -1) {
      return NextResponse.json({ success: false, error: `Reply '${replyId}' not found` }, { status: 404 });
    }

    const targetReply = { ...replies[replyIndex] };
    const likedBy = Array.isArray(targetReply.likedBy) ? [...targetReply.likedBy] : [];
    const isAlreadyLiked = userId ? likedBy.includes(userId) : false;

    if (action === "unlike_reply" || isAlreadyLiked) {
      targetReply.likes = Math.max(0, (targetReply.likes || 1) - 1);
      if (userId) {
        targetReply.likedBy = likedBy.filter((u) => u !== userId);
      }
    } else {
      targetReply.likes = (targetReply.likes || 0) + 1;
      if (userId) {
        likedBy.push(userId);
        targetReply.likedBy = likedBy;
      }
    }

    replies[replyIndex] = targetReply;
    targetComment.replies = replies;
    comments[commentIndex] = targetComment;

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk: sk,
        },
        UpdateExpression: "SET comments = :comments",
        ExpressionAttributeValues: {
          ":comments": comments,
        },
      })
    );

    return NextResponse.json({
      success: true,
      reply: targetReply,
      comment: targetComment,
      comments,
    });
  }

  // 7. Delete a Comment
  if (action === "delete_comment") {
    const { commentId } = body;
    if (!commentId) {
      return NextResponse.json({ success: false, error: "Missing 'commentId'" }, { status: 400 });
    }

    comments = comments.filter((c) => c.id !== commentId);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: {
          roomId: "FLIPLINE#ALL",
          sk: sk,
        },
        UpdateExpression: "SET comments = :comments",
        ExpressionAttributeValues: {
          ":comments": comments,
        },
      })
    );

    return NextResponse.json({
      success: true,
      message: "Comment deleted successfully",
      comments,
    });
  }

  // 8. Delete a Reply
  if (action === "delete_reply") {
    const { commentId, replyId } = body;
    if (!commentId || !replyId) {
      return NextResponse.json({ success: false, error: "Missing 'commentId' or 'replyId'" }, { status: 400 });
    }

    const commentIndex = comments.findIndex((c) => c.id === commentId);
    if (commentIndex !== -1) {
      const targetComment = { ...comments[commentIndex] };
      targetComment.replies = (targetComment.replies || []).filter((r) => r.id !== replyId);
      comments[commentIndex] = targetComment;

      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: {
            roomId: "FLIPLINE#ALL",
            sk: sk,
          },
          UpdateExpression: "SET comments = :comments",
          ExpressionAttributeValues: {
            ":comments": comments,
          },
        })
      );
    }

    return NextResponse.json({
      success: true,
      message: "Reply deleted successfully",
      comments,
    });
  }

  return NextResponse.json({ success: false, error: `Unsupported action: '${action}'` }, { status: 400 });
}
