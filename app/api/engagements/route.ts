// app/api/engagements/route.ts — Main CRUD API for Fan Battles, Quizzes, Polls, Predictions & Meme Voting
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, PutCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem, EngagementType, MemePayload, MemeRatingChoice } from "@/types/engagements";
import { getUser } from "@/lib/getUser";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

// ─── GET /api/engagements — Fetch list with filtering ────────────────────────
export async function GET(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as EngagementType | null; // fan_battle | quiz | poll | prediction
    const status = searchParams.get("status"); // active | inactive | all
    const sport = searchParams.get("sport"); // cricket | football | etc
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const itemsMap = new Map<string, EngagementItem>();

    // 1. Fetch from DynamoDB SocialAndContent table
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: TABLES.SocialAndContent,
          FilterExpression: "begins_with(contentId, :prefix) AND (sk = :metaSk OR attribute_not_exists(sk))",
          ExpressionAttributeValues: {
            ":prefix": "ENGAGEMENT#",
            ":metaSk": "ENGAGEMENT#META",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items) {
        for (const it of scanRes.Items) {
          // Ignore vote, like, or share records that share the same contentId prefix
          if (it.sk && it.sk !== "ENGAGEMENT#META") continue;
          if (!it.title || !it.type) continue;

          const id = it.id || String(it.contentId || "").replace(/^ENGAGEMENT#/, "");
          itemsMap.set(id, {
            id,
            type: it.type,
            title: it.title,
            subtitle: it.subtitle || "",
            tags: it.tags || [],
            sport: (it.sport || "cricket").toLowerCase(),
            status: it.status || "active",
            fanBattleData: it.fanBattleData,
            quizData: it.quizData,
            pollData: it.pollData,
            predictionData: it.predictionData,
            memeData: it.memeData,
            likes: Number(it.likes) || 0,
            shares: Number(it.shares) || 0,
            totalEngaged: Number(it.totalEngaged) || 0,
            createdAt: it.createdAt || Date.now(),
            updatedAt: it.updatedAt || Date.now(),
            expiresAt: it.expiresAt || null,
            creatorId: it.creatorId || undefined,
            creatorEmail: it.creatorEmail || undefined,
            creatorName: it.creatorName || undefined,
          });
        }
      }
    } catch (dynErr: any) {
      console.warn("DynamoDB engagements scan notice:", dynErr?.message || dynErr);
    }

    // 2. Fetch from Firestore 'engagements' collection and merge
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).get();
        for (const doc of snap.docs) {
          const it = doc.data();
          const id = doc.id;
          if (!it.type || !it.title) continue;

          if (!itemsMap.has(id)) {
            itemsMap.set(id, {
              id,
              type: it.type,
              title: it.title,
              subtitle: it.subtitle,
              tags: it.tags || [],
              sport: (it.sport || "cricket").toLowerCase(),
              status: it.status || "active",
              fanBattleData: it.fanBattleData,
              quizData: it.quizData,
              pollData: it.pollData,
              predictionData: it.predictionData,
              memeData: it.memeData,
              likes: Number(it.likes) || 0,
              shares: Number(it.shares) || 0,
              totalEngaged: Number(it.totalEngaged) || 0,
              createdAt: it.createdAt || Date.now(),
              updatedAt: it.updatedAt || Date.now(),
              expiresAt: it.expiresAt || null,
              creatorId: it.creatorId || undefined,
              creatorEmail: it.creatorEmail || undefined,
              creatorName: it.creatorName || undefined,
            });
          }
        }
      } catch (fbErr: any) {
        console.warn("Firestore engagements fallback notice:", fbErr?.message || fbErr);
      }
    }

    let items = Array.from(itemsMap.values());

    // Apply Filters
    if (type && type !== ("all" as any)) {
      items = items.filter(i => (i.type || "").toLowerCase() === type.toLowerCase());
    }
    if (status && status !== "all") {
      items = items.filter(i => (i.status || "active").toLowerCase() === status.toLowerCase());
    }
    if (sport && sport !== "all") {
      items = items.filter(i => (i.sport || "cricket").toLowerCase() === sport.toLowerCase());
    }

    if (limit > 0) {
      items = items.slice(0, limit);
    }

    // 3. Hydrate user interactions (userLiked, userVoted, userVote) matching candidate IDs
    const candidateIds = Array.from(
      new Set([authUser?.userId, authUser?.email, searchParams.get("userId")].filter(Boolean))
    ) as string[];

    if (candidateIds.length > 0 && items.length > 0) {
      try {
        const [likeResults, voteResults] = await Promise.all([
          Promise.all(
            items.map(async (it) => {
              for (const uid of candidateIds) {
                try {
                  const res = await docClient.send(
                    new GetCommand({
                      TableName: TABLES.SocialAndContent,
                      Key: { contentId: `ENGAGEMENT#${it.id}`, sk: `LIKE#${uid}` },
                    })
                  );
                  if (res.Item) return { Item: res.Item };
                } catch { }
              }
              return { Item: null };
            })
          ),
          Promise.all(
            items.map(async (it) => {
              for (const uid of candidateIds) {
                try {
                  const qRes = await docClient.send(
                    new QueryCommand({
                      TableName: TABLES.SocialAndContent,
                      KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
                      ExpressionAttributeValues: {
                        ":cid": `ENGAGEMENT#${it.id}`,
                        ":skpfx": `VOTE#${uid}`,
                      },
                      Limit: 1,
                    })
                  );
                  if (qRes.Items && qRes.Items.length > 0) {
                    return { Item: qRes.Items[0] };
                  }
                  const gRes = await docClient.send(
                    new GetCommand({
                      TableName: TABLES.SocialAndContent,
                      Key: { contentId: `ENGAGEMENT#${it.id}`, sk: `VOTE#${uid}` },
                    })
                  );
                  if (gRes.Item) return { Item: gRes.Item };
                } catch { }
              }
              return { Item: null };
            })
          ),
        ]);

        items = items.map((it, idx) => ({
          ...it,
          userLiked: !!likeResults[idx]?.Item,
          userVoted: !!voteResults[idx]?.Item,
          userVote: voteResults[idx]?.Item?.selectedOptionId ?? null,
        }));
      } catch (hydrationErr) {
        console.warn("Engagements user interaction hydration notice:", hydrationErr);
      }
    }

    return NextResponse.json({
      success: true,
      engagements: items,
      total: items.length,
    });
  } catch (error: unknown) {
    console.error("GET /api/engagements error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch engagements";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/engagements — Create new Fan Battle, Quiz, Poll, Prediction, or Meme ─
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    let uploadedMediaUrl = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: "engagements/memes",
          resource_type: "auto",
        });
        uploadedMediaUrl = uploadRes.secure_url;
      }

      for (const [key, value] of formData.entries()) {
        if (key === "file") continue;
        try {
          body[key] = JSON.parse(value as string);
        } catch {
          body[key] = value;
        }
      }
    } else {
      body = await req.json();
    }

    // Support base64 upload in JSON body if provided
    if (!uploadedMediaUrl && body.file && typeof body.file === "string" && body.file.startsWith("data:")) {
      try {
        const uploadRes = await cloudinary.uploader.upload(body.file, {
          folder: "engagements/memes",
          resource_type: "auto",
        });
        uploadedMediaUrl = uploadRes.secure_url;
      } catch (err) {
        console.error("Cloudinary base64 upload error in POST /api/engagements:", err);
      }
    }

    const {
      type,
      title,
      subtitle,
      description,
      tags,
      sport,
      status,
      fanBattleData,
      quizData,
      pollData,
      predictionData,
      memeData,
      likes,
      shares,
      totalEngaged,
      expiresAt,
      imageUrl,
      mediaUrl,
    } = body;

    const isMeme = type === "meme";

    if (!type) {
      return NextResponse.json({ error: "Type is required" }, { status: 400 });
    }

    if (!isMeme && !title) {
      return NextResponse.json({ error: "Type and Title are required" }, { status: 400 });
    }

    const resolvedImageUrl =
      uploadedMediaUrl ||
      imageUrl ||
      mediaUrl ||
      memeData?.imageUrl ||
      memeData?.mediaUrl ||
      "";

    if (isMeme && !resolvedImageUrl) {
      return NextResponse.json({ error: "Media upload is required for meme voting" }, { status: 400 });
    }

    const now = Date.now();
    const id = `eng_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Resolve creator identity
    const authUser = await getUser(req);
    const creatorId =
      authUser?.userId ||
      body.userId ||
      body.creatorId ||
      authUser?.email ||
      body.userEmail ||
      body.creatorEmail ||
      req.headers.get("x-user-id") ||
      "";
    const creatorEmail = (
      authUser?.email ||
      body.userEmail ||
      body.creatorEmail ||
      req.headers.get("x-user-email") ||
      ""
    ).trim().toLowerCase();
    const creatorName = authUser?.name || body.userName || body.creatorName || "";

    // Set default tags based on type if omitted
    let computedTags = tags;
    if (!computedTags || computedTags.length === 0) {
      if (type === "fan_battle") computedTags = ["⚔️ FAN BATTLE", "🔥 TRENDING"];
      else if (type === "quiz") computedTags = ["🧠 QUIZ", `⭐ ${quizData?.pointsReward || 50} PTS`];
      else if (type === "poll") computedTags = ["📊 POLL"];
      else if (type === "prediction") computedTags = ["🎯 PREDICTION", "💎 POINTS"];
      else if (type === "meme") computedTags = ["🔥 MEME ARENA", "😂 VIRAL"];
    }

    // Resolve expiry for polls, predictions, and quizzes
    const pollDurationMins = Number(pollData?.durationMinutes || pollData?.timerMinutes || 10);
    const predDurationMins = Number(predictionData?.durationMinutes || predictionData?.timerMinutes || 30);
    const quizDurationMins = Number(quizData?.durationMinutes || quizData?.timerMinutes || 600);
    const computedExpiresAt =
      expiresAt ||
      (type === "poll"
        ? pollData?.expiresAt || now + pollDurationMins * 60 * 1000
        : type === "prediction"
          ? predictionData?.expiresAt || now + predDurationMins * 60 * 1000
          : type === "quiz" && (quizData?.durationMinutes || quizData?.timerMinutes || quizData?.expiresAt)
            ? quizData?.expiresAt || now + quizDurationMins * 60 * 1000
            : null);

    const formattedQuizData =
      type === "quiz" && quizData
        ? {
            ...quizData,
            durationMinutes: quizDurationMins,
            timerMinutes: quizDurationMins,
            expiresAt: computedExpiresAt,
          }
        : undefined;

    const formattedPollData =
      type === "poll" && pollData
        ? {
          ...pollData,
          durationMinutes: pollDurationMins,
          timerMinutes: pollDurationMins,
          expiresAt: computedExpiresAt,
          correctAnswer: pollData.correctAnswer || pollData.answer || "",
          answer: pollData.correctAnswer || pollData.answer || "",
        }
        : undefined;

    const formattedPredData =
      type === "prediction" && predictionData
        ? {
          ...predictionData,
          durationMinutes: predDurationMins,
          timerMinutes: predDurationMins,
          expiresAt: computedExpiresAt,
          correctAnswer: predictionData.correctAnswer || predictionData.answer || "",
          answer: predictionData.correctAnswer || predictionData.answer || "",
          winningChoiceId:
            predictionData.winningChoiceId ||
            predictionData.correctAnswer ||
            predictionData.answer ||
            null,
        }
        : undefined;

    const formattedMemeData =
      type === "meme" && memeData
        ? {
            imageUrl: memeData.imageUrl || "",
            authorName: memeData.authorName || creatorName || "SportsFan",
            authorHandle: memeData.authorHandle || (creatorName ? `@${creatorName.toLowerCase().replace(/\s+/g, "")}` : "@sportsfan"),
            authorAvatar: memeData.authorAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
            heatPercentage: memeData.heatPercentage !== undefined ? Number(memeData.heatPercentage) : 0,
            totalVotes: Number(memeData.totalVotes) || 0,
            reactions: memeData.reactions || { mild: 0, funny: 0, hot: 0, fire: 0, nuclear: 0 },
            commentsCount: Number(memeData.commentsCount) || 0,
            sharesCount: Number(memeData.sharesCount) || 0,
          caption: memeData.caption || subtitle || "",
            createdAt: now,
          }
        : undefined;

    const finalTitle = title || (isMeme ? formattedMemeData?.title || formattedMemeData?.caption || "Meme Arena" : "");

    const newEngagement: EngagementItem = {
      id,
      type,
      title: finalTitle,
      subtitle: subtitle || (isMeme ? formattedMemeData?.caption || formattedMemeData?.description || "" : ""),
      tags: computedTags,
      sport: (sport || "cricket").toLowerCase(),
      status: status || "active",
      creatorId: creatorId || undefined,
      creatorEmail: creatorEmail || undefined,
      creatorName: creatorName || undefined,
      fanBattleData: type === "fan_battle" ? fanBattleData : undefined,
      quizData: formattedQuizData,
      pollData: formattedPollData,
      predictionData: formattedPredData,
      memeData: formattedMemeData,
      likes: Number(likes) || 0,
      shares: Number(shares) || 0,
      totalEngaged: Number(totalEngaged) || 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: computedExpiresAt,
    };

    // DynamoDB Item for SocialAndContent table
    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${type.toUpperCase()}`,
      ...newEngagement,
    };

    // Dual Write to DynamoDB + Firestore
    await dualWrite("engagements", id, TABLES.SocialAndContent, dynamoItem);

    // Award +2 points to creator for creating an engagement (quiz, poll, prediction, fan battle)
    let pointsAwarded = 0;
    if (creatorId || creatorEmail) {
      try {
        const ptsResult = await awardEngagementPoints({
          userId: creatorId || creatorEmail,
          userEmail: creatorEmail,
          userName: creatorName,
          action: "create",
          engagementId: id,
          engagementType: type,
          engagementTitle: title,
        });
        if (ptsResult.success) {
          pointsAwarded = ptsResult.pointsAwarded;
        }
      } catch (awardErr) {
        console.warn("[POST /api/engagements] Creator points award notice:", awardErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: pointsAwarded > 0 ? `Engagement created successfully! +${pointsAwarded} points awarded.` : "Engagement created successfully",
      engagement: newEngagement,
      pointsAwarded,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
