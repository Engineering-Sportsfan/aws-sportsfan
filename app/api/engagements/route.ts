// app/api/engagements/route.ts — Main CRUD API for Fan Battles, Quizzes, Polls, Predictions & Meme Voting
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { ScanCommand, PutCommand, GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem, EngagementType, MemePayload, MemeRatingChoice } from "@/types/engagements";
import { getUser } from "@/lib/getUser";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import { dispatchFlipArenaContentDropNotification } from "@/lib/notifications";
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

    // 1. Fetch from DynamoDB SocialAndContent table (with candidate table fallback)
    const candidateTables = getCandidateTableNames(TABLES.SocialAndContent);
    for (const table of candidateTables) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: table,
            FilterExpression: "begins_with(contentId, :prefix) AND (sk = :metaSk OR attribute_not_exists(sk))",
            ExpressionAttributeValues: {
              ":prefix": "ENGAGEMENT#",
              ":metaSk": "ENGAGEMENT#META",
            },
            Limit: 100,
          })
        );

        if (scanRes.Items && scanRes.Items.length > 0) {
          for (const it of scanRes.Items) {
            // Ignore vote, like, or share records that share the same contentId prefix
            if (it.sk && it.sk !== "ENGAGEMENT#META") continue;
            const resolvedTitle = it.title || it.subtitle || it.headline || it.caption || it.memeData?.caption || (it.type === "meme" ? "Meme" : "");
            if (!resolvedTitle || !it.type) continue;

            const id = it.id || String(it.contentId || "").replace(/^ENGAGEMENT#/, "");
            if (!itemsMap.has(id)) {
              itemsMap.set(id, {
                id,
                type: it.type,
                title: resolvedTitle,
                subtitle: it.subtitle || "",
                tags: it.tags || [],
                sport: (it.sport || "cricket").toLowerCase(),
                status: (it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId) ? "settled" : (it.status || "active"),
                fanBattleData: it.fanBattleData,
                quizData: it.quizData,
                pollData: it.pollData,
                predictionData: it.predictionData,
                memeData: it.memeData,
                debateData: it.debateData,
                expressData: it.expressData,
                questionData: it.questionData,
                winningChoiceId: it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
                outcomeWinningChoiceId: it.outcomeWinningChoiceId || it.winningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
                outcomeNotes: it.outcomeNotes || null,
                resolvedAt: it.resolvedAt || null,
                resolvedBy: it.resolvedBy || null,
                timerMinutes: it.timerMinutes || it.durationMinutes || 4,
                durationMinutes: it.durationMinutes || it.timerMinutes || 4,
                memeType: it.memeType || it.memeData?.memeType,
                options: it.options || it.memeData?.options || it.debateData?.options || it.expressData?.options || it.questionData?.options || it.pollData?.options || it.predictionData?.options,
                imageUrlA: it.imageUrlA || it.memeData?.imageUrlA,
                imageUrlB: it.imageUrlB || it.memeData?.imageUrlB,
                labelA: it.labelA || it.memeData?.labelA,
                labelB: it.labelB || it.memeData?.labelB,
                likes: Number(it.likes) || 0,
                shares: Number(it.shares) || 0,
                totalEngaged: Number(it.totalEngaged) || 0,
                createdAt: it.createdAt || Date.now(),
                updatedAt: it.updatedAt || Date.now(),
                expiresAt:
                  it.expiresAt ||
                  (it.createdAt && (it.timerMinutes || it.durationMinutes)
                    ? Number(it.createdAt) + Number(it.timerMinutes || it.durationMinutes || 4) * 60 * 1000
                    : null),
                category: it.category || (it.isMatchMoment ? "match_moment" : (it.type === "fan_battle" || it.type === "meme" ? "fliparena" : undefined)),
                source: it.source || (it.isMatchMoment ? "match_moment" : "fliparena"),
                isMatchMoment: it.isMatchMoment !== undefined ? Boolean(it.isMatchMoment) : Boolean(it.debateData || it.expressData || it.questionData || it.tags?.some((t: string) => t.includes("MATCH MOMENT") || t.includes("4-MIN"))),
                matchId: it.matchId || undefined,
                momentId: it.momentId || it.loopId || undefined,
                loopId: it.loopId || it.momentId || undefined,
                matchPhase: it.matchPhase || undefined,
                anchorTrigger: it.anchorTrigger || undefined,
                scoreState: it.scoreState || undefined,
                sportsMoment: it.sportsMoment || undefined,
                overNumber: it.overNumber !== undefined ? it.overNumber : undefined,
                innings: it.innings !== undefined ? Number(it.innings) : undefined,
                creatorId: it.creatorId || undefined,
                creatorEmail: it.creatorEmail || undefined,
                creatorName: it.creatorName || undefined,
                creatorAvatar: it.creatorAvatar || undefined,
              });
            }
          }
          break; // Successfully loaded from this DynamoDB table
        }
      } catch (dynErr: any) {
        const isTableMissing =
          dynErr?.name === "ResourceNotFoundException" ||
          dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
          dynErr?.message?.includes("ResourceNotFoundException");
        if (isTableMissing) continue;
        console.warn(`DynamoDB engagements scan notice on table "${table}":`, dynErr?.message || dynErr);
        break;
      }
    }

    // 1b. Fetch match loops from MatchMoments table (MatchMoments-dev, MatchMoments-release, MatchMoments)
    const matchMomentTables = getCandidateTableNames(TABLES.MatchMoments);
    const rawSearchMatchId = searchParams.get("matchId");
    const cleanSearchMatchId = rawSearchMatchId ? rawSearchMatchId.replace(/^MATCH#/, "") : null;
    for (const table of matchMomentTables) {
      try {
        let loopItems: any[] = [];
        if (cleanSearchMatchId) {
          try {
            const qRes = await docClient.send(
              new QueryCommand({
                TableName: table,
                KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
                ExpressionAttributeValues: {
                  ":eId": `MATCH#${cleanSearchMatchId}`,
                  ":skpfx": "LOOP#",
                },
                Limit: 100,
              })
            );
            loopItems = qRes.Items || [];
          } catch (e) {
            loopItems = [];
          }
        } else {
          const sRes = await docClient.send(
            new ScanCommand({
              TableName: table,
              FilterExpression: "begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":skpfx": "LOOP#",
              },
              Limit: 100,
            })
          );
          loopItems = sRes.Items || [];
        }

        if (loopItems && loopItems.length > 0) {
          for (const it of loopItems) {
            const id = it.id || it.loopId || (typeof it.sk === "string" ? it.sk.replace(/^LOOP#/, "") : "");
            if (!id) continue;
            if (itemsMap.has(id)) {
              const existing = itemsMap.get(id);
              if (existing) {
                const mergedWinningId =
                  existing.winningChoiceId ||
                  existing.outcomeWinningChoiceId ||
                  existing.predictionData?.winningChoiceId ||
                  existing.debateData?.winningChoiceId ||
                  it.winningChoiceId ||
                  it.outcomeWinningChoiceId ||
                  it.predictionData?.winningChoiceId ||
                  it.debateData?.winningChoiceId ||
                  null;

                const isSettled = Boolean(
                  mergedWinningId ||
                  existing.status === "settled" ||
                  existing.status === "resolved" ||
                  it.status === "settled" ||
                  it.status === "resolved"
                );

                const mergedStatus = isSettled
                  ? "settled"
                  : (existing.status && existing.status !== "pending" ? existing.status : it.status || "active");

                itemsMap.set(id, {
                  ...existing,
                  ...it,
                  id,
                  status: mergedStatus,
                  winningChoiceId: mergedWinningId,
                  outcomeWinningChoiceId: mergedWinningId,
                  outcomeNotes: existing.outcomeNotes || it.outcomeNotes || null,
                  resolvedAt: existing.resolvedAt || it.resolvedAt || null,
                  resolvedBy: existing.resolvedBy || it.resolvedBy || null,
                  likes: Math.max(Number(existing.likes) || 0, Number(it.likes) || 0),
                  shares: Math.max(Number(existing.shares) || 0, Number(it.shares) || 0),
                  totalEngaged: Math.max(Number(existing.totalEngaged) || 0, Number(it.totalEngaged) || 0),
                  commentsCount: Math.max(Number(existing.commentsCount) || 0, Number(it.commentsCount) || 0),
                  pollData: it.pollData || existing.pollData,
                  predictionData: it.predictionData || existing.predictionData,
                  debateData: it.debateData || existing.debateData,
                  fanBattleData: it.fanBattleData || existing.fanBattleData,
                  options: it.options || existing.options,
                  matchId: it.matchId || (typeof it.entityId === "string" ? it.entityId.replace(/^MATCH#/, "") : existing.matchId),
                  isMatchMoment: true,
                });
              }
              continue;
            }
            const resolvedTitle = it.title || it.subtitle || it.headline || it.caption || it.question || "";
            itemsMap.set(id, {
              id,
              type: it.type || "poll",
              title: resolvedTitle || "Match Engagement",
              subtitle: it.subtitle || "",
              tags: it.tags || [],
              sport: (it.sport || "cricket").toLowerCase(),
              status: (it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId) ? "settled" : (it.status || "active"),
              fanBattleData: it.fanBattleData,
              quizData: it.quizData,
              pollData: it.pollData,
              predictionData: it.predictionData,
              memeData: it.memeData,
              debateData: it.debateData,
              expressData: it.expressData,
              questionData: it.questionData,
              winningChoiceId: it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeWinningChoiceId: it.outcomeWinningChoiceId || it.winningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeNotes: it.outcomeNotes || null,
              resolvedAt: it.resolvedAt || null,
              resolvedBy: it.resolvedBy || null,
              timerMinutes: it.timerMinutes || 4,
              durationMinutes: it.durationMinutes || 4,
              options: it.options || it.pollData?.options || it.predictionData?.options || it.debateData?.options || it.expressData?.options || it.questionData?.options,
              likes: Number(it.likes) || 0,
              shares: Number(it.shares) || 0,
              totalEngaged: Number(it.totalEngaged) || 0,
              commentsCount: Number(it.commentsCount) || 0,
              createdAt: it.createdAt || Date.now(),
              updatedAt: it.updatedAt || Date.now(),
              expiresAt: it.expiresAt || null,
              category: it.category || "match_moment",
              source: it.source || "match_moment",
              isMatchMoment: true,
              matchId: it.matchId || (typeof it.entityId === "string" ? it.entityId.replace(/^MATCH#/, "") : undefined),
              momentId: it.momentId || undefined,
              loopId: it.loopId || id,
              matchPhase: it.matchPhase || undefined,
              anchorTrigger: it.anchorTrigger || undefined,
              scoreState: it.scoreState || undefined,
              sportsMoment: it.sportsMoment || undefined,
              overNumber: it.overNumber !== undefined ? it.overNumber : undefined,
              innings: it.innings !== undefined ? Number(it.innings) : undefined,
              creatorId: it.creatorId || undefined,
              creatorEmail: it.creatorEmail || undefined,
              creatorName: it.creatorName || undefined,
              creatorAvatar: it.creatorAvatar || undefined,
            });
          }
          break;
        }
      } catch (mmErr: any) {
        // Continue to next candidate table
      }
    }

    // 2. Fetch from Firestore 'engagements' collection and merge
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).get();
        for (const doc of snap.docs) {
          const it = doc.data();
          const id = doc.id;
          const resolvedTitle = it.title || it.subtitle || it.headline || it.caption || it.memeData?.caption || (it.type === "meme" ? "Meme" : "");
          if (!it.type || !resolvedTitle) continue;

          if (!itemsMap.has(id)) {
            itemsMap.set(id, {
              id,
              type: it.type,
              title: resolvedTitle,
              subtitle: it.subtitle,
              tags: it.tags || [],
              sport: (it.sport || "cricket").toLowerCase(),
              status: it.status || "active",
              fanBattleData: it.fanBattleData,
              quizData: it.quizData,
              pollData: it.pollData,
              predictionData: it.predictionData,
              memeData: it.memeData,
              debateData: it.debateData,
              expressData: it.expressData,
              questionData: it.questionData,
              winningChoiceId: it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeWinningChoiceId: it.outcomeWinningChoiceId || it.winningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeNotes: it.outcomeNotes || null,
              resolvedAt: it.resolvedAt || null,
              resolvedBy: it.resolvedBy || null,
              timerMinutes: it.timerMinutes || it.durationMinutes || 4,
              durationMinutes: it.durationMinutes || it.timerMinutes || 4,
              memeType: it.memeType || it.memeData?.memeType,
              options: it.options || it.memeData?.options || it.debateData?.options || it.expressData?.options || it.questionData?.options || it.pollData?.options || it.predictionData?.options,
              imageUrlA: it.imageUrlA || it.memeData?.imageUrlA,
              imageUrlB: it.imageUrlB || it.memeData?.imageUrlB,
              labelA: it.labelA || it.memeData?.labelA,
              labelB: it.labelB || it.memeData?.labelB,
              likes: Number(it.likes) || 0,
              shares: Number(it.shares) || 0,
              totalEngaged: Number(it.totalEngaged) || 0,
              createdAt: it.createdAt || Date.now(),
              updatedAt: it.updatedAt || Date.now(),
              expiresAt:
                it.expiresAt ||
                (it.createdAt && (it.timerMinutes || it.durationMinutes)
                  ? Number(it.createdAt) + Number(it.timerMinutes || it.durationMinutes || 4) * 60 * 1000
                  : null),
              category: it.category || (it.isMatchMoment ? "match_moment" : (it.type === "fan_battle" || it.type === "meme" ? "fliparena" : undefined)),
              source: it.source || (it.isMatchMoment ? "match_moment" : "fliparena"),
              isMatchMoment: it.isMatchMoment !== undefined ? Boolean(it.isMatchMoment) : Boolean(it.debateData || it.expressData || it.questionData || it.tags?.some((t: string) => t.includes("MATCH MOMENT") || t.includes("4-MIN"))),
              matchId: it.matchId || undefined,
              momentId: it.momentId || it.loopId || undefined,
              loopId: it.loopId || it.momentId || undefined,
              matchPhase: it.matchPhase || undefined,
              anchorTrigger: it.anchorTrigger || undefined,
              scoreState: it.scoreState || undefined,
              sportsMoment: it.sportsMoment || undefined,
              overNumber: it.overNumber !== undefined ? it.overNumber : undefined,
              innings: it.innings !== undefined ? Number(it.innings) : undefined,
              creatorId: it.creatorId || undefined,
              creatorEmail: it.creatorEmail || undefined,
              creatorName: it.creatorName || undefined,
              creatorAvatar: it.creatorAvatar || undefined,
            });
          }
        }
      } catch (fbErr: any) {
        console.warn("Firestore engagements fallback notice:", fbErr?.message || fbErr);
      }
    }

    let items = Array.from(itemsMap.values());

    // Helper to resolve the latest numeric timestamp for sorting
    const getItemTimestamp = (it: any) => {
      const raw =
        it.createdAt ||
        it.updatedAt ||
        (it as any).postingTime ||
        (it as any).postedAt ||
        it.quizData?.startTime ||
        it.quizData?.scheduledStartTime ||
        it.pollData?.startTime ||
        it.pollData?.scheduledStartTime ||
        it.predictionData?.startTime ||
        it.predictionData?.scheduledStartTime ||
        it.fanBattleData?.startTime ||
        it.fanBattleData?.scheduledStartTime ||
        (it.memeData as any)?.createdAt ||
        0;
      if (typeof raw === "number") return raw;
      const parsed = new Date(raw).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    // Sort descending so the latest created engagements are at the top
    items.sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));

    // Apply Filters
    const nowMs = Date.now();
    if (type && type !== ("all" as any)) {
      items = items.filter(i => (i.type || "").toLowerCase() === type.toLowerCase());
    }
    if (status && status !== "all") {
      items = items.filter(i => {
        const itemStatus = (i.status || "active").toLowerCase();
        if (status.toLowerCase() === "active") {
          if (itemStatus !== "active") return false;
          if ((i as any).isClosed || (i as any).closed || (i as any).isEnded) return false;
          if (i.expiresAt && Number(i.expiresAt) > 0 && nowMs >= Number(i.expiresAt)) return false;
          return true;
        }
        return itemStatus === status.toLowerCase();
      });
    }
    if (sport && sport !== "all") {
      items = items.filter(i => (i.sport || "cricket").toLowerCase() === sport.toLowerCase());
    }

    const matchIdParam = searchParams.get("matchId");
    if (matchIdParam) {
      const cleanTargetMatchId = matchIdParam.replace(/^MATCH#/i, "").toLowerCase();
      items = items.filter(i => {
        const itemMatchId = String((i as any).matchId || "").replace(/^MATCH#/i, "").toLowerCase();
        return itemMatchId === cleanTargetMatchId;
      });
    }

    // Support excludeFlipArena or source=match_moment filter
    const sourceParam = searchParams.get("source");
    const categoryParam = searchParams.get("category");
    const shouldExcludeFlipArena =
      searchParams.get("excludeFlipArena") === "true" ||
      sourceParam === "match_moment" ||
      categoryParam === "match_moment";

    if (shouldExcludeFlipArena) {
      items = items.filter(i => {
        if (i.type === "meme" || i.type === "fan_battle" || (i as any).memeData || (i as any).fanBattleData) return false;
        if (i.type === "quiz" && i.quizData?.questions && i.quizData.questions.length > 1) return false;
        if ((i as any).source === "fliparena" || (i as any).category === "fliparena") return false;
        return true;
      });
    }

    // Support excludeMatchMoments (for FlipArena feed / manager)
    const shouldExcludeMatchMoments =
      searchParams.get("excludeMatchMoments") === "true" ||
      sourceParam === "fliparena" ||
      categoryParam === "fliparena";

    if (shouldExcludeMatchMoments) {
      items = items.filter(i => {
        if (i.isMatchMoment === true || (i as any).category === "match_moment" || (i as any).source === "match_moment") return false;
        if (i.type === "debate" || i.type === "express" || i.type === "question") return false;
        if (Boolean(i.debateData || i.expressData || i.questionData)) return false;
        if (Array.isArray(i.tags) && i.tags.some(t => t.toUpperCase().includes("MATCH MOMENT") || t.toUpperCase().includes("4-MIN"))) return false;
        return true;
      });
    }

    if (limit > 0) {
      items = items.slice(0, limit);
    }

    // 3. Hydrate user interactions (userLiked, userVoted, userVote) matching candidate IDs
    const targetUserId = searchParams.get("userId");
    const candidateIds = Array.from(
      new Set(
        targetUserId
          ? [targetUserId, targetUserId.includes("@") ? targetUserId.replace(/[@.]/g, "_") : null].filter(Boolean)
          : [authUser?.userId, authUser?.email].filter(Boolean)
      )
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

    // Check if any scheduled engagement has just become live and needs notification
    for (const it of items) {
      const itStartMs =
        Number((it as any).scheduledStartTime) ||
        Number((it as any).startTime) ||
        Number((it as any).postingTime) ||
        Number(it.quizData?.scheduledStartTime) ||
        Number(it.quizData?.startTime) ||
        Number(it.pollData?.scheduledStartTime) ||
        Number(it.predictionData?.scheduledStartTime) ||
        Number(it.fanBattleData?.scheduledStartTime) ||
        0;

      const isLiveNow = itStartMs > 0 && itStartMs <= nowMs;
      if (isLiveNow && (it as any).notifiedLive === false) {
        (it as any).notifiedLive = true;
        (async () => {
          try {
            await dispatchFlipArenaContentDropNotification({
              engagementId: it.id,
              engagementType: it.type,
              engagementTitle: it.title,
              creatorId: it.creatorId,
              creatorName: it.creatorName,
            });
            await dualWrite("engagements", it.id, TABLES.SocialAndContent, {
              contentId: `ENGAGEMENT#${it.id}`,
              sk: "ENGAGEMENT#META",
              entityId: `ENGAGEMENT#${it.type.toUpperCase()}`,
              ...it,
              notifiedLive: true,
            });
          } catch (e) {
            console.warn("[GET /api/engagements] Scheduled live notify notice:", e);
          }
        })();
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
        try {
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const base64 = `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
          const uploadRes = await cloudinary.uploader.upload(base64, {
            folder: "engagements/memes",
            resource_type: "auto",
          });
          uploadedMediaUrl = uploadRes.secure_url;
        } catch (cErr: any) {
          console.warn("[POST /api/engagements] Cloudinary file upload notice:", cErr?.message || cErr);
        }
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

    // Helper to upload any base64 string to Cloudinary
    const uploadBase64ToCloudinary = async (val?: string): Promise<string> => {
      if (!val || typeof val !== "string" || !val.startsWith("data:")) return val || "";
      try {
        const uploadRes = await cloudinary.uploader.upload(val, {
          folder: "engagements/memes",
          resource_type: "auto",
        });
        return uploadRes.secure_url;
      } catch (err) {
        console.error("Cloudinary base64 upload error in POST /api/engagements:", err);
        return val;
      }
    };

    // Support base64 upload in JSON body if provided
    if (!uploadedMediaUrl && body.file && typeof body.file === "string" && body.file.startsWith("data:")) {
      uploadedMediaUrl = await uploadBase64ToCloudinary(body.file);
    }

    // Also auto-upload base64 meme images if provided in body or memeData
    if (body.memeData?.imageUrl && typeof body.memeData.imageUrl === "string" && body.memeData.imageUrl.startsWith("data:")) {
      body.memeData.imageUrl = await uploadBase64ToCloudinary(body.memeData.imageUrl);
    }
    if (body.memeData?.imageUrlA && typeof body.memeData.imageUrlA === "string" && body.memeData.imageUrlA.startsWith("data:")) {
      body.memeData.imageUrlA = await uploadBase64ToCloudinary(body.memeData.imageUrlA);
    }
    if (body.memeData?.imageUrlB && typeof body.memeData.imageUrlB === "string" && body.memeData.imageUrlB.startsWith("data:")) {
      body.memeData.imageUrlB = await uploadBase64ToCloudinary(body.memeData.imageUrlB);
    }
    if (body.imageUrl && typeof body.imageUrl === "string" && body.imageUrl.startsWith("data:")) {
      body.imageUrl = await uploadBase64ToCloudinary(body.imageUrl);
    }
    if (body.imageUrlA && typeof body.imageUrlA === "string" && body.imageUrlA.startsWith("data:")) {
      body.imageUrlA = await uploadBase64ToCloudinary(body.imageUrlA);
    }
    if (body.imageUrlB && typeof body.imageUrlB === "string" && body.imageUrlB.startsWith("data:")) {
      body.imageUrlB = await uploadBase64ToCloudinary(body.imageUrlB);
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
    const id = body.id || body.engagementId || `eng_${now}_${Math.random().toString(36).slice(2, 8)}`;

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
    const creatorAvatar = (authUser as any)?.avatarUrl || (authUser as any)?.picture || (authUser as any)?.photoURL || body.userAvatar || body.creatorAvatar || "";

    // Set default tags based on type if omitted
    let computedTags = tags;
    if (!computedTags || computedTags.length === 0) {
      if (type === "fan_battle") computedTags = ["⚔️ FAN BATTLE", "🔥 TRENDING"];
      else if (type === "quiz") computedTags = ["🧠 QUIZ", `⭐ ${quizData?.pointsReward || 50} PTS`];
      else if (type === "question") computedTags = ["❓ QUESTION", "⚡ MATCH MOMENT"];
      else if (type === "poll") computedTags = ["📊 POLL", "⚡ 4-MIN LIVE"];
      else if (type === "prediction") computedTags = ["🎯 PREDICTION", "💎 +10 SXP", "⚡ 4-MIN LIVE"];
      else if (type === "debate") computedTags = ["⚖️ DEBATE", "🔥 LIVE VERDICT"];
      else if (type === "express") computedTags = ["⚡ EXPRESS", "🚀 PULSE"];
      else if (type === "meme") computedTags = ["🔥 MEME ARENA", "😂 VIRAL"];
      else computedTags = ["⚡ MATCH MOMENT", "🔥 LIVE"];
    }

    // Default timer: standard 4 minutes for all live match moments
    const matchMomentDurationMins = Number(
      body.durationMinutes ||
      body.timerMinutes ||
      pollData?.durationMinutes ||
      pollData?.timerMinutes ||
      predictionData?.durationMinutes ||
      predictionData?.timerMinutes ||
      body.debateData?.durationMinutes ||
      body.debateData?.timerMinutes ||
      body.expressData?.durationMinutes ||
      body.expressData?.timerMinutes ||
      body.questionData?.durationMinutes ||
      body.questionData?.timerMinutes ||
      (type === "quiz" ? 600 : 4)
    );

    const pollDurationMins = Number(pollData?.durationMinutes || pollData?.timerMinutes || matchMomentDurationMins || 4);
    const predDurationMins = Number(predictionData?.durationMinutes || predictionData?.timerMinutes || matchMomentDurationMins || 4);
    const quizDurationMins = Number(quizData?.durationMinutes || quizData?.timerMinutes || 600);

    const computedExpiresAt =
      expiresAt ||
      (type === "poll"
        ? pollData?.expiresAt || now + pollDurationMins * 60 * 1000
        : type === "prediction"
          ? predictionData?.expiresAt || now + predDurationMins * 60 * 1000
          : type === "debate"
            ? (body.debateData?.expiresAt || now + matchMomentDurationMins * 60 * 1000)
            : type === "express"
              ? (body.expressData?.expiresAt || now + matchMomentDurationMins * 60 * 1000)
              : type === "question"
                ? (body.questionData?.expiresAt || now + matchMomentDurationMins * 60 * 1000)
                : type === "quiz" && (quizData?.durationMinutes || quizData?.timerMinutes || quizData?.expiresAt)
                  ? quizData?.expiresAt || now + quizDurationMins * 60 * 1000
                  : now + matchMomentDurationMins * 60 * 1000);

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
      type === "poll" && (pollData || body.options)
        ? {
          ...(pollData || {}),
          question: pollData?.question || body.title || body.question || "",
          options: Array.isArray(pollData?.options) && pollData.options.length > 0
            ? pollData.options
            : Array.isArray(body.options)
            ? body.options.map((opt: any, idx: number) => ({
                id: opt.id || String(idx + 1),
                text: typeof opt === "string" ? opt : opt.text,
                votes: Number(opt.votes) || 0,
              }))
            : [],
          totalVotes: Number(pollData?.totalVotes) || 0,
          durationMinutes: pollDurationMins,
          timerMinutes: pollDurationMins,
          expiresAt: computedExpiresAt,
          correctAnswer: pollData?.correctAnswer || pollData?.answer || "",
          answer: pollData?.correctAnswer || pollData?.answer || "",
        }
        : undefined;

    const formattedPredData =
      type === "prediction" && (predictionData || body.options)
        ? {
          ...(predictionData || {}),
          question: predictionData?.question || body.title || body.question || "",
          options: Array.isArray(predictionData?.options) && predictionData.options.length > 0
            ? predictionData.options
            : Array.isArray(body.options)
            ? body.options.map((opt: any, idx: number) => ({
                id: opt.id || (idx === 0 ? "left" : idx === 1 ? "right" : String(idx + 1)),
                text: typeof opt === "string" ? opt : opt.text,
                votes: Number(opt.votes) || 0,
              }))
            : [],
          coinStake: Number(predictionData?.coinStake || body.coinStake || 10),
          durationMinutes: predDurationMins,
          timerMinutes: predDurationMins,
          expiresAt: computedExpiresAt,
          correctAnswer: predictionData?.correctAnswer || predictionData?.answer || "",
          answer: predictionData?.correctAnswer || predictionData?.answer || "",
          winningChoiceId:
            predictionData?.winningChoiceId ||
            body.winningChoiceId ||
            predictionData?.correctAnswer ||
            predictionData?.answer ||
            null,
          status: predictionData?.status || body.status || "open",
        }
        : undefined;

    const formattedDebateData =
      type === "debate" && (body.debateData || body.options || body.title)
        ? {
            question: body.debateData?.question || body.title || body.question || "",
            topic: body.debateData?.topic || body.title || "",
            options: Array.isArray(body.debateData?.options) && body.debateData.options.length > 0
              ? body.debateData.options
              : Array.isArray(body.options)
              ? body.options.map((opt: any, idx: number) => ({
                  id: opt.id || String(idx + 1),
                  text: typeof opt === "string" ? opt : opt.text,
                  votes: Number(opt.votes) || 0,
                }))
              : [],
            totalVotes: Number(body.debateData?.totalVotes) || 0,
            status: body.debateData?.status || body.status || "open",
            winningChoiceId: body.debateData?.winningChoiceId || body.winningChoiceId || null,
            verdict: body.debateData?.verdict || body.verdict || null,
            durationMinutes: matchMomentDurationMins,
            timerMinutes: matchMomentDurationMins,
            expiresAt: computedExpiresAt,
          }
        : undefined;

    const formattedExpressData =
      type === "express" && (body.expressData || body.options || body.title)
        ? {
            question: body.expressData?.question || body.prompt || body.title || "",
            prompt: body.expressData?.prompt || body.title || "",
            options: Array.isArray(body.expressData?.options) && body.expressData.options.length > 0
              ? body.expressData.options
              : Array.isArray(body.options)
              ? body.options.map((opt: any, idx: number) => ({
                  id: opt.id || String(idx + 1),
                  text: typeof opt === "string" ? opt : opt.text,
                  emoji: opt.emoji || "",
                  votes: Number(opt.votes) || 0,
                }))
              : [],
            totalVotes: Number(body.expressData?.totalVotes) || 0,
            durationMinutes: matchMomentDurationMins,
            timerMinutes: matchMomentDurationMins,
            expiresAt: computedExpiresAt,
          }
        : undefined;

    const formattedQuestionData =
      type === "question" && (body.questionData || body.options || body.title)
        ? {
            question: body.questionData?.question || body.question || body.title || "",
            options: Array.isArray(body.questionData?.options) && body.questionData.options.length > 0
              ? body.questionData.options
              : Array.isArray(body.options)
              ? body.options.map((opt: any, idx: number) => ({
                  id: opt.id || String.fromCharCode(65 + idx),
                  text: typeof opt === "string" ? opt : opt.text,
                  votes: Number(opt.votes) || 0,
                }))
              : [],
            correctOptionId: body.questionData?.correctOptionId || body.correctOptionId || body.correctAnswer || "",
            explanation: body.questionData?.explanation || body.explanation || "",
            pointsReward: Number(body.questionData?.pointsReward || body.pointsReward || 10),
            durationMinutes: matchMomentDurationMins,
            timerMinutes: matchMomentDurationMins,
            expiresAt: computedExpiresAt,
          }
        : undefined;

    const isDualMemeDetected = Boolean(
      memeData?.memeType === "dual" ||
      body.memeType === "dual" ||
      type === "meme_dual" ||
      memeData?.isDual ||
      body.isDual ||
      memeData?.imageUrlB ||
      body.imageUrlB ||
      memeData?.imageB ||
      body.imageB ||
      (Array.isArray(memeData?.options) && memeData.options.length >= 2) ||
      (Array.isArray(body.options) && body.options.length >= 2)
    );

    const resolvedMemeImgA =
      memeData?.imageUrlA ||
      memeData?.imageA ||
      body.imageUrlA ||
      body.imageA ||
      (Array.isArray(memeData?.options) && (memeData.options[0]?.imageUrl || memeData.options[0]?.image)) ||
      (Array.isArray(body.options) && (body.options[0]?.imageUrl || body.options[0]?.image)) ||
      memeData?.imageUrl ||
      resolvedImageUrl ||
      "";

    const resolvedMemeImgB =
      memeData?.imageUrlB ||
      memeData?.imageB ||
      body.imageUrlB ||
      body.imageB ||
      (Array.isArray(memeData?.options) && (memeData.options[1]?.imageUrl || memeData.options[1]?.image)) ||
      (Array.isArray(body.options) && (body.options[1]?.imageUrl || body.options[1]?.image)) ||
      "";

    const resolvedMemeLabelA =
      memeData?.labelA ||
      body.labelA ||
      (Array.isArray(memeData?.options) && (memeData.options[0]?.label || memeData.options[0]?.text)) ||
      (Array.isArray(body.options) && (body.options[0]?.label || body.options[0]?.text)) ||
      "Meme A";

    const resolvedMemeLabelB =
      memeData?.labelB ||
      body.labelB ||
      (Array.isArray(memeData?.options) && (memeData.options[1]?.label || memeData.options[1]?.text)) ||
      (Array.isArray(body.options) && (body.options[1]?.label || body.options[1]?.text)) ||
      "Meme B";

    const formattedMemeData: any =
      type === "meme" || type === "meme_dual"
        ? {
            imageUrl: resolvedMemeImgA || resolvedImageUrl || "",
            mediaUrl: resolvedMemeImgA || resolvedImageUrl || "",
            imageUrlA: resolvedMemeImgA,
            imageUrlB: resolvedMemeImgB,
            labelA: resolvedMemeLabelA,
            labelB: resolvedMemeLabelB,
            memeType: isDualMemeDetected ? "dual" : "single",
            isDual: isDualMemeDetected,
            options: isDualMemeDetected
              ? [
                  {
                    id: "meme_a",
                    label: resolvedMemeLabelA,
                    text: resolvedMemeLabelA,
                    imageUrl: resolvedMemeImgA,
                    votes: Number(memeData?.votesA || body.votesA) || 0,
                  },
                  {
                    id: "meme_b",
                    label: resolvedMemeLabelB,
                    text: resolvedMemeLabelB,
                    imageUrl: resolvedMemeImgB,
                    votes: Number(memeData?.votesB || body.votesB) || 0,
                  },
                ]
              : undefined,
            authorName: memeData?.authorName || creatorName || "SportsFan",
            authorHandle: memeData?.authorHandle || (creatorName ? `@${creatorName.toLowerCase().replace(/\s+/g, "")}` : "@sportsfan"),
            authorAvatar: memeData?.authorAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
            heatPercentage: memeData?.heatPercentage !== undefined ? Number(memeData.heatPercentage) : (memeData?.heatIndex !== undefined ? Number(memeData.heatIndex) : 0),
            totalVotes: Number(memeData?.totalVotes) || 0,
            reactions: memeData?.reactions || { mild: 0, funny: 0, hot: 0, fire: 0, nuclear: 0 },
            commentsCount: Number(memeData?.commentsCount) || 0,
            sharesCount: Number(memeData?.sharesCount) || 0,
            title: memeData?.title || title || "",
            caption: memeData?.caption || subtitle || description || "",
            description: memeData?.description || subtitle || description || "",
            createdAt: now,
          }
        : undefined;

    const rawScheduledTime =
      (body as any).startTime ||
      (body as any).scheduledStartTime ||
      (body as any).postingTime ||
      quizData?.startTime ||
      quizData?.scheduledStartTime ||
      quizData?.postingTime ||
      pollData?.startTime ||
      pollData?.scheduledStartTime ||
      predictionData?.startTime ||
      predictionData?.scheduledStartTime ||
      fanBattleData?.startTime ||
      fanBattleData?.scheduledStartTime;

    const startMs = rawScheduledTime
      ? typeof rawScheduledTime === "number"
        ? rawScheduledTime
        : new Date(rawScheduledTime).getTime()
      : now;

    const isFutureScheduled = Boolean(startMs && !isNaN(startMs) && startMs > now + 30000);

    const finalTitle =
      title ||
      quizData?.title ||
      quizData?.question ||
      pollData?.question ||
      pollData?.title ||
      predictionData?.question ||
      predictionData?.title ||
      memeData?.title ||
      memeData?.caption ||
      memeData?.description ||
      (fanBattleData?.leftCompetitor?.name && fanBattleData?.rightCompetitor?.name
        ? `${fanBattleData.leftCompetitor.name} vs ${fanBattleData.rightCompetitor.name}`
        : "") ||
      (fanBattleData as any)?.title ||
      (fanBattleData as any)?.topic ||
      (type ? `${type.charAt(0).toUpperCase() + type.slice(1).replace("_", " ")} Arena` : "SportsFan Arena");

    const newEngagement: EngagementItem & {
      startTime?: number;
      scheduledStartTime?: number;
      postingTime?: number;
      isScheduled?: boolean;
      notifiedLive?: boolean;
    } = {
      id,
      type,
      title: finalTitle,
      subtitle: subtitle || (isMeme ? formattedMemeData?.caption || formattedMemeData?.description || "" : ""),
      tags: computedTags,
      sport: (sport || "cricket").toLowerCase(),
      status: status || (isFutureScheduled ? "scheduled" : "active"),
      creatorId: creatorId || undefined,
      creatorEmail: creatorEmail || undefined,
      creatorName: creatorName || undefined,
      creatorAvatar: creatorAvatar || undefined,
      fanBattleData: type === "fan_battle" ? fanBattleData : undefined,
      quizData: formattedQuizData,
      pollData: formattedPollData,
      predictionData: formattedPredData,
      memeData: formattedMemeData,
      debateData: formattedDebateData,
      expressData: formattedExpressData,
      questionData: formattedQuestionData,
      options: body.options || formattedDebateData?.options || formattedExpressData?.options || formattedQuestionData?.options || formattedPollData?.options || formattedPredData?.options,
      winningChoiceId: body.winningChoiceId || formattedPredData?.winningChoiceId || formattedDebateData?.winningChoiceId || null,
      outcomeNotes: body.outcomeNotes || null,
      resolvedAt: body.resolvedAt || null,
      resolvedBy: body.resolvedBy || null,
      timerMinutes: matchMomentDurationMins,
      durationMinutes: matchMomentDurationMins,
      likes: Number(likes) || 0,
      shares: Number(shares) || 0,
      totalEngaged: Number(totalEngaged) || 0,
      startTime: startMs,
      scheduledStartTime: startMs,
      postingTime: startMs,
      isScheduled: isFutureScheduled,
      notifiedLive: !isFutureScheduled,
      createdAt: now,
      updatedAt: now,
      expiresAt: computedExpiresAt,
      category: body.category || (body.isMatchMoment || formattedDebateData || formattedExpressData || formattedQuestionData ? "match_moment" : (type === "fan_battle" || type === "meme" ? "fliparena" : undefined)),
      source: body.source || (body.isMatchMoment || formattedDebateData || formattedExpressData || formattedQuestionData ? "match_moment" : "fliparena"),
      isMatchMoment: body.isMatchMoment !== undefined ? Boolean(body.isMatchMoment) : Boolean(formattedDebateData || formattedExpressData || formattedQuestionData || (type !== "meme" && type !== "fan_battle" && matchMomentDurationMins === 4)),
      matchId: body.matchId || undefined,
      momentId: body.momentId || body.loopId || undefined,
      loopId: body.loopId || body.momentId || undefined,
      matchPhase: body.matchPhase || undefined,
      anchorTrigger: body.anchorTrigger || undefined,
      scoreState: body.scoreState || undefined,
      sportsMoment: body.sportsMoment || undefined,
      overNumber: body.overNumber !== undefined ? body.overNumber : undefined,
      innings: body.innings !== undefined ? Number(body.innings) : undefined,
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

    // If this engagement belongs to a match moment (or has matchId), dual-write to MatchMoments table
    if (newEngagement.isMatchMoment || newEngagement.source === "match_moment" || newEngagement.matchId) {
      try {
        await dualWrite({
          tableName: TABLES.MatchMoments,
          dynamoItem: {
            entityId: `MATCH#${newEngagement.matchId || "GLOBAL"}`,
            sk: `LOOP#${newEngagement.loopId || id}`,
            contentId: `ENGAGEMENT#${id}`,
            ...newEngagement,
          },
          collectionName: "match_moments_engagements",
          docId: `${newEngagement.matchId || "GLOBAL"}_${newEngagement.loopId || id}`,
          firestoreData: newEngagement,
        });
      } catch (mmErr) {
        console.warn("[POST /api/engagements] MatchMoments table dual-write notice:", mmErr);
      }
    }

    // Award +2 points to creator for creating an engagement (quiz, poll, prediction, fan battle, meme)
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
          engagementTitle: finalTitle,
          syncQuizLeaderboard: true,
        });
        if (ptsResult.success) {
          pointsAwarded = ptsResult.pointsAwarded;
        }
      } catch (awardErr) {
        console.warn("[POST /api/engagements] Creator points award notice:", awardErr);
      }
    }

    // Dispatch 60-Minute Aggregated Content Drop Notification asynchronously (fire-and-forget) so creation is instant
    if (!isFutureScheduled) {
      dispatchFlipArenaContentDropNotification({
        engagementId: id,
        engagementType: type,
        engagementTitle: finalTitle,
        creatorId,
        creatorName,
        creatorAvatar: newEngagement.creatorAvatar,
      }).catch((dropNotifErr) => {
        console.warn("[POST /api/engagements] Background content drop notification notice:", dropNotifErr);
      });
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

// ─── DELETE /api/engagements?id=... ─────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawId = searchParams.get("id");
    const rawMatchId = searchParams.get("matchId");

    if (!rawId) {
      return NextResponse.json({ success: false, error: "Missing engagement id" }, { status: 400 });
    }

    const cleanId = rawId.replace(/^ENGAGEMENT#/, "").replace(/^LOOP#/, "").trim();
    const cleanMatchId = rawMatchId ? rawMatchId.replace(/^MATCH#/, "").trim() : "";

    // 1. Delete from SocialAndContent table (with candidate table fallback)
    try {
      await dualDelete(
        "engagements",
        cleanId,
        TABLES.SocialAndContent,
        {
          contentId: `ENGAGEMENT#${cleanId}`,
          sk: "ENGAGEMENT#META",
        }
      );
    } catch (e) {
      console.warn("Notice deleting from SocialAndContent:", e);
    }

    // 2. Delete from MatchMoments table (MatchMoments-dev, MatchMoments-release, MatchMoments)
    try {
      const matchMomentTables = getCandidateTableNames(TABLES.MatchMoments);
      for (const table of matchMomentTables) {
        try {
          // If matchId is known, delete direct key
          if (cleanMatchId) {
            await docClient.send(
              new DeleteCommand({
                TableName: table,
                Key: {
                  entityId: `MATCH#${cleanMatchId}`,
                  sk: `LOOP#${cleanId}`,
                },
              })
            );
          }

          // Also scan and delete any item matching this id / loopId in MatchMoments
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: table,
              FilterExpression:
                "sk = :loopSk OR begins_with(sk, :loopPfx) OR id = :cid OR loopId = :cid OR contentId = :engCid",
              ExpressionAttributeValues: {
                ":loopSk": `LOOP#${cleanId}`,
                ":loopPfx": `LOOP#${cleanId}`,
                ":cid": cleanId,
                ":engCid": `ENGAGEMENT#${cleanId}`,
              },
              Limit: 50,
            })
          );

          if (scanRes.Items && scanRes.Items.length > 0) {
            for (const item of scanRes.Items) {
              if (item.entityId && item.sk) {
                await docClient.send(
                  new DeleteCommand({
                    TableName: table,
                    Key: {
                      entityId: item.entityId,
                      sk: item.sk,
                    },
                  })
                );
              }
            }
          }
        } catch (tblErr) {
          // Continue to next candidate table
        }
      }
    } catch (mmErr) {
      console.warn("Notice deleting from MatchMoments:", mmErr);
    }

    // 3. Delete from Firestore match_moments_engagements collection if present
    try {
      if (db) {
        const snap = await db.collection("match_moments_engagements").where("id", "==", cleanId).get();
        for (const doc of snap.docs) {
          await doc.ref.delete();
        }
        if (cleanMatchId) {
          await db.collection("match_moments_engagements").doc(`${cleanMatchId}_${cleanId}`).delete().catch(() => {});
        }
      }
    } catch {}

    return NextResponse.json({ success: true, message: `Engagement ${cleanId} deleted successfully` });
  } catch (error: unknown) {
    console.error("DELETE /api/engagements error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete engagement";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
