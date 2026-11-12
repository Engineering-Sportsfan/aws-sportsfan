// app/api/engagements/route.ts — Main CRUD API for Fan Battles, Quizzes, Polls, Predictions & Meme Voting
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { ScanCommand, PutCommand, GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem, EngagementType, EngagementStatus, MemePayload, MemeRatingChoice } from "@/types/engagements";
import { getUser } from "@/lib/getUser";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import { dispatchFlipArenaContentDropNotification } from "@/lib/notifications";
import cloudinary from "@/lib/cloudinary";
import { primaryOptions } from "@/lib/engagementSocial";
import { findEngagementById } from "@/lib/engagementPersistence";
import { cacheService } from "@/lib/cacheService";
import {
  LIST_CACHE_TTL_SECONDS,
  getUserInteractions,
  hydratePublicStats,
  isGsiEnabled,
  isMissingIndexError,
  parseBefore,
  parseListLimit,
  queryEngagementIndex,
  sourcePartitionsFor,
  withEngagementGsiKeys,
} from "@/lib/engagementList";
import { parseMatchStartMs } from "@/lib/matchMomentTimeline";

export const dynamic = "force-dynamic";

// ─── GET /api/engagements — Fetch list with filtering ────────────────────────
export async function GET(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as EngagementType | null; // fan_battle | quiz | poll | prediction
    const status = searchParams.get("status"); // active | inactive | all
    const sport = searchParams.get("sport"); // cricket | football | etc
    // Pagination: `limit` (default 15, max 50) and `before` (createdAt ms; only items older than it, newest first).
    const limit = parseListLimit(searchParams.get("limit"));
    const before = parseBefore(searchParams.get("before"));
    const includeAllEnvs = searchParams.get("allEnvs") === "true";
    // GSI mode is opt-in (ENGAGEMENTS_GSI_ENABLED=true) and only for lists the index can answer completely.
    // allEnvs / matchId requests keep the legacy path. Without the flag (or if the index is missing) the Scan path runs.
    const gsiRequested = isGsiEnabled() && !includeAllEnvs && !searchParams.get("matchId");

    const buildBase = async (useGsi: boolean) => {
    const itemsMap = new Map<string, EngagementItem>();
    const tsById = new Map<string, number>();
    const partitions = sourcePartitionsFor({
      source: searchParams.get("source"),
      category: searchParams.get("category"),
      excludeFlipArena: searchParams.get("excludeFlipArena") === "true",
      excludeMatchMoments: searchParams.get("excludeMatchMoments") === "true",
    });
    const gsiRows = Math.min(100, limit * 2 + 1);

    // One round = one fetch of the source rows (Scan in legacy mode, one GSI Query page per partition in GSI mode).
    const loadRound = async (cursor: number | null): Promise<{ exhausted: boolean; nextCursor: number | null }> => {
    let exhausted = true;
    let nextCursor: number | null = null;
    const noteGsi = (r: { exhausted: boolean; cursorTs: number | null }) => {
      if (r.exhausted) return;
      exhausted = false;
      if (r.cursorTs != null) nextCursor = nextCursor == null ? r.cursorTs : Math.min(nextCursor, r.cursorTs);
    };

    // 1. Fetch from DynamoDB SocialAndContent table (with candidate table fallback)
    const candidateTables = useGsi ? [TABLES.SocialAndContent] : getCandidateTableNames(TABLES.SocialAndContent);
    for (const table of candidateTables) {
      try {
        // Read every page: Limit is applied BEFORE the filter, so a single 100-row page returned a
        // different, incomplete set of engagements on each call.
        const scanItems: any[] = [];
        if (useGsi) {
          const r = await queryEngagementIndex(table, partitions, cursor, gsiRows);
          scanItems.push(...r.items);
          noteGsi(r);
        } else {
        let scanKey: Record<string, any> | undefined;
        do {
          const page = await docClient.send(
            new ScanCommand({
              TableName: table,
              FilterExpression: "begins_with(contentId, :prefix) AND (sk = :metaSk OR attribute_not_exists(sk))",
              ExpressionAttributeValues: {
                ":prefix": "ENGAGEMENT#",
                ":metaSk": "ENGAGEMENT#META",
              },
              ExclusiveStartKey: scanKey,
            })
          );
          scanItems.push(...(page.Items || []));
          scanKey = page.LastEvaluatedKey;
        } while (scanKey);
        }
        const scanRes = { Items: scanItems };

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
                inputPlaceholder: it.inputPlaceholder || it.expressData?.placeholder || undefined,
                questionData: it.questionData,
                followData: it.followData || undefined,
                matchResultData: it.matchResultData || undefined,
                postLock: it.postLock ?? it.questionData?.postLock ?? "",
                winningChoiceId: it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
                outcomeWinningChoiceId: it.outcomeWinningChoiceId || it.winningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
                outcomeNotes: it.outcomeNotes || null,
                resolvedAt: it.resolvedAt || null,
                resolvedBy: it.resolvedBy || null,
                timerMinutes: (it.type === "follow" || it.type === "match_result") ? undefined : (it.timerMinutes || it.durationMinutes || 4),
                durationMinutes: (it.type === "follow" || it.type === "match_result") ? undefined : (it.durationMinutes || it.timerMinutes || 4),
                memeType: it.memeType || it.memeData?.memeType,
                options: it.options || it.memeData?.options || it.debateData?.options || it.expressData?.options || it.questionData?.options || it.pollData?.options || it.predictionData?.options,
                imageUrlA: it.imageUrlA || it.memeData?.imageUrlA,
                imageUrlB: it.imageUrlB || it.memeData?.imageUrlB,
                labelA: it.labelA || it.memeData?.labelA,
                labelB: it.labelB || it.memeData?.labelB,
                likes: Number(it.likes) || 0,
                shares: Number(it.shares) || 0,
                impressions: Number(it.impressions ?? it.impressionsCount) || 0,
                totalEngaged: Number(it.totalEngaged) || 0,
                createdAt: it.createdAt || Date.now(),
                updatedAt: it.updatedAt || Date.now(),
                startTime: it.startTime ?? it.scheduledStartTime ?? it.postingTime ?? undefined,
                scheduledStartTime: it.scheduledStartTime ?? it.startTime ?? it.postingTime ?? undefined,
                postingTime: it.postingTime ?? it.scheduledStartTime ?? it.startTime ?? undefined,
                isScheduled: Boolean(it.isScheduled),
                notifiedLive: it.notifiedLive !== undefined ? Boolean(it.notifiedLive) : undefined,
                expiresAt:
                  (it.type === "follow" || it.type === "match_result")
                    ? null
                    : (it.expiresAt ||
                        (it.createdAt && (it.timerMinutes || it.durationMinutes)
                          ? Number(it.createdAt) + Number(it.timerMinutes || it.durationMinutes || 4) * 60 * 1000
                          : null)),
                category: it.category || (it.isMatchMoment ? "match_moment" : (it.type === "fan_battle" || it.type === "meme" ? "fliparena" : undefined)),
                source: it.source || (it.isMatchMoment ? "match_moment" : "fliparena"),
                isMatchMoment: it.isMatchMoment !== undefined ? Boolean(it.isMatchMoment) : Boolean(it.debateData || it.expressData || it.questionData || it.followData || it.matchResultData || it.type === "follow" || it.type === "match_result" || it.tags?.some((t: string) => t.includes("MATCH MOMENT") || t.includes("4-MIN"))),
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
          break; // Active environment table only
        }
      } catch (dynErr: any) {
        if (useGsi && isMissingIndexError(dynErr)) throw dynErr; // -> caller falls back to the Scan path
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
    const matchMomentTables = useGsi ? [TABLES.MatchMoments] : getCandidateTableNames(TABLES.MatchMoments);
    const rawSearchMatchId = searchParams.get("matchId");
    const cleanSearchMatchId = rawSearchMatchId ? rawSearchMatchId.replace(/^MATCH#/, "") : null;
    for (const table of matchMomentTables) {
      try {
        let loopItems: any[] = [];
        if (cleanSearchMatchId) {
          try {
            let qKey: Record<string, any> | undefined;
            do {
              const qRes = await docClient.send(
                new QueryCommand({
                  TableName: table,
                  KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
                  ExpressionAttributeValues: {
                    ":eId": `MATCH#${cleanSearchMatchId}`,
                    ":skpfx": "LOOP#",
                  },
                  ExclusiveStartKey: qKey,
                })
              );
              loopItems.push(...(qRes.Items || []));
              qKey = qRes.LastEvaluatedKey;
            } while (qKey);
          } catch (e) {
            loopItems = [];
          }
        } else if (useGsi) {
          const r = await queryEngagementIndex(table, partitions, cursor, gsiRows);
          loopItems.push(...r.items);
          noteGsi(r);
        } else {
          let sKey: Record<string, any> | undefined;
          do {
            const sRes = await docClient.send(
              new ScanCommand({
                TableName: table,
                FilterExpression: "begins_with(sk, :skpfx)",
                ExpressionAttributeValues: {
                  ":skpfx": "LOOP#",
                },
                ExclusiveStartKey: sKey,
              })
            );
            loopItems.push(...(sRes.Items || []));
            sKey = sRes.LastEvaluatedKey;
          } while (sKey);
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

                const existingStatus = (existing.status as string) || "";
                const itStatus = (it.status as string) || "";

                const isSettled = Boolean(
                  mergedWinningId ||
                  existingStatus === "settled" ||
                  existingStatus === "resolved" ||
                  itStatus === "settled" ||
                  itStatus === "resolved"
                );

                const mergedStatus: EngagementStatus = isSettled
                  ? "settled"
                  : (existingStatus && existingStatus !== "pending"
                      ? (existing.status as EngagementStatus)
                      : (it.status as EngagementStatus) || "active");

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
                  expressData: it.expressData || existing.expressData,
                  questionData: it.questionData || existing.questionData,
                  followData: it.followData || existing.followData,
                  matchResultData: it.matchResultData || existing.matchResultData,
                  type: existing.type || it.type || "poll",
                  options: it.options || existing.options,
                  momentId: it.momentId || existing.momentId,
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
              inputPlaceholder: it.inputPlaceholder || it.expressData?.placeholder || undefined,
              questionData: it.questionData,
              followData: it.followData || undefined,
              matchResultData: it.matchResultData || undefined,
              postLock: it.postLock ?? it.questionData?.postLock ?? "",
              winningChoiceId: it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeWinningChoiceId: it.outcomeWinningChoiceId || it.winningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeNotes: it.outcomeNotes || null,
              resolvedAt: it.resolvedAt || null,
              resolvedBy: it.resolvedBy || null,
              timerMinutes: (it.type === "follow" || it.type === "match_result") ? undefined : (it.timerMinutes || 4),
              durationMinutes: (it.type === "follow" || it.type === "match_result") ? undefined : (it.durationMinutes || 4),
              options: it.options || it.pollData?.options || it.predictionData?.options || it.debateData?.options || it.expressData?.options || it.questionData?.options,
              likes: Number(it.likes) || 0,
              shares: Number(it.shares) || 0,
              impressions: Number(it.impressions) || 0,
              totalEngaged: Number(it.totalEngaged) || 0,
              commentsCount: Number(it.commentsCount) || 0,
              createdAt: it.createdAt || Date.now(),
              updatedAt: it.updatedAt || Date.now(),
              startTime: it.startTime ?? it.scheduledStartTime ?? it.postingTime ?? undefined,
              scheduledStartTime: it.scheduledStartTime ?? it.startTime ?? it.postingTime ?? undefined,
              postingTime: it.postingTime ?? it.scheduledStartTime ?? it.startTime ?? undefined,
              isScheduled: Boolean(it.isScheduled),
              notifiedLive: it.notifiedLive !== undefined ? Boolean(it.notifiedLive) : undefined,
              expiresAt: (it.type === "follow" || it.type === "match_result") ? null : (it.expiresAt || null),
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
          break; // Active environment table only
        }
      } catch (mmErr: any) {
        if (useGsi && isMissingIndexError(mmErr)) throw mmErr; // -> caller falls back to the Scan path
        // Continue to next candidate table
      }
    }

    // 2. Fetch from Firestore 'engagements' collection and merge
    // (Skipped in GSI mode: DynamoDB is dual-written and a full Firestore collection read is what we are removing.)
    if (db && !useGsi) {
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
              inputPlaceholder: it.inputPlaceholder || it.expressData?.placeholder || undefined,
              questionData: it.questionData,
              followData: it.followData || undefined,
              matchResultData: it.matchResultData || undefined,
              postLock: it.postLock ?? it.questionData?.postLock ?? "",
              winningChoiceId: it.winningChoiceId || it.outcomeWinningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeWinningChoiceId: it.outcomeWinningChoiceId || it.winningChoiceId || it.predictionData?.winningChoiceId || it.debateData?.winningChoiceId || null,
              outcomeNotes: it.outcomeNotes || null,
              resolvedAt: it.resolvedAt || null,
              resolvedBy: it.resolvedBy || null,
              timerMinutes: (it.type === "follow" || it.type === "match_result") ? undefined : (it.timerMinutes || it.durationMinutes || 4),
              durationMinutes: (it.type === "follow" || it.type === "match_result") ? undefined : (it.durationMinutes || it.timerMinutes || 4),
              memeType: it.memeType || it.memeData?.memeType,
              options: it.options || it.memeData?.options || it.debateData?.options || it.expressData?.options || it.questionData?.options || it.pollData?.options || it.predictionData?.options,
              imageUrlA: it.imageUrlA || it.memeData?.imageUrlA,
              imageUrlB: it.imageUrlB || it.memeData?.imageUrlB,
              labelA: it.labelA || it.memeData?.labelA,
              labelB: it.labelB || it.memeData?.labelB,
              likes: Number(it.likes) || 0,
              shares: Number(it.shares) || 0,
              impressions: Number(it.impressions) || 0,
              totalEngaged: Number(it.totalEngaged) || 0,
              createdAt: it.createdAt || Date.now(),
              updatedAt: it.updatedAt || Date.now(),
              startTime: it.startTime ?? it.scheduledStartTime ?? it.postingTime ?? undefined,
              scheduledStartTime: it.scheduledStartTime ?? it.startTime ?? it.postingTime ?? undefined,
              postingTime: it.postingTime ?? it.scheduledStartTime ?? it.startTime ?? undefined,
              isScheduled: Boolean(it.isScheduled),
              notifiedLive: it.notifiedLive !== undefined ? Boolean(it.notifiedLive) : undefined,
              expiresAt:
                (it.type === "follow" || it.type === "match_result")
                  ? null
                  : (it.expiresAt ||
                      (it.createdAt && (it.timerMinutes || it.durationMinutes)
                        ? Number(it.createdAt) + Number(it.timerMinutes || it.durationMinutes || 4) * 60 * 1000
                        : null)),
              category: it.category || (it.isMatchMoment ? "match_moment" : (it.type === "fan_battle" || it.type === "meme" ? "fliparena" : undefined)),
              source: it.source || (it.isMatchMoment ? "match_moment" : "fliparena"),
              isMatchMoment: it.isMatchMoment !== undefined ? Boolean(it.isMatchMoment) : Boolean(it.debateData || it.expressData || it.questionData || it.followData || it.matchResultData || it.type === "follow" || it.type === "match_result" || it.tags?.some((t: string) => t.includes("MATCH MOMENT") || t.includes("4-MIN"))),
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

    return { exhausted, nextCursor };
    };

    // Sort + filter everything loaded so far. `floor` (GSI mode, more rows remain) drops rows at/below the oldest
    // fetched timestamp, because older rows from the other source may not have been fetched yet.
    const finalize = (floor: number | null): EngagementItem[] => {
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
    const includeScheduled = searchParams.get("includeScheduled") === "true";

    const getScheduledMs = (it: any): number => {
      const raw =
        it.scheduledStartTime ??
        it.startTime ??
        it.postingTime ??
        it.quizData?.scheduledStartTime ??
        it.pollData?.scheduledStartTime ??
        it.predictionData?.scheduledStartTime ??
        it.fanBattleData?.scheduledStartTime ??
        0;
      if (!raw) return 0;
      if (typeof raw === "number") return raw;
      const parsed = new Date(raw).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    // Normalize effective status (scheduled items whose launch time has arrived become active)
    // and gate future-scheduled items unless admin explicitly requests includeScheduled=true.
    items = items
      .map((i) => {
        const schedMs = getScheduledMs(i);
        const rawStatus = String(i.status || "active").toLowerCase();
        const isWaitingSchedule =
          (rawStatus === "scheduled" || Boolean((i as any).isScheduled)) && schedMs > nowMs;
        if (!isWaitingSchedule && rawStatus === "scheduled") {
          return { ...i, status: "active" as any };
        }
        return i;
      })
      .filter((i) => {
        if (includeScheduled || status === "scheduled" || status === "all") return true;
        const schedMs = getScheduledMs(i);
        const rawStatus = String(i.status || "active").toLowerCase();
        if (rawStatus === "scheduled") return false;
        if (Boolean((i as any).isScheduled) && schedMs > nowMs) return false;
        return true;
      });

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
        // When explicitly requesting match_moment items, exclude non-match general polls/quizzes
        if (sourceParam === "match_moment" || categoryParam === "match_moment") {
          const hasMatchOrMoment = Boolean((i as any).matchId && (i as any).matchId !== "GLOBAL") || Boolean((i as any).momentId || (i as any).loopId);
          if (!hasMatchOrMoment && (i as any).source !== "match_moment" && i.isMatchMoment !== true) return false;
        }
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
        if (i.type === "debate" || i.type === "express" || i.type === "question" || i.type === "follow" || i.type === "match_result") return false;
        if (Boolean(i.debateData || i.expressData || i.questionData || (i as any).followData || (i as any).matchResultData)) return false;
        if (Array.isArray(i.tags) && i.tags.some(t => t.toUpperCase().includes("MATCH MOMENT") || t.toUpperCase().includes("4-MIN"))) return false;
        return true;
      });
    }

    if (before != null) items = items.filter(i => getItemTimestamp(i) < before);
    if (floor != null) items = items.filter(i => getItemTimestamp(i) > floor);
    for (const i of items) tsById.set(String(i.id), getItemTimestamp(i));
    return items;
    };

    // Fetch rounds. Legacy mode: one round (everything). GSI mode: keep paging the index until the filtered
    // list holds limit+1 items (so we know whether there is a next page) or the index is exhausted.
    const MAX_ROUNDS = 5;
    let page: EngagementItem[] = [];
    let moreInIndex = false;
    let floor: number | null = null;
    let cursor: number | null = before;
    for (let round = 0; ; round++) {
      const r = await loadRound(cursor);
      moreInIndex = !r.exhausted;
      floor = useGsi && moreInIndex ? r.nextCursor : null;
      page = finalize(floor);
      if (!useGsi || page.length > limit || r.exhausted || r.nextCursor == null || round >= MAX_ROUNDS - 1) break;
      cursor = r.nextCursor;
    }

    const hasMore = page.length > limit || (useGsi && moreInIndex);
    const returned = page.slice(0, limit);
    const lastItem = returned[returned.length - 1];
    const nextBefore = hasMore ? (lastItem ? tsById.get(String(lastItem.id)) ?? null : floor) : null;

    // Public stats (likes/shares/comments/votes) only for the items on this page, in small parallel chunks.
    await hydratePublicStats(returned);
    for (const it of returned) {
      delete (it as any).engSource;
      delete (it as any).engCreatedAt;
    }

    // Check if any scheduled engagement has just become live and needs notification
    const nowMs = Date.now();
    for (const it of returned) {
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
            await dualWrite("engagements", it.id, TABLES.SocialAndContent, withEngagementGsiKeys({
              contentId: `ENGAGEMENT#${it.id}`,
              sk: "ENGAGEMENT#META",
              entityId: `ENGAGEMENT#${it.type.toUpperCase()}`,
              ...it,
              notifiedLive: true,
            }));
          } catch (e) {
            console.warn("[GET /api/engagements] Scheduled live notify notice:", e);
          }
        })();
      }
    }

    return { items: returned, hasMore, nextBefore };
    };

    // ── Base list: user-independent, cached 5s (Upstash, in-memory fallback) ─────────────────────────
    type BaseList = { items: EngagementItem[]; hasMore: boolean; nextBefore: number | null };
    const cacheKey = "engagements:list:v1:" + JSON.stringify([
      searchParams.get("source") || "",
      searchParams.get("category") || "",
      searchParams.get("excludeFlipArena") || "",
      searchParams.get("excludeMatchMoments") || "",
      type || "",
      status || "",
      sport || "",
      searchParams.get("matchId") || "",
      includeAllEnvs,
      limit,
      before ?? "",
    ]);
    let base = await cacheService.get<BaseList>(cacheKey);
    if (!base) {
      try {
        base = await buildBase(gsiRequested);
      } catch (err) {
        if (gsiRequested && isMissingIndexError(err)) {
          console.warn("[GET /api/engagements] EngagementsBySource GSI missing; falling back to Scan:", (err as Error)?.message);
          base = await buildBase(false);
        } else {
          throw err;
        }
      }
      await cacheService.set(cacheKey, base, LIST_CACHE_TTL_SECONDS);
    }

    // ── Per-user fields (userLiked / userVoted / userVote), merged on top of the shared base ──────────
    const targetUserId = searchParams.get("userId");
    const candidateIds = Array.from(
      new Set(
        targetUserId
          ? [targetUserId, targetUserId.includes("@") ? targetUserId.replace(/[@.]/g, "_") : null].filter(Boolean)
          : [authUser?.userId, authUser?.email].filter(Boolean)
      )
    ) as string[];

    let items: EngagementItem[] = base.items;
    if (candidateIds.length > 0 && items.length > 0) {
      const quizIds = new Set(items.filter((i) => i.type === "quiz").map((i) => String(i.id)));
      const mine = await getUserInteractions(items.map((i) => String(i.id)), quizIds, candidateIds);
      items = items.map((it) => {
        const u = mine.get(String(it.id));
        return {
          ...it,
          userLiked: u?.liked ?? false,
          userVoted: (u?.vote ?? null) !== null,
          userVote: u?.vote ?? null,
          ...(it.type === "follow"
            ? { userFollowing: u?.following ?? false, userReminded: u?.reminded ?? false }
            : {}),
        };
      });
    }

    // Per-user responses stay private. The anonymous list is identical for everyone, so a CDN may hold it briefly
    // (Vary keeps an authenticated request from being served the anonymous copy).
    const headers: Record<string, string> =
      candidateIds.length === 0
        ? { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10", Vary: "Authorization, Cookie" }
        : { "Cache-Control": "private, no-store" };

    return NextResponse.json(
      {
        success: true,
        engagements: items,
        total: items.length,
        pagination: { hasMore: base.hasMore, nextBefore: base.nextBefore },
      },
      { headers }
    );
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

    // Re-submitting an existing id is an edit (admin "Update Engagement"): keep fan activity and the outcome,
    // and don't award creator points / send the content-drop notification again.
    // The timer restarts from now with the submitted minutes (4m -> 2m edit counts down from 2m).
    const existingEngagement: any = body.id ? (await findEngagementById(String(body.id), body.matchId))?.item || null : null;
    const isEdit = Boolean(existingEngagement);
    if (isEdit && Array.isArray(body.options)) {
      const prevOptions: any[] = primaryOptions(existingEngagement) || [];
      body.options = body.options.map((opt: any) => {
        const prev = prevOptions.find((p) => String(p?.id) === String(opt?.id));
        return prev && opt?.votes == null ? { ...opt, votes: Number(prev.votes) || 0 } : opt;
      });
    }

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
      else if (type === "follow") computedTags = ["🔔 FOLLOW", "📅 UPCOMING MATCH"];
      else if (type === "match_result") computedTags = ["🏆 MATCH RESULT", "⭐ TOP PERFORMER"];
      else if (type === "meme") computedTags = ["🔥 MEME ARENA", "😂 VIRAL"];
      else computedTags = ["⚡ MATCH MOMENT", "🔥 LIVE"];
    }

    const rawScheduledTimeEarly =
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

    const scheduledMsEarly = rawScheduledTimeEarly
      ? typeof rawScheduledTimeEarly === "number"
        ? rawScheduledTimeEarly
        : new Date(rawScheduledTimeEarly).getTime()
      : now;
    const isScheduledFutureEarly = Boolean(scheduledMsEarly && !isNaN(scheduledMsEarly) && scheduledMsEarly > now + 30000);
    const timerAnchorMs = isScheduledFutureEarly ? scheduledMsEarly : now;

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

    const isNoTimerType = type === "follow" || type === "match_result";
    const computedExpiresAt = isNoTimerType
      ? null
      : expiresAt ||
        (type === "poll"
          ? pollData?.expiresAt || timerAnchorMs + pollDurationMins * 60 * 1000
          : type === "prediction"
            ? predictionData?.expiresAt || timerAnchorMs + predDurationMins * 60 * 1000
            : type === "debate"
              ? (body.debateData?.expiresAt || timerAnchorMs + matchMomentDurationMins * 60 * 1000)
              : type === "express"
                ? (body.expressData?.expiresAt || timerAnchorMs + matchMomentDurationMins * 60 * 1000)
                : type === "question"
                  ? (body.questionData?.expiresAt || timerAnchorMs + matchMomentDurationMins * 60 * 1000)
                  : type === "quiz" && (quizData?.durationMinutes || quizData?.timerMinutes || quizData?.expiresAt)
                    ? quizData?.expiresAt || timerAnchorMs + quizDurationMins * 60 * 1000
                    : timerAnchorMs + matchMomentDurationMins * 60 * 1000);

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

    const rawExpressOptions =
      Array.isArray(body.expressData?.options) && body.expressData.options.length > 0
        ? body.expressData.options
        : Array.isArray(body.options) && body.options.length > 0
        ? body.options.map((opt: any, idx: number) => ({
            id: opt.id || String(idx + 1),
            text: typeof opt === "string" ? opt : opt.text,
            emoji: opt.emoji || "",
            votes: Number(opt.votes) || 0,
          }))
        : [];
    const expressResponseMode =
      body.expressData?.responseMode ||
      (rawExpressOptions.length > 0 ? "options" : "text");
    const expressPlaceholderText = String(
      body.expressData?.placeholder || body.inputPlaceholder || "Write your thoughts..."
    ).trim();

    const formattedExpressData =
      type === "express" && (body.expressData || body.options || body.title || body.prompt)
        ? {
            question: body.expressData?.question || body.prompt || body.title || "",
            prompt: body.expressData?.prompt || body.prompt || body.title || "",
            responseMode: expressResponseMode,
            placeholder: expressPlaceholderText,
            options: expressResponseMode === "text" ? [] : rawExpressOptions,
            totalVotes: Number(body.expressData?.totalVotes) || 0,
            totalResponses:
              Number(body.expressData?.totalResponses) ||
              Number(body.expressData?.totalVotes) ||
              0,
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
            postLock: String(body.questionData?.postLock ?? body.postLock ?? "").trim(),
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

    let resolvedSeriesId = String(body.seriesId || existingEngagement?.seriesId || "").trim();
    const resolvedMatchIdStr = String(body.matchId || existingEngagement?.matchId || "").replace(/^MATCH#/i, "").trim();
    const resolvedMomentIdStr = String(body.momentId || body.loopId || existingEngagement?.momentId || "").replace(/^MOMENT#/i, "").trim();
    const rawFollowStartInput =
      body.followData?.matchStartMs ??
      body.followData?.matchStartTime ??
      body.matchStartMs ??
      body.matchStartTime ??
      existingEngagement?.followData?.matchStartMs;
    const parseTimestampMs = (raw: unknown): number | undefined => {
      if (raw === undefined || raw === null || raw === "") return undefined;
      if (typeof raw === "number") {
        if (!Number.isFinite(raw) || raw <= 0) return undefined;
        return raw < 1e11 ? raw * 1000 : raw;
      }
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) return num < 1e11 ? num * 1000 : num;
      const parsed = new Date(String(raw)).getTime();
      return !Number.isNaN(parsed) && parsed > 0 ? parsed : undefined;
    };
    let resolvedFollowStartMs = parseTimestampMs(rawFollowStartInput);

    if ((!resolvedSeriesId || (type === "follow" && !resolvedFollowStartMs)) && resolvedMatchIdStr) {
      const mmTables = Array.from(new Set([TABLES.MatchMoments, TABLES.SportsData]));
      for (const tbl of mmTables) {
        try {
          if (!resolvedSeriesId && resolvedMomentIdStr) {
            const momRes = await docClient.send(
              new GetCommand({
                TableName: tbl,
                Key: { entityId: `MATCH#${resolvedMatchIdStr}`, sk: `MOMENT#${resolvedMomentIdStr}` },
              })
            );
            if (momRes.Item?.seriesId) {
              resolvedSeriesId = String(momRes.Item.seriesId).trim();
            }
          }
          const matchRes = await docClient.send(
            new GetCommand({
              TableName: tbl,
              Key: { entityId: `MATCH#${resolvedMatchIdStr}`, sk: "MATCH#META" },
            })
          );
          if (matchRes.Item?.seriesId && !resolvedSeriesId) {
            resolvedSeriesId = String(matchRes.Item.seriesId).trim();
          }
          if (type === "follow" && !resolvedFollowStartMs && matchRes.Item) {
            const parsedFromMatch = parseMatchStartMs(matchRes.Item.date, matchRes.Item.time);
            if (parsedFromMatch) resolvedFollowStartMs = parsedFromMatch;
          }
          if (resolvedSeriesId && (type !== "follow" || resolvedFollowStartMs)) break;
        } catch {}
      }
    }

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
      status: isFutureScheduled ? "scheduled" : (status === "scheduled" ? "active" : (status || "active")),
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
      ...(type === "follow"
        ? {
            followData: {
              ...(body.followData || {}),
              team1Name: String(body.followData?.team1Name || body.team1Name || "").trim(),
              team1Code: String(body.followData?.team1Code || body.team1Code || "").trim().toUpperCase(),
              team1Flag: String(body.followData?.team1Flag || body.team1Flag || "").trim(),
              team2Name: String(body.followData?.team2Name || body.team2Name || "").trim(),
              team2Code: String(body.followData?.team2Code || body.team2Code || "").trim().toUpperCase(),
              team2Flag: String(body.followData?.team2Flag || body.team2Flag || "").trim(),
              matchLabel: String(body.followData?.matchLabel || body.matchLabel || "T20 INTERNATIONAL").trim(),
              matchTimeLabel: String(body.followData?.matchTimeLabel || body.matchTimeLabel || "Upcoming").trim(),
              matchStartMs: resolvedFollowStartMs,
              statusLabel: String(body.followData?.statusLabel || "Upcoming").trim(),
              followCount: Number(body.followData?.followCount || existingEngagement?.followData?.followCount) || 0,
              remindCount: Number(body.followData?.remindCount || existingEngagement?.followData?.remindCount) || 0,
            },
          }
        : {}),
      ...(type === "match_result"
        ? {
            matchResultData: {
              ...(body.matchResultData || {}),
              showSnapshot: body.matchResultData?.showSnapshot !== false,
              snapshotHeading: String(body.matchResultData?.snapshotHeading || "Match Snapshot").trim(),
              team1Name: String(body.matchResultData?.team1Name || body.team1Name || "").trim(),
              team1Code: String(body.matchResultData?.team1Code || body.team1Code || "").trim().toUpperCase(),
              team1Flag: String(body.matchResultData?.team1Flag || body.team1Flag || "").trim(),
              team1Score: String(body.matchResultData?.team1Score || body.team1Score || "").trim(),
              team2Name: String(body.matchResultData?.team2Name || body.team2Name || "").trim(),
              team2Code: String(body.matchResultData?.team2Code || body.team2Code || "").trim().toUpperCase(),
              team2Flag: String(body.matchResultData?.team2Flag || body.team2Flag || "").trim(),
              team2Score: String(body.matchResultData?.team2Score || body.team2Score || "").trim(),
              resultSummary: String(body.matchResultData?.resultSummary || "").trim(),
              showTopPerformer: body.matchResultData?.showTopPerformer !== false,
              performerLabel: String(body.matchResultData?.performerLabel || "Top Performer").trim(),
              playerName: String(body.matchResultData?.playerName || "").trim(),
              playerStats: String(body.matchResultData?.playerStats || "").trim(),
              playerImageUrl: String(body.matchResultData?.playerImageUrl || "").trim(),
              mode: body.matchResultData?.mode || "combined",
            },
          }
        : {}),
      ...(type === "express" && formattedExpressData?.placeholder
        ? { inputPlaceholder: formattedExpressData.placeholder }
        : {}),
      questionData: formattedQuestionData,
      postLock: String(body.postLock ?? body.questionData?.postLock ?? "").trim(),
      options:
        (type === "express" && formattedExpressData?.responseMode === "text") || type === "follow" || type === "match_result"
          ? []
          : body.options ||
            formattedDebateData?.options ||
            formattedExpressData?.options ||
            formattedQuestionData?.options ||
            formattedPollData?.options ||
            formattedPredData?.options,
      winningChoiceId: body.winningChoiceId || formattedPredData?.winningChoiceId || formattedDebateData?.winningChoiceId || existingEngagement?.winningChoiceId || null,
      outcomeNotes: body.outcomeNotes || existingEngagement?.outcomeNotes || null,
      resolvedAt: body.resolvedAt || existingEngagement?.resolvedAt || null,
      resolvedBy: body.resolvedBy || existingEngagement?.resolvedBy || null,
      ...(isNoTimerType ? {} : { timerMinutes: matchMomentDurationMins, durationMinutes: matchMomentDurationMins }),
      likes: Number(likes) || Number(existingEngagement?.likes) || 0,
      shares: Number(shares) || Number(existingEngagement?.shares) || 0,
      totalEngaged: Number(totalEngaged) || Number(existingEngagement?.totalEngaged) || 0,
      commentsCount: Number(existingEngagement?.commentsCount) || 0,
      startTime: startMs,
      scheduledStartTime: startMs,
      postingTime: startMs,
      isScheduled: isFutureScheduled,
      notifiedLive: !isFutureScheduled,
      createdAt: now,
      updatedAt: now,
      expiresAt: computedExpiresAt,
      category: body.category || (body.isMatchMoment || body.matchId || body.momentId || body.loopId || formattedDebateData || formattedExpressData || formattedQuestionData || type === "follow" || type === "match_result" ? (type === "fan_battle" || type === "meme" ? "fliparena" : "match_moment") : (type === "fan_battle" || type === "meme" ? "fliparena" : undefined)),
      source: body.source || (body.isMatchMoment || body.matchId || body.momentId || body.loopId || formattedDebateData || formattedExpressData || formattedQuestionData || type === "follow" || type === "match_result" ? (type === "fan_battle" || type === "meme" ? "fliparena" : "match_moment") : "fliparena"),
      isMatchMoment: body.isMatchMoment !== undefined ? Boolean(body.isMatchMoment) : Boolean((type !== "meme" && type !== "fan_battle") && (body.matchId || body.momentId || body.loopId || formattedDebateData || formattedExpressData || formattedQuestionData || type === "follow" || type === "match_result" || matchMomentDurationMins === 4)),
      ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
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
    const dynamoItem = withEngagementGsiKeys({
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${type.toUpperCase()}`,
      ...newEngagement,
    });

    // Dual Write to DynamoDB + Firestore
    await dualWrite("engagements", id, TABLES.SocialAndContent, dynamoItem);

    // If this engagement belongs to a match moment (or has matchId), dual-write to MatchMoments table
    if (newEngagement.isMatchMoment || newEngagement.source === "match_moment" || newEngagement.matchId) {
      try {
        await dualWrite({
          tableName: TABLES.MatchMoments,
          dynamoItem: withEngagementGsiKeys({
            entityId: `MATCH#${newEngagement.matchId || "GLOBAL"}`,
            sk: `LOOP#${newEngagement.loopId || id}`,
            contentId: `ENGAGEMENT#${id}`,
            ...newEngagement,
          }),
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
    if (!isEdit && (creatorId || creatorEmail)) {
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
    if (!isFutureScheduled && !isEdit) {
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
        const col = getFirestoreCollection("match_moments_engagements");
        const snap = await db.collection(col).where("id", "==", cleanId).get();
        for (const doc of snap.docs) {
          await doc.ref.delete();
        }
        if (cleanMatchId) {
          await db.collection(col).doc(`${cleanMatchId}_${cleanId}`).delete().catch(() => {});
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
