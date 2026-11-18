// lib/fanJourneyService.ts — Pure AWS DynamoDB Microservice Layer for Between-Match Fan Journey
import { NextRequest } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { getUser } from "@/lib/getUser";
import { isMatchScoredType } from "@/lib/matchLeaderboard";
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  JOURNEY_STAGE_ORDER,
  type JourneyStage,
  type FanArchetype,
  type SeriesJourneyState,
  type UserMatchRecap,
  type UserMatchKPIs,
  type UserMatchWatchingIntent,
  type MatchIntentAggregates,
  type UserSeriesProgress,
  type SeriesLeaderboardEntry,
  type LeaderboardBadgeTier,
  type CommunityAward,
  type CommunityAwardType,
} from "@/types/betweenMatchJourney";

export const DEFAULT_WATCHING_INTENT_OPTIONS: string[] = [
  "india_batting",
  "bumrah_bowling",
  "kohli_vs_nz",
  "tactical_battle",
  "series_result",
];

// ─── Key & ID Normalization Helpers ──────────────────────────────────────────

export function cleanSeriesId(val?: string | null): string {
  return String(val || "").trim().replace(/^SERIES#/i, "");
}

export function cleanMatchId(val?: string | null): string {
  return String(val || "").trim().replace(/^MATCH#/i, "");
}

export function normalizeMatchKey(val?: string | null): string {
  return cleanMatchId(val).replace(/^MATCH-/i, "").toLowerCase();
}

export function cleanUserId(val?: string | null): string {
  return String(val || "").trim().replace(/^USER#/i, "");
}

export function isValidRealUid(uid?: string | null): boolean {
  if (!uid) return false;
  const c = String(uid).trim().toLowerCase();
  if (!c) return false;
  return !(
    c.startsWith("anon") ||
    c === "anonymous" ||
    c === "me" ||
    c === "guest" ||
    c === "guest_fan" ||
    c.includes(":") ||
    c.includes(",") ||
    c.endsWith("-bot")
  );
}

function extractCandidateUserKeys(raw?: string | null): string[] {
  const clean = cleanUserId(raw);
  if (!clean) return [];
  const candidates = new Set<string>([clean, clean.toLowerCase()]);

  if (clean.includes("@")) {
    const lower = clean.toLowerCase();
    candidates.add(lower.replace(/[@.]/g, "_"));
    candidates.add(lower.replace(/[^a-z0-9]/g, "_"));
    candidates.add(lower.replace(/@/g, "_"));
  } else {
    const lower = clean.toLowerCase();
    const parts = lower.split("_");
    const SECOND_LEVEL = ["edu", "co", "ac", "gov", "org", "net"];
    const TLDS = ["com", "in", "org", "net", "edu", "io", "co", "ac", "gov", "app", "dev", "ai", "uk", "au", "ca"];
    const last = parts[parts.length - 1] || "";
    if (parts.length >= 3 && TLDS.includes(last)) {
      const second = parts[parts.length - 2] || "";
      const domainLen = SECOND_LEVEL.includes(second) && parts.length >= 4 ? 3 : 2;
      const domain = parts.slice(parts.length - domainLen).join(".");
      const localParts = parts.slice(0, parts.length - domainLen);
      if (localParts.length > 0) {
        candidates.add(`${localParts.join(".")}@${domain}`);
        candidates.add(`${localParts.join("_")}@${domain}`);
        candidates.add(`${localParts.join("-")}@${domain}`);
      }
    }
  }
  return Array.from(candidates);
}

async function queryPaginated(table: string, params: Omit<ConstructorParameters<typeof QueryCommand>[0], "TableName" | "ExclusiveStartKey">) {
  const items: any[] = [];
  let lastKey: Record<string, any> | undefined;
  let pages = 0;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: table,
        ...params,
        ExclusiveStartKey: lastKey,
      })
    );
    if (res.Items?.length) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
    pages++;
  } while (lastKey && pages < 20);
  return items;
}

async function scanPaginated(table: string, params: Omit<ConstructorParameters<typeof ScanCommand>[0], "TableName" | "ExclusiveStartKey">, maxPages = 15) {
  const items: any[] = [];
  let lastKey: Record<string, any> | undefined;
  let pages = 0;
  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: table,
        ...params,
        ExclusiveStartKey: lastKey,
      })
    );
    if (res.Items?.length) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
    pages++;
  } while (lastKey && pages < maxPages);
  return items;
}

export interface ResolvedDynamoProfile {
  userId: string;
  email: string;
  userName: string;
  userAvatar: string;
  fanArchetype: FanArchetype;
  favoritePlayers: string[];
  favoriteClub: string;
  totalPoints: number;
  entityKeyId: string | null;
}

const ARCHETYPE_SET = new Set<FanArchetype>([
  "ANALYTICAL",
  "SOCIAL",
  "TACTICAL",
  "CREATOR",
  "COMMUNITY",
  "DEVOTED",
]);

function normalizeArchetype(raw?: string | null): FanArchetype {
  const up = String(raw || "").trim().toUpperCase() as FanArchetype;
  return ARCHETYPE_SET.has(up) ? up : "ANALYTICAL";
}

/**
 * Resolves a fan's profile directly from AWS DynamoDB IdentityAndAccess.
 */
export async function resolveDynamoUserProfile(rawUserId: string): Promise<ResolvedDynamoProfile> {
  const clean = cleanUserId(rawUserId);
  const candidates = extractCandidateUserKeys(clean);
  const tables = getCandidateTableNames(TABLES.IdentityAndAccess);

  for (const table of tables) {
    for (const cand of candidates) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: table,
            Key: { entityId: `USER#${cand}`, sk: "USER#META" },
          })
        );
        if (res.Item) {
          const it = res.Item;
          const email = String(it.email || (cand.includes("@") ? cand : "")).toLowerCase();
          const fullName = `${it.firstName || ""} ${it.lastName || ""}`.trim();
          const userName = fullName || String(it.userName || it.name || it.username || (email ? email.split("@")[0] : cand));
          const followEntities: any[] = Array.isArray(it.followEntities) ? it.followEntities : [];
          const favoritePlayers = Array.isArray(it.favoritePlayers)
            ? it.favoritePlayers.map(String)
            : followEntities
                .filter((f) => String(f?.type || "").toLowerCase().includes("player"))
                .map((f) => String(f?.name || f?.id || ""))
                .filter(Boolean);
          const clubMatch = followEntities.find((f) => String(f?.type || "").toLowerCase().includes("club") || String(f?.type || "").toLowerCase().includes("team"));
          const favoriteClub = String(it.favoriteClub || it.favTeam || clubMatch?.name || "");

          return {
            userId: clean,
            email,
            userName,
            userAvatar: String(it.avatarUrl || it.avatar || it.photoURL || it.picture || ""),
            fanArchetype: normalizeArchetype(it.fanArchetype),
            favoritePlayers,
            favoriteClub,
            totalPoints: Number(it.totalPoints || it.totalXP || 0),
            entityKeyId: String(it.entityId),
          };
        }
      } catch {
        // continue candidate search
      }
    }
  }

  return {
    userId: clean,
    email: clean.includes("@") ? clean.toLowerCase() : "",
    userName: clean.includes("@") ? clean.split("@")[0] : clean,
    userAvatar: "",
    fanArchetype: "ANALYTICAL",
    favoritePlayers: [],
    favoriteClub: "",
    totalPoints: 0,
    entityKeyId: null,
  };
}

/**
 * Resolves acting userId from session/cookies, allowing admins or direct backend tests
 * to target an explicit userId parameter.
 */
export async function resolveRequestUserId(
  req: NextRequest,
  explicitBodyUserId?: string | null
): Promise<string> {
  const queryUid = req.nextUrl.searchParams.get("userId");
  const headerUid = req.headers.get("x-user-id");
  const explicit = cleanUserId(explicitBodyUserId || queryUid || headerUid);

  const authUser = await getUser(req).catch(() => null);
  if (authUser) {
    if (String(authUser.role || "").toLowerCase() === "admin" && explicit) {
      return explicit;
    }
    return cleanUserId(authUser.userId || authUser.email || explicit);
  }
  return explicit;
}

// ─── 1. Series Journey State (TABLES.SportsData) ───────────────────────────────

function stripJourneyRecord(item: Record<string, any>): SeriesJourneyState {
  return {
    seriesId: cleanSeriesId(item.seriesId || item.entityId),
    seriesName: String(item.seriesName || ""),
    currentStage: (JOURNEY_STAGE_ORDER.includes(item.currentStage) ? item.currentStage : "DAY_0") as JourneyStage,
    currentMatchId: String(item.currentMatchId || ""),
    nextMatchId: String(item.nextMatchId || ""),
    matchIds: Array.isArray(item.matchIds) ? item.matchIds : [],
    match1CompletedAt: Number(item.match1CompletedAt || 0),
    match2ScheduledAt: Number(item.match2ScheduledAt || 0),
    venue: {
      stadium: String(item.venue?.stadium || ""),
      city: String(item.venue?.city || ""),
    },
    rivalryTally: {
      teamAId: String(item.rivalryTally?.teamAId || "IND"),
      teamAFans: Number(item.rivalryTally?.teamAFans || 0),
      teamBId: String(item.rivalryTally?.teamBId || "NZ"),
      teamBFans: Number(item.rivalryTally?.teamBFans || 0),
    },
    autoAdvanceEnabled: Boolean(item.autoAdvanceEnabled ?? true),
    createdAt: item.createdAt ? Number(item.createdAt) : undefined,
    updatedAt: Number(item.updatedAt || Date.now()),
  };
}

export async function getSeriesJourneyState(seriesId: string): Promise<SeriesJourneyState | null> {
  const cleanId = cleanSeriesId(seriesId);
  if (!cleanId) return null;

  for (const table of getCandidateTableNames(TABLES.SportsData)) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: { entityId: `SERIES#${cleanId}`, sk: "JOURNEY#STATE" },
          ConsistentRead: true,
        })
      );
      if (res.Item) return stripJourneyRecord(res.Item);
    } catch {
      // try next table
    }
  }
  return null;
}

export async function listSeriesJourneys(limit = 50): Promise<SeriesJourneyState[]> {
  try {
    const items = await queryPaginated(TABLES.SportsData, {
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "SERIES_JOURNEY#ALL" },
      ScanIndexForward: false,
      Limit: limit,
    });
    if (items.length > 0) {
      return items.map(stripJourneyRecord);
    }
  } catch {
    // Fallback to filtered Scan on sk = JOURNEY#STATE
  }

  try {
    const scanned = await scanPaginated(TABLES.SportsData, {
      FilterExpression: "begins_with(entityId, :pfx) AND sk = :sk",
      ExpressionAttributeValues: { ":pfx": "SERIES#", ":sk": "JOURNEY#STATE" },
    });
    return scanned
      .map(stripJourneyRecord)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit);
  } catch (err) {
    console.warn("[fanJourneyService] listSeriesJourneys error:", err);
    return [];
  }
}

export async function upsertSeriesJourneyState(
  input: Partial<SeriesJourneyState> & { seriesId: string }
): Promise<SeriesJourneyState> {
  const cleanId = cleanSeriesId(input.seriesId);
  const existing = await getSeriesJourneyState(cleanId);
  const now = Date.now();

  const nextStage: JourneyStage =
    input.currentStage && JOURNEY_STAGE_ORDER.includes(input.currentStage)
      ? input.currentStage
      : existing?.currentStage || "DAY_0";

  const merged: SeriesJourneyState = {
    seriesId: cleanId,
    seriesName: input.seriesName ?? existing?.seriesName ?? cleanId,
    currentStage: nextStage,
    currentMatchId: input.currentMatchId ?? existing?.currentMatchId ?? "",
    nextMatchId: input.nextMatchId ?? existing?.nextMatchId ?? "",
    matchIds: input.matchIds ?? existing?.matchIds ?? [],
    match1CompletedAt: input.match1CompletedAt ?? existing?.match1CompletedAt ?? 0,
    match2ScheduledAt: input.match2ScheduledAt ?? existing?.match2ScheduledAt ?? 0,
    venue: {
      stadium: input.venue?.stadium ?? existing?.venue?.stadium ?? "",
      city: input.venue?.city ?? existing?.venue?.city ?? "",
    },
    rivalryTally: {
      teamAId: input.rivalryTally?.teamAId ?? existing?.rivalryTally?.teamAId ?? "IND",
      teamAFans: input.rivalryTally?.teamAFans ?? existing?.rivalryTally?.teamAFans ?? 0,
      teamBId: input.rivalryTally?.teamBId ?? existing?.rivalryTally?.teamBId ?? "NZ",
      teamBFans: input.rivalryTally?.teamBFans ?? existing?.rivalryTally?.teamBFans ?? 0,
    },
    autoAdvanceEnabled:
      input.autoAdvanceEnabled !== undefined
        ? Boolean(input.autoAdvanceEnabled)
        : existing?.autoAdvanceEnabled ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.SportsData,
      Item: {
        entityId: `SERIES#${cleanId}`,
        sk: "JOURNEY#STATE",
        GSI1PK: "SERIES_JOURNEY#ALL",
        GSI1SK: `${String(now).padStart(15, "0")}#${cleanId}`,
        ...merged,
      },
    })
  );

  return merged;
}

export async function advanceSeriesJourneyStage(
  seriesId: string,
  targetStage?: JourneyStage
): Promise<SeriesJourneyState> {
  const cleanId = cleanSeriesId(seriesId);
  const existing = await getSeriesJourneyState(cleanId);
  const currentStage = existing?.currentStage || "DAY_0";

  let nextStage: JourneyStage;
  if (targetStage && JOURNEY_STAGE_ORDER.includes(targetStage)) {
    nextStage = targetStage;
  } else {
    const idx = JOURNEY_STAGE_ORDER.indexOf(currentStage);
    nextStage = idx >= 0 && idx < JOURNEY_STAGE_ORDER.length - 1 ? JOURNEY_STAGE_ORDER[idx + 1] : "POST_MATCH";
  }

  return upsertSeriesJourneyState({
    ...existing,
    seriesId: cleanId,
    currentStage: nextStage,
  });
}

// ─── Shared Core Engine Telemetry Collector (DynamoDB Read Layer) ──────────────

type ImpactPillar = "knowledge" | "prediction" | "participation" | "community" | "insight";

interface PillarSxpBucket {
  base: number;
  recognition: number;
}

type PillarSxpBuckets = Record<ImpactPillar, PillarSxpBucket>;

function createEmptyPillarBuckets(): PillarSxpBuckets {
  return {
    knowledge: { base: 0, recognition: 0 },
    prediction: { base: 0, recognition: 0 },
    participation: { base: 0, recognition: 0 },
    community: { base: 0, recognition: 0 },
    insight: { base: 0, recognition: 0 },
  };
}

function pillarForEngagementType(engType?: string | null): ImpactPillar {
  const t = String(engType || "").trim().toLowerCase();
  if (t === "question" || t === "quiz" || t === "trivia") return "knowledge";
  if (t === "prediction") return "prediction";
  if (t === "poll" || t === "debate") return "community";
  if (t === "express" || t === "takes" || t === "hot_take" || t === "hottake") return "insight";
  return "participation";
}

function pillarForActivityType(actType: string, engType?: string | null): ImpactPillar {
  const upper = String(actType || "").trim().toUpperCase();
  // Likes / Comments / Shares / Reactions go into Participation
  if (
    upper.includes("LIKE") ||
    upper.includes("COMMENT") ||
    upper.includes("SHARE") ||
    upper.includes("REACT")
  ) {
    return "participation";
  }
  if (engType) {
    return pillarForEngagementType(engType);
  }
  if (upper.includes("QUIZ") || upper.includes("TRIVIA") || upper.includes("QUESTION")) return "knowledge";
  if (upper.includes("PREDICT")) return "prediction";
  if (upper.includes("POLL") || upper.includes("DEBATE")) return "community";
  if (upper.includes("EXPRESS") || upper.includes("TAKE")) return "insight";
  return "participation";
}

function allocatePercentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floored = exact.map((e) => Math.floor(e));
  const remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, idx) => ({ idx, frac: e - floored[idx], val: values[idx] }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : b.val - a.val));
  for (let i = 0; i < remainder && i < order.length; i++) {
    floored[order[i].idx] += 1;
  }
  return floored;
}

function formatPillarSxpMetric(baseSxp: number, recognitionSxp: number): string {
  const total = baseSxp + recognitionSxp;
  if (total <= 0) return "0 SXP";
  if (recognitionSxp > 0 && baseSxp > 0) {
    return `${total} SXP (${baseSxp} SXP + ${recognitionSxp} SXP Recognition)`;
  }
  if (recognitionSxp > 0) {
    return `${total} SXP (${recognitionSxp} SXP Recognition)`;
  }
  return `${total} SXP`;
}

interface ParticipantMatchStats {
  userId: string;
  userName: string;
  userAvatar: string;
  totalInteractions: number;
  participations: number;
  likes: number;
  comments: number;
  replies: number;
  shares: number;
  impressions: number;
  socialLikes: number;
  socialComments: number;
  socialImpressions: number;
  upvotesReceived: number;
  predictionsTotal: number;
  predictionsCorrect: number;
  triviaAttempted: number;
  triviaCorrect: number;
  predictionsAttempted: number;
  predictionsResolved: number;
  predictionsWon: number;
  pollsVoted: number;
  debatesVoted: number;
  communityComments: number;
  takesSubmitted: number;
  takesLikesReceived: number;
  takesRepliesReceived: number;
  recognitionsReceived: number;
  cardsEngagedSet: Set<string>;
  sxpEarned: number;
  pillarSxp: PillarSxpBuckets;
  momentEngagementCounts: Map<string, number>;
}

interface MatchTelemetrySnapshot {
  matchId: string;
  momentsById: Map<string, { momentId: string; title: string; mediaUrl: string; totalReactions: number }>;
  engagementsById: Map<string, any>;
  recognitionsList: any[];
  participants: Map<string, ParticipantMatchStats>;
  engagementCount: number;
  totalCommunityCards: number;
  totalTakesCards: number;
  totalTriviaCards: number;
  totalPredictionCards: number;
}

async function collectMatchActivitySnapshot(matchId: string): Promise<MatchTelemetrySnapshot> {
  const targetMatchKey = normalizeMatchKey(matchId);
  const cleanM = cleanMatchId(matchId);
  const momentsById = new Map<string, { momentId: string; title: string; mediaUrl: string; totalReactions: number }>();
  const engagementsById = new Map<string, any>();
  const revealsByEngId = new Map<string, any>();
  const recognitionsList: any[] = [];

  // 1. Load Moments, Loops, Reveals, Recognitions from MatchMoments candidate tables
  for (const table of getCandidateTableNames(TABLES.MatchMoments)) {
    try {
      const items = await scanPaginated(table, {
        FilterExpression:
          "begins_with(sk, :mom) OR begins_with(sk, :loop) OR begins_with(sk, :rev) OR begins_with(sk, :rec) OR begins_with(sk, :eng)",
        ExpressionAttributeValues: {
          ":mom": "MOMENT#",
          ":loop": "LOOP#",
          ":rev": "REVEAL#",
          ":rec": "RECOGNITION#",
          ":eng": "ENGAGEMENT#",
        },
      });
      for (const it of items) {
        const itemMatchKey = normalizeMatchKey(it.matchId || it.entityId);
        if (itemMatchKey !== targetMatchKey) continue;

        const sk = String(it.sk || "");
        if (sk.startsWith("MOMENT#")) {
          const mid = String(it.momentId || sk.replace(/^MOMENT#/, ""));
          if (mid && !momentsById.has(mid)) {
            momentsById.set(mid, {
              momentId: mid,
              title: String(it.event || it.matchMoment || `Over ${it.overs || ""} Moment`).trim(),
              mediaUrl: String(it.mediaUrl || it.imageUrl || it.thumbnailUrl || ""),
              totalReactions: 0,
            });
          }
        } else if (sk.startsWith("LOOP#") || sk.startsWith("ENGAGEMENT#")) {
          const eid = String(it.id || it.loopId || sk.replace(/^(LOOP|ENGAGEMENT)#/, ""));
          if (eid && !engagementsById.has(eid)) {
            engagementsById.set(eid, { ...it, id: eid });
          }
        } else if (sk.startsWith("REVEAL#")) {
          const eid = String(it.engagementId || it.id || sk.replace(/^REVEAL#/, ""));
          if (eid && !revealsByEngId.has(eid)) revealsByEngId.set(eid, it);
        } else if (sk.startsWith("RECOGNITION#")) {
          recognitionsList.push(it);
        }
      }
      if (momentsById.size > 0 || engagementsById.size > 0 || revealsByEngId.size > 0) break;
    } catch {
      // try next table
    }
  }

  // 2. Also scan SocialAndContent for ENGAGEMENT#META records matching matchId
  for (const table of getCandidateTableNames(TABLES.SocialAndContent)) {
    try {
      const items = await scanPaginated(table, {
        FilterExpression: "begins_with(contentId, :c) AND sk = :meta",
        ExpressionAttributeValues: { ":c": "ENGAGEMENT#", ":meta": "ENGAGEMENT#META" },
      });
      for (const it of items) {
        if (normalizeMatchKey(it.matchId) !== targetMatchKey) continue;
        const eid = String(it.id || String(it.contentId || "").replace(/^ENGAGEMENT#/, ""));
        if (eid) {
          const prev = engagementsById.get(eid) || {};
          engagementsById.set(eid, { ...prev, ...it, id: eid });
        }
      }
      if (engagementsById.size > 0) break;
    } catch {
      // try next table
    }
  }

  const participants = new Map<string, ParticipantMatchStats>();

  function getOrCreateParticipant(rawUid: string, nameHint?: string, avatarHint?: string): ParticipantMatchStats | null {
    if (!isValidRealUid(rawUid)) return null;
    const key = cleanUserId(rawUid).toLowerCase();
    let p = participants.get(key);
    if (!p) {
      p = {
        userId: cleanUserId(rawUid),
        userName: nameHint?.trim() || (key.includes("@") ? key.split("@")[0] : cleanUserId(rawUid)),
        userAvatar: avatarHint || "",
        totalInteractions: 0,
        participations: 0,
        likes: 0,
        comments: 0,
        replies: 0,
        shares: 0,
        impressions: 0,
        socialLikes: 0,
        socialComments: 0,
        socialImpressions: 0,
        upvotesReceived: 0,
        predictionsTotal: 0,
        predictionsCorrect: 0,
        triviaAttempted: 0,
        triviaCorrect: 0,
        predictionsAttempted: 0,
        predictionsResolved: 0,
        predictionsWon: 0,
        pollsVoted: 0,
        debatesVoted: 0,
        communityComments: 0,
        takesSubmitted: 0,
        takesLikesReceived: 0,
        takesRepliesReceived: 0,
        recognitionsReceived: 0,
        cardsEngagedSet: new Set<string>(),
        sxpEarned: 0,
        pillarSxp: createEmptyPillarBuckets(),
        momentEngagementCounts: new Map(),
      };
      participants.set(key, p);
    } else {
      if (nameHint && (!p.userName || p.userName === p.userId)) p.userName = nameHint.trim();
      if (avatarHint && !p.userAvatar) p.userAvatar = avatarHint;
    }
    return p;
  }

  function addMomentTouch(p: ParticipantMatchStats, momentId?: string, reactions = 1) {
    if (!momentId) return;
    p.momentEngagementCounts.set(momentId, (p.momentEngagementCounts.get(momentId) || 0) + reactions);
    const m = momentsById.get(momentId);
    if (m) m.totalReactions += reactions;
  }

  // 3. Read child interaction records (VOTE#, LIKE#, SHARE#, COMMENT#, IMPRESSION#) for every engagement
  const engEntries = Array.from(engagementsById.entries());
  let totalCommunityCards = 0;
  let totalTakesCards = 0;
  let totalTriviaCards = 0;
  let totalPredictionCards = 0;

  for (const [, eng] of engEntries) {
    const cleanType = String(eng.type || "").toLowerCase().trim();
    if (cleanType === "question" || cleanType === "quiz") totalTriviaCards += 1;
    else if (cleanType === "prediction") totalPredictionCards += 1;
    else if (cleanType === "poll" || cleanType === "debate") totalCommunityCards += 1;
    else if (cleanType === "express" || cleanType === "takes" || cleanType === "hot_take") totalTakesCards += 1;
  }

  const BATCH_SIZE = 15;
  for (let i = 0; i < engEntries.length; i += BATCH_SIZE) {
    const batch = engEntries.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ([eid, eng]) => {
        let childItems: any[] = [];
        for (const tbl of getCandidateTableNames(TABLES.SocialAndContent)) {
          try {
            const rows = await queryPaginated(tbl, {
              KeyConditionExpression: "contentId = :cid",
              ExpressionAttributeValues: { ":cid": `ENGAGEMENT#${eid}` },
            });
            if (rows.some((r) => r.sk && r.sk !== "ENGAGEMENT#META")) {
              childItems = rows;
              break;
            }
          } catch {
            // next table
          }
        }

        const reveal = revealsByEngId.get(eid);
        const winningChoiceId = String(
          reveal?.winningChoiceId ||
          eng.outcomeWinningChoiceId ||
          eng.winningChoiceId ||
          eng.correctOptionId ||
          eng.questionData?.correctOptionId ||
          eng.correctAnswer ||
          ""
        )
          .trim()
          .toLowerCase();
        const winningUserSet = new Set<string>(
          Array.isArray(reveal?.winningUserIds)
            ? reveal.winningUserIds.map((u: string) => cleanUserId(u).toLowerCase())
            : []
        );
        const isResolved = Boolean(
          winningChoiceId || eng.status === "settled" || eng.status === "resolved"
        );
        const isPredictionOrQuiz = ["prediction", "quiz", "poll"].includes(String(eng.type || "").toLowerCase());
        const momentId = eng.momentId ? String(eng.momentId) : undefined;

        const commentMap = new Map<string, any>();
        for (const it of childItems) {
          const sk = String(it.sk || "");
          if (sk.startsWith("COMMENT#")) {
            const cid = String(it.commentId || it.id || sk.replace(/^COMMENT#/, ""));
            commentMap.set(cid, it);
          }
        }

        const seenVotes = new Set<string>();
        const seenLikes = new Set<string>();
        const seenShares = new Set<string>();
        const seenSocialLikes = new Set<string>();
        const seenSocialComments = new Set<string>();

        for (const it of childItems) {
          const sk = String(it.sk || "");
          if (sk.startsWith("VOTE#")) {
            const parts = sk.replace(/^VOTE#/, "").split("#");
            const rawUid = String(it.userId || parts[0] || "");
            const qKey = String(it.questionId || parts[1] || "");
            const p = getOrCreateParticipant(rawUid, it.userName || it.name, it.userAvatar);
            if (!p) continue;
            const dKey = `${p.userId.toLowerCase()}#${qKey}`;
            if (seenVotes.has(dKey)) continue;
            seenVotes.add(dKey);

            p.participations += 1;
            p.totalInteractions += 1;
            p.cardsEngagedSet.add(eid);
            const votePts = Number(it.pointsAwarded || it.participationPointsAwarded || 2) + Number(it.wonBonusPoints || 0);
            p.sxpEarned += votePts;
            addMomentTouch(p, momentId, 1);

            const cleanEngType = String(eng.type || "").toLowerCase().trim();
            p.pillarSxp[pillarForEngagementType(cleanEngType)].base += votePts;
            const selected = String(it.selectedOptionId || "").trim().toLowerCase();
            const isWinner =
              it.isCorrect === true ||
              winningUserSet.has(p.userId.toLowerCase()) ||
              (Boolean(winningChoiceId) && selected === winningChoiceId) ||
              (isResolved && Boolean(winningChoiceId) && selected === winningChoiceId);

            if (cleanEngType === "question" || cleanEngType === "quiz") {
              p.triviaAttempted += 1;
              if (isWinner) p.triviaCorrect += 1;
            } else if (cleanEngType === "prediction") {
              p.predictionsAttempted += 1;
              if (isResolved) p.predictionsResolved += 1;
              if (isWinner) p.predictionsWon += 1;
            } else if (cleanEngType === "poll") {
              p.pollsVoted += 1;
            } else if (cleanEngType === "debate") {
              p.debatesVoted += 1;
            } else if (cleanEngType === "express" || cleanEngType === "takes" || cleanEngType === "hot_take") {
              p.takesSubmitted += 1;
            }

            if (isPredictionOrQuiz) {
              p.predictionsTotal += 1;
              if (isWinner) p.predictionsCorrect += 1;
            }
          } else if (sk.startsWith("LIKE#")) {
            const rawUid = String(it.userId || sk.slice(5));
            const p = getOrCreateParticipant(rawUid, it.userName);
            if (!p || seenLikes.has(p.userId.toLowerCase())) continue;
            seenLikes.add(p.userId.toLowerCase());
            p.likes += 1;
            p.totalInteractions += 1;
            p.cardsEngagedSet.add(eid);
            addMomentTouch(p, momentId, 1);
          } else if (sk.startsWith("SHARE#")) {
            const rawUid = String(it.userId || sk.slice(6));
            const p = getOrCreateParticipant(rawUid, it.userName);
            if (!p || seenShares.has(p.userId.toLowerCase())) continue;
            seenShares.add(p.userId.toLowerCase());
            p.shares += 1;
            p.totalInteractions += 1;
            p.cardsEngagedSet.add(eid);
            addMomentTouch(p, momentId, 1);
          } else if (sk.startsWith("IMPRESSION#") || sk.startsWith("VIEW#")) {
            const rawUid = String(it.userId || sk.replace(/^(IMPRESSION|VIEW)#/, "").split("#")[0]);
            const p = getOrCreateParticipant(rawUid, it.userName, it.userAvatar);
            if (!p) continue;
            const count = Math.max(1, Number(it.impressionCount || 1));
            p.impressions += count;
            p.totalInteractions += count;
            addMomentTouch(p, momentId, count);
          } else if (sk.startsWith("SOCIAL_LIKE#")) {
            const rest = sk.slice("SOCIAL_LIKE#".length);
            const hashIdx = rest.lastIndexOf("#");
            const targetCommentId = String(it.targetCommentId || (hashIdx >= 0 ? rest.slice(0, hashIdx) : rest)).trim();
            const rawUid = String(it.actorUserId || it.userId || (hashIdx >= 0 ? rest.slice(hashIdx + 1) : ""));
            const likerP = getOrCreateParticipant(rawUid, it.actorUserName || it.userName);
            if (!likerP) continue;
            const dKey = `${targetCommentId}#${likerP.userId.toLowerCase()}`;
            if (seenSocialLikes.has(dKey)) continue;
            seenSocialLikes.add(dKey);
            likerP.socialLikes += 1;
            likerP.totalInteractions += 1;
            if (it.targetAuthorUid) {
              const targetP = getOrCreateParticipant(String(it.targetAuthorUid));
              if (targetP && targetP.userId.toLowerCase() !== likerP.userId.toLowerCase()) {
                targetP.upvotesReceived += 1;
                const cleanEngType = String(eng.type || "").toLowerCase().trim();
                if (cleanEngType === "express" || cleanEngType === "takes" || cleanEngType === "hot_take") {
                  targetP.takesLikesReceived += 1;
                }
              }
            }
          } else if (sk.startsWith("SOCIAL_COMMENT#")) {
            const cId = String(it.commentId || sk.slice("SOCIAL_COMMENT#".length)).trim();
            const rawUid = String(it.actorUserId || it.userId || "");
            const p = getOrCreateParticipant(rawUid, it.actorUserName || it.userName);
            if (!p || seenSocialComments.has(cId)) continue;
            seenSocialComments.add(cId);
            p.socialComments += 1;
            p.totalInteractions += 1;
          } else if (sk.startsWith("SOCIAL_IMPRESSION#")) {
            const parts = sk.slice("SOCIAL_IMPRESSION#".length).split("#");
            const rawUid = String(it.actorUserId || it.userId || parts[1] || "");
            const p = getOrCreateParticipant(rawUid, it.actorUserName || it.userName);
            if (!p) continue;
            const count = Math.max(1, Number(it.impressionCount || 1));
            p.socialImpressions += count;
            p.totalInteractions += count;
          }
        }

        for (const [cid, c] of commentMap.entries()) {
          const authorP = getOrCreateParticipant(String(c.authorUid || ""), c.authorUsername, c.authorAvatarUrl);
          if (authorP) {
            authorP.cardsEngagedSet.add(eid);
            const cleanEngType = String(eng.type || "").toLowerCase().trim();
            if (cleanEngType === "debate" || cleanEngType === "poll") {
              authorP.communityComments += 1;
            } else if (cleanEngType === "express" || cleanEngType === "takes" || cleanEngType === "hot_take") {
              if (c.parentId) {
                authorP.takesRepliesReceived += 1;
              } else {
                authorP.takesSubmitted += 1;
              }
            }

            if (c.parentId) {
              authorP.replies += 1;
              if (!seenSocialComments.has(cid)) {
                seenSocialComments.add(cid);
                authorP.socialComments += 1;
              }
            } else {
              authorP.comments += 1;
            }
            authorP.totalInteractions += 1;
            addMomentTouch(authorP, momentId, 1);
          }

          const likedBy: string[] = Array.isArray(c.likedBy) ? c.likedBy : [];
          for (const liker of likedBy) {
            const likerP = getOrCreateParticipant(liker);
            if (likerP && (!authorP || likerP.userId.toLowerCase() !== authorP.userId.toLowerCase())) {
              const dKey = `${cid}#${likerP.userId.toLowerCase()}`;
              if (!seenSocialLikes.has(dKey)) {
                seenSocialLikes.add(dKey);
                likerP.socialLikes += 1;
                likerP.totalInteractions += 1;
                if (authorP) {
                  authorP.upvotesReceived += 1;
                  const cleanEngType = String(eng.type || "").toLowerCase().trim();
                  if (cleanEngType === "express" || cleanEngType === "takes" || cleanEngType === "hot_take") {
                    authorP.takesLikesReceived += 1;
                  }
                }
              }
            }
          }
        }
      })
    );
  }

  // 4. Add direct recognition SXP earned for this match
  for (const rec of recognitionsList) {
    const recEngId = String(rec.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const recArch = String(rec.archetype || "").trim().toUpperCase();
    const recEngType = String(
      rec.engagementType ||
        engagementsById.get(recEngId)?.type ||
        (recArch === "SHARP_ORACLE" || recArch === "CLUTCH_CALLER" ? "prediction" : "")
    )
      .trim()
      .toLowerCase();
    const recPillar = pillarForEngagementType(recEngType);
    const reward = rec.rewards || {};
    const sxp =
      Number(reward.totalSxp || 0) ||
      Number(reward.accuracySxp || 0) + Number(reward.participationSxp || 0) + Number(reward.streakBonusSxp || 0);

    if (rec.targetType === "user" && rec.targetUserId) {
      const p = getOrCreateParticipant(String(rec.targetUserId), rec.targetUserName);
      if (p) {
        p.recognitionsReceived = (p.recognitionsReceived || 0) + 1;
        p.sxpEarned += sxp;
        p.pillarSxp[recPillar].recognition += sxp;
      }
    } else if (rec.targetType === "all") {
      for (const p of participants.values()) {
        p.recognitionsReceived = (p.recognitionsReceived || 0) + 1;
        p.sxpEarned += sxp;
        p.pillarSxp[recPillar].recognition += sxp;
      }
    }
  }

  return {
    matchId: cleanM,
    momentsById,
    engagementsById,
    recognitionsList,
    participants,
    engagementCount: engagementsById.size,
    totalCommunityCards,
    totalTakesCards,
    totalTriviaCards,
    totalPredictionCards,
  };
}

// ─── 2. Personalized Match Recap (TABLES.GamificationAndWallet) ────────────────

export async function getUserMatchRecap(userId: string, matchId: string): Promise<UserMatchRecap | null> {
  const uid = cleanUserId(userId);
  const mid = cleanMatchId(matchId);
  if (!uid || !mid) return null;

  for (const table of getCandidateTableNames(TABLES.GamificationAndWallet)) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: { userId: `USER#${uid}`, sk: `RECAP#${mid}` },
          ConsistentRead: true,
        })
      );
      if (res.Item) {
        const it = res.Item;
        return {
          userId: uid,
          matchId: mid,
          seriesId: String(it.seriesId || ""),
          fanArchetype: normalizeArchetype(it.fanArchetype),
          stats: it.stats || { totalInteractions: 0, predictionsCorrect: 0, predictionsTotal: 0, sxpEarned: 0 },
          topMomentReacted: it.topMomentReacted || { momentId: "", title: "", reactionsCount: 0, mediaUrl: "" },
          seriesProgress: it.seriesProgress || {
            cumulativeInteractions: 0,
            cumulativePredictionsCorrect: 0,
            cumulativePredictionsTotal: 0,
            totalSeriesSxp: 0,
            leaderboardPercentile: 1,
          },
          generatedAt: Number(it.generatedAt || Date.now()),
        };
      }
    } catch {
      // try next table
    }
  }
  return null;
}

export async function saveUserMatchRecap(recap: UserMatchRecap): Promise<UserMatchRecap> {
  const uid = cleanUserId(recap.userId);
  const mid = cleanMatchId(recap.matchId);
  const payload: UserMatchRecap = {
    ...recap,
    userId: uid,
    matchId: mid,
    generatedAt: recap.generatedAt || Date.now(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.GamificationAndWallet,
      Item: {
        ...payload,
        userId: `USER#${uid}`,
        sk: `RECAP#${mid}`,
        rawUserId: uid,
      },
    })
  );

  return payload;
}

export async function computeUserMatchRecap(
  rawUserId: string,
  matchId: string,
  seriesIdInput?: string
): Promise<UserMatchRecap> {
  const uid = cleanUserId(rawUserId);
  const mid = cleanMatchId(matchId);
  const profile = await resolveDynamoUserProfile(uid);
  const snapshot = await collectMatchActivitySnapshot(mid);

  // Match participant across canonical keys (userId, email, or entityKeyId)
  const candKeys = extractCandidateUserKeys(uid).concat(extractCandidateUserKeys(profile.email));
  let statsMatch: ParticipantMatchStats | null = null;
  for (const ck of candKeys) {
    const found = snapshot.participants.get(ck.toLowerCase());
    if (found) {
      statsMatch = found;
      break;
    }
  }

  let topMomentReacted = {
    momentId: "",
    title: "No moments reacted yet",
    reactionsCount: 0,
    mediaUrl: "",
  };

  if (statsMatch && statsMatch.momentEngagementCounts.size > 0) {
    let bestMomentId = "";
    let bestScore = -1;
    for (const [momId, cnt] of statsMatch.momentEngagementCounts.entries()) {
      if (cnt > bestScore) {
        bestScore = cnt;
        bestMomentId = momId;
      }
    }
    const momMeta = snapshot.momentsById.get(bestMomentId);
    topMomentReacted = {
      momentId: bestMomentId,
      title: momMeta?.title || bestMomentId,
      reactionsCount: momMeta?.totalReactions || bestScore,
      mediaUrl: momMeta?.mediaUrl || "",
    };
  } else if (snapshot.momentsById.size > 0) {
    // Fallback to top community moment in that match
    const sortedMoments = Array.from(snapshot.momentsById.values()).sort(
      (a, b) => b.totalReactions - a.totalReactions
    );
    const first = sortedMoments[0];
    topMomentReacted = {
      momentId: first.momentId,
      title: first.title,
      reactionsCount: first.totalReactions,
      mediaUrl: first.mediaUrl,
    };
  }

  const seriesId = cleanSeriesId(seriesIdInput || "");
  let seriesSummary = {
    cumulativeInteractions: statsMatch?.totalInteractions || 0,
    cumulativePredictionsCorrect: statsMatch?.predictionsCorrect || 0,
    cumulativePredictionsTotal: statsMatch?.predictionsTotal || 0,
    totalSeriesSxp: statsMatch?.sxpEarned || 0,
    leaderboardPercentile: 1,
  };

  if (seriesId) {
    const existingSeries = await getUserSeriesProgress(uid, seriesId);
    if (existingSeries) {
      seriesSummary = {
        cumulativeInteractions: Math.max(existingSeries.stats.cumulativeInteractions, statsMatch?.totalInteractions || 0),
        cumulativePredictionsCorrect: Math.max(
          existingSeries.stats.cumulativePredictionsCorrect,
          statsMatch?.predictionsCorrect || 0
        ),
        cumulativePredictionsTotal: Math.max(
          existingSeries.stats.cumulativePredictionsTotal,
          statsMatch?.predictionsTotal || 0
        ),
        totalSeriesSxp: Math.max(existingSeries.stats.totalSeriesSxp, statsMatch?.sxpEarned || 0),
        leaderboardPercentile: existingSeries.leaderboard.percentile,
      };
    }
  }

  const recap: UserMatchRecap = {
    userId: uid,
    matchId: mid,
    seriesId,
    fanArchetype: profile.fanArchetype,
    stats: {
      totalInteractions: statsMatch?.totalInteractions || 0,
      predictionsCorrect: statsMatch?.predictionsCorrect || 0,
      predictionsTotal: statsMatch?.predictionsTotal || 0,
      sxpEarned: statsMatch?.sxpEarned || 0,
      participations: statsMatch?.participations || 0,
      impressions: statsMatch?.impressions || 0,
      actionLikes: statsMatch?.likes || 0,
      actionComments: statsMatch?.comments || 0,
      actionShares: statsMatch?.shares || 0,
      socialLikes: statsMatch?.socialLikes || 0,
      socialComments: statsMatch?.socialComments || 0,
      socialImpressions: statsMatch?.socialImpressions || 0,
    },
    topMomentReacted,
    seriesProgress: seriesSummary,
    generatedAt: Date.now(),
  };

  return saveUserMatchRecap(recap);
}

// ─── 2b. User Match KPIs (5 Pentagon Radar Pillars) (TABLES.GamificationAndWallet) ─

export async function getUserMatchKPIs(userId: string, matchId: string): Promise<UserMatchKPIs | null> {
  const uid = cleanUserId(userId);
  const mid = cleanMatchId(matchId);
  if (!uid || !mid) return null;

  for (const table of getCandidateTableNames(TABLES.GamificationAndWallet)) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: { userId: `USER#${uid}`, sk: `KPI#${mid}` },
          ConsistentRead: true,
        })
      );
      if (res.Item) {
        const it = res.Item;
        return {
          userId: uid,
          matchId: mid,
          seriesId: String(it.seriesId || ""),
          overallScore: Number(it.overallScore || 0),
          kpis: it.kpis,
          radarData: it.radarData,
          generatedAt: Number(it.generatedAt || Date.now()),
        };
      }
    } catch {
      // try next table
    }
  }
  return null;
}

export async function saveUserMatchKPIs(kpis: UserMatchKPIs): Promise<UserMatchKPIs> {
  const uid = cleanUserId(kpis.userId);
  const mid = cleanMatchId(kpis.matchId);
  const payload: UserMatchKPIs = {
    ...kpis,
    userId: uid,
    matchId: mid,
    generatedAt: kpis.generatedAt || Date.now(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.GamificationAndWallet,
      Item: {
        ...payload,
        userId: `USER#${uid}`,
        sk: `KPI#${mid}`,
        rawUserId: uid,
      },
    })
  );

  return payload;
}

export async function computeUserMatchKPIs(
  rawUserId: string,
  matchId: string,
  seriesIdInput?: string
): Promise<UserMatchKPIs> {
  const uid = cleanUserId(rawUserId);
  const mid = cleanMatchId(matchId);
  const targetMatchKey = normalizeMatchKey(mid);
  const profile = await resolveDynamoUserProfile(uid);
  const snapshot = await collectMatchActivitySnapshot(mid);

  // Match participant across canonical keys (userId, email, or entityKeyId)
  const rawKeys = [
    ...extractCandidateUserKeys(uid),
    ...extractCandidateUserKeys(profile.email),
    ...extractCandidateUserKeys(profile.userId),
  ];
  const candKeySet = new Set<string>();
  for (const k of rawKeys) {
    const clean = cleanUserId(k);
    if (!clean) continue;
    candKeySet.add(clean);
    candKeySet.add(clean.toLowerCase());
    if (clean.includes("@") || clean.includes(".")) {
      candKeySet.add(clean.toLowerCase().replace(/[@.]/g, "_"));
    }
  }
  const candKeys = Array.from(candKeySet);
  const candLowerSet = new Set(candKeys.map((k) => k.toLowerCase()));
  const candAlnumSet = new Set(candKeys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean));

  let statsMatch: ParticipantMatchStats | null = null;
  for (const ck of candKeys) {
    const found = snapshot.participants.get(ck.toLowerCase());
    if (found) {
      statsMatch = found;
      break;
    }
  }

  const seriesId = cleanSeriesId(seriesIdInput || "");
  const totalMatchCards = Math.max(1, snapshot.engagementCount);

  // Preserve raw counts for the 5 top scorecard tiles & badges
  const triviaAttempted = statsMatch?.triviaAttempted || 0;
  const triviaCorrect = statsMatch?.triviaCorrect || 0;
  const predictionsAttempted = statsMatch?.predictionsAttempted || 0;
  const predictionsResolved = statsMatch?.predictionsResolved || 0;
  const predictionsWon = statsMatch?.predictionsWon || 0;
  const cardsEngagedCount = statsMatch?.cardsEngagedSet ? statsMatch.cardsEngagedSet.size : 0;
  const pollsVoted = statsMatch?.pollsVoted || 0;
  const debatesVoted = statsMatch?.debatesVoted || 0;
  const communityComments = statsMatch?.communityComments || 0;
  const takesSubmitted = statsMatch?.takesSubmitted || 0;
  const takesLikesReceived = statsMatch?.takesLikesReceived || 0;
  const takesRepliesReceived = statsMatch?.takesRepliesReceived || 0;

  // Build recognition lookup by id so ACT# recognition entries can resolve their parent engagementType
  const recById = new Map<string, any>();
  for (const rec of snapshot.recognitionsList) {
    const rid = String(rec.recognitionId || rec.id || "").trim();
    if (rid) recById.set(rid, rec);
  }

  const resolveRecognitionPillar = (recLike: any): ImpactPillar => {
    const explicitType = String(recLike?.engagementType || "").trim().toLowerCase();
    if (explicitType) return pillarForEngagementType(explicitType);
    const engId = String(recLike?.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    if (engId) {
      const eng = snapshot.engagementsById.get(engId);
      if (eng?.type) return pillarForEngagementType(eng.type);
    }
    const rid = String(recLike?.recognitionId || recLike?.id || "").trim();
    const fullRec = rid && recById.has(rid) ? recById.get(rid) : null;
    if (fullRec) {
      const fullType = String(fullRec?.engagementType || "").trim().toLowerCase();
      if (fullType) return pillarForEngagementType(fullType);
      const fullEngId = String(fullRec?.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
      if (fullEngId && snapshot.engagementsById.get(fullEngId)?.type) {
        return pillarForEngagementType(snapshot.engagementsById.get(fullEngId).type);
      }
    }
    if (rid) {
      // Fallback: extract embedded engagementId from VR_eng_<ts>_<hash>_...
      const engMatch = rid.match(/(eng_\d+_[a-z0-9]+)/i);
      if (engMatch?.[1] && snapshot.engagementsById.get(engMatch[1])?.type) {
        return pillarForEngagementType(snapshot.engagementsById.get(engMatch[1]).type);
      }
    }
    // Fallback for prediction archetypes when admin did not pick a linked engagementId
    const arch = String(recLike?.archetype || fullRec?.archetype || "").trim().toUpperCase();
    if (arch === "SHARP_ORACLE" || arch === "CLUTCH_CALLER") {
      return "prediction";
    }
    return "participation";
  };

  // ── Aggregate authentic per-pillar SXPs from GamificationAndWallet (same ledger as Match Leaderboard) ──
  const buckets: PillarSxpBuckets = createEmptyPillarBuckets();
  const seenTxIds = new Set<string>();
  const seenRecIds = new Set<string>();
  const seenMatchSxpKeys = new Set<string>();
  const matchSkVariants = Array.from(new Set([mid, mid.replace(/^MATCH-/i, "")].filter(Boolean)));
  let leaderboardMatchSxp = 0;

  for (const ck of candKeys) {
    const pkUser = `USER#${ck}`;

    // 1) Read exact materialized Leaderboard Match SXP across both MATCH- and stripped variants
    for (const mVar of matchSkVariants) {
      const dedupeKey = `${pkUser.toLowerCase()}#${mVar.toLowerCase()}`;
      if (seenMatchSxpKeys.has(dedupeKey)) continue;
      seenMatchSxpKeys.add(dedupeKey);
      try {
        const msRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.GamificationAndWallet,
            Key: { userId: pkUser, sk: `MATCH_SXP#${mVar}` },
          })
        );
        if (msRes.Item && Number(msRes.Item.points) > 0) {
          leaderboardMatchSxp += Number(msRes.Item.points);
        }
      } catch {}
    }

    // 2) Read individual point activity transactions (ACT#) for this match
    try {
      const actItems = await queryPaginated(TABLES.GamificationAndWallet, {
        KeyConditionExpression: "userId = :uid AND begins_with(sk, :pfx)",
        ExpressionAttributeValues: { ":uid": pkUser, ":pfx": "ACT#" },
      });
      for (const act of actItems) {
        const txKey = String(act.transactionId || act.sk || "").trim();
        if (!txKey || seenTxIds.has(txKey)) continue;

        const actType = String(act.type || "").trim();
        if (!isMatchScoredType(actType)) continue;

        const pts = Number(act.matchPoints ?? act.points ?? 0);
        if (pts <= 0) continue;

        const meta = act.metadata || {};
        const actMatchId = String(meta.matchId || act.matchId || "").trim();
        const actEngId = String(meta.engagementId || act.engagementId || "")
          .replace(/^ENGAGEMENT#/i, "")
          .replace(/^LOOP#/i, "")
          .trim();

        const belongsToMatch =
          (actMatchId && normalizeMatchKey(actMatchId) === targetMatchKey) ||
          (actEngId && snapshot.engagementsById.has(actEngId));
        if (!belongsToMatch) continue;

        seenTxIds.add(txKey);

        const upperType = actType.toUpperCase();
        if (upperType.includes("RECOGNITION")) {
          const recId = String(meta.recognitionId || "").trim();
          if (recId) seenRecIds.add(recId);
          const pillar = resolveRecognitionPillar({
            engagementType: meta.engagementType,
            engagementId: actEngId,
            recognitionId: recId,
            archetype: meta.archetype || act.archetype,
          });
          buckets[pillar].recognition += pts;
        } else {
          const engType = String(meta.engagementType || snapshot.engagementsById.get(actEngId)?.type || "").trim();
          const pillar = pillarForActivityType(actType, engType);
          buckets[pillar].base += pts;
        }
      }
    } catch {}

    // 3) Read user recognition ledger items across both MATCH- and stripped variants
    for (const mVar of matchSkVariants) {
      try {
        const recItems = await queryPaginated(TABLES.GamificationAndWallet, {
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :skPfx)",
          ExpressionAttributeValues: {
            ":uid": pkUser,
            ":skPfx": `RECOGNITION#MATCH#${mVar}`,
          },
        });
        for (const rec of recItems) {
          const rid = String(rec.recognitionId || rec.sk || "").trim();
          if (!rid || seenRecIds.has(rid)) continue;
          seenRecIds.add(rid);
          const reward = rec.rewards || {};
          const recSxp =
            Number(reward.totalSxp || 0) ||
            Number(reward.accuracySxp || 0) + Number(reward.participationSxp || 0) + Number(reward.streakBonusSxp || 0);
          if (recSxp > 0) {
            const pillar = resolveRecognitionPillar(rec);
            buckets[pillar].recognition += recSxp;
          }
        }
      } catch {}
    }
  }

  // 4) Include any MatchMoments recognitions for this user that were not already counted via ACT# / wallet ledger
  const userParticipatedInMatch = Boolean(statsMatch && (statsMatch.totalInteractions > 0 || statsMatch.participations > 0));
  for (const rec of snapshot.recognitionsList) {
    const rid = String(rec.recognitionId || rec.id || rec.sk || "").trim();
    if (!rid || seenRecIds.has(rid)) continue;

    let appliesToUser = false;
    if (rec.targetType === "user" && rec.targetUserId) {
      const tClean = cleanUserId(String(rec.targetUserId)).toLowerCase();
      const tAlnum = tClean.replace(/[^a-z0-9]/g, "");
      appliesToUser = candLowerSet.has(tClean) || (Boolean(tAlnum) && candAlnumSet.has(tAlnum));
    } else if (rec.targetType === "all" && userParticipatedInMatch) {
      appliesToUser = true;
    }

    if (appliesToUser) {
      seenRecIds.add(rid);
      const reward = rec.rewards || {};
      const recSxp =
        Number(reward.totalSxp || 0) ||
        Number(reward.accuracySxp || 0) + Number(reward.participationSxp || 0) + Number(reward.streakBonusSxp || 0);
      if (recSxp > 0) {
        const pillar = resolveRecognitionPillar(rec);
        buckets[pillar].recognition += recSxp;
      }
    }
  }

  const sumBuckets = (b: PillarSxpBuckets): number =>
    b.knowledge.base + b.knowledge.recognition +
    b.prediction.base + b.prediction.recognition +
    b.participation.base + b.participation.recognition +
    b.community.base + b.community.recognition +
    b.insight.base + b.insight.recognition;

  // Fallback to snapshot per-pillar SXP if no ACT# transactions were found for legacy match data
  if (sumBuckets(buckets) === 0 && statsMatch?.pillarSxp) {
    for (const pKey of ["knowledge", "prediction", "participation", "community", "insight"] as ImpactPillar[]) {
      buckets[pKey].base += statsMatch.pillarSxp[pKey]?.base || 0;
      buckets[pKey].recognition += statsMatch.pillarSxp[pKey]?.recognition || 0;
    }
  }

  // Reconcile against materialized Match Leaderboard SXP so sum(all 5 pillars) === Leaderboard SXP
  let totalMatchSxp = sumBuckets(buckets);
  if (leaderboardMatchSxp > totalMatchSxp) {
    buckets.participation.base += leaderboardMatchSxp - totalMatchSxp;
    totalMatchSxp = leaderboardMatchSxp;
  }

  // Exact SXP totals per pillar
  const knowledgeTotalSxp = buckets.knowledge.base + buckets.knowledge.recognition;
  const predictionTotalSxp = buckets.prediction.base + buckets.prediction.recognition;
  const participationTotalSxp = buckets.participation.base + buckets.participation.recognition;
  const communityTotalSxp = buckets.community.base + buckets.community.recognition;
  const insightTotalSxp = buckets.insight.base + buckets.insight.recognition;

  // Percentage share per pillar using Largest Remainder Rounding (always sums to 100% when totalMatchSxp > 0)
  const [knowledgeScore, predictionScore, participationScore, communityScore, insightScore] = allocatePercentages([
    knowledgeTotalSxp,
    predictionTotalSxp,
    participationTotalSxp,
    communityTotalSxp,
    insightTotalSxp,
  ]);

  // Subfield display text showing SXP earned (+ explicit Recognition SXP if awarded in that category)
  const knowledgeMetric = formatPillarSxpMetric(buckets.knowledge.base, buckets.knowledge.recognition);
  const predictionMetric = formatPillarSxpMetric(buckets.prediction.base, buckets.prediction.recognition);
  const participationMetric = formatPillarSxpMetric(buckets.participation.base, buckets.participation.recognition);
  const communityMetric = formatPillarSxpMetric(buckets.community.base, buckets.community.recognition);
  const insightMetric = formatPillarSxpMetric(buckets.insight.base, buckets.insight.recognition);

  const directRecognitionsCount = Math.max(statsMatch?.recognitionsReceived || 0, seenRecIds.size);
  const overallScore = totalMatchSxp;

  const kpis: UserMatchKPIs = {
    userId: uid,
    matchId: mid,
    seriesId,
    overallScore,
    totalMatchSxp,
    recognitionsCount: directRecognitionsCount,
    kpis: {
      knowledge: {
        score: knowledgeScore,
        sxp: knowledgeTotalSxp,
        baseSxp: buckets.knowledge.base,
        recognitionSxp: buckets.knowledge.recognition,
        label: "Knowledge",
        metric: knowledgeMetric,
        attempted: triviaAttempted,
        correct: triviaCorrect,
      },
      prediction: {
        score: predictionScore,
        sxp: predictionTotalSxp,
        baseSxp: buckets.prediction.base,
        recognitionSxp: buckets.prediction.recognition,
        label: "Prediction",
        metric: predictionMetric,
        attempted: predictionsAttempted,
        resolved: predictionsResolved,
        correct: predictionsWon,
      },
      participation: {
        score: participationScore,
        sxp: participationTotalSxp,
        baseSxp: buckets.participation.base,
        recognitionSxp: buckets.participation.recognition,
        label: "Participation",
        metric: participationMetric,
        cardsEngaged: cardsEngagedCount,
        totalMatchCards,
        totalActions: statsMatch?.totalInteractions || 0,
      },
      community: {
        score: communityScore,
        sxp: communityTotalSxp,
        baseSxp: buckets.community.base,
        recognitionSxp: buckets.community.recognition,
        label: "Community",
        metric: communityMetric,
        pollsVoted,
        debatesVoted,
        totalCommunityCards: snapshot.totalCommunityCards,
        commentsCount: communityComments,
      },
      insight: {
        score: insightScore,
        sxp: insightTotalSxp,
        baseSxp: buckets.insight.base,
        recognitionSxp: buckets.insight.recognition,
        label: "Insight",
        metric: insightMetric,
        takesSubmitted,
        totalTakesCards: snapshot.totalTakesCards,
        peerLikesReceived: takesLikesReceived,
        peerRepliesReceived: takesRepliesReceived,
        recognitionsCount: directRecognitionsCount,
      },
    },
    radarData: [
      { subject: "Knowledge", value: knowledgeScore, fullMark: 100, pillar: "Knowledge", score: knowledgeScore },
      { subject: "Prediction", value: predictionScore, fullMark: 100, pillar: "Prediction", score: predictionScore },
      { subject: "Participation", value: participationScore, fullMark: 100, pillar: "Participation", score: participationScore },
      { subject: "Community", value: communityScore, fullMark: 100, pillar: "Community", score: communityScore },
      { subject: "Insight", value: insightScore, fullMark: 100, pillar: "Insight", score: insightScore },
    ],
    generatedAt: Date.now(),
  };

  return saveUserMatchKPIs(kpis);
}

// ─── 7. User Match Intent Checklist (TABLES.GamificationAndWallet) ─────────────

export async function getMatchIntentAggregates(matchId: string): Promise<MatchIntentAggregates> {
  const mid = cleanMatchId(matchId);
  const empty: MatchIntentAggregates = {
    matchId: mid,
    totalRespondents: 0,
    optionCounts: {},
    trackingPercentages: {},
    updatedAt: Date.now(),
  };

  for (const table of getCandidateTableNames(TABLES.GamificationAndWallet)) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: { userId: `MATCH#${mid}`, sk: "INTENT#AGGREGATE" },
        })
      );
      if (res.Item) {
        const total = Math.max(0, Number(res.Item.totalRespondents || 0));
        const counts: Record<string, number> = res.Item.optionCounts || {};
        const trackingPercentages: Record<string, number> = {};
        for (const [opt, c] of Object.entries(counts)) {
          trackingPercentages[opt] = total > 0 ? Math.min(100, Math.round((Number(c) / total) * 100)) : 0;
        }
        return {
          matchId: mid,
          totalRespondents: total,
          optionCounts: counts,
          trackingPercentages,
          updatedAt: Number(res.Item.updatedAt || Date.now()),
        };
      }
    } catch {
      // next table
    }
  }
  return empty;
}

export async function getUserMatchIntent(
  userId: string,
  matchId: string
): Promise<{ intent: UserMatchWatchingIntent; aggregates: MatchIntentAggregates }> {
  const uid = cleanUserId(userId);
  const mid = cleanMatchId(matchId);

  let intent: UserMatchWatchingIntent = {
    userId: uid,
    matchId: mid,
    selectedMoments: [],
    availableOptions: DEFAULT_WATCHING_INTENT_OPTIONS,
    updatedAt: Date.now(),
  };

  if (uid) {
    for (const table of getCandidateTableNames(TABLES.GamificationAndWallet)) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: table,
            Key: { userId: `USER#${uid}`, sk: `INTENT#${mid}` },
            ConsistentRead: true,
          })
        );
        if (res.Item) {
          intent = {
            userId: uid,
            matchId: mid,
            selectedMoments: Array.isArray(res.Item.selectedMoments) ? res.Item.selectedMoments : [],
            availableOptions:
              Array.isArray(res.Item.availableOptions) && res.Item.availableOptions.length > 0
                ? res.Item.availableOptions
                : DEFAULT_WATCHING_INTENT_OPTIONS,
            updatedAt: Number(res.Item.updatedAt || Date.now()),
          };
          break;
        }
      } catch {
        // next table
      }
    }
  }

  const aggregates = await getMatchIntentAggregates(mid);
  return { intent, aggregates };
}

export async function saveUserMatchIntent(
  userId: string,
  matchId: string,
  selectedMoments: string[],
  availableOptions?: string[]
): Promise<{ intent: UserMatchWatchingIntent; aggregates: MatchIntentAggregates }> {
  const uid = cleanUserId(userId);
  const mid = cleanMatchId(matchId);
  const cleanSelected = Array.from(new Set(selectedMoments.map((s) => String(s).trim()).filter(Boolean)));
  const cleanAvailable =
    Array.isArray(availableOptions) && availableOptions.length > 0
      ? Array.from(new Set(availableOptions.map((s) => String(s).trim()).filter(Boolean)))
      : DEFAULT_WATCHING_INTENT_OPTIONS;

  // Read prior intent so community aggregate counts update incrementally without duplicate counting
  const prevRes = await docClient.send(
    new GetCommand({
      TableName: TABLES.GamificationAndWallet,
      Key: { userId: `USER#${uid}`, sk: `INTENT#${mid}` },
      ConsistentRead: true,
    })
  );
  const prevSelected = new Set<string>(
    Array.isArray(prevRes.Item?.selectedMoments) ? prevRes.Item.selectedMoments : []
  );
  const isNewRespondent = !prevRes.Item;
  const now = Date.now();

  const intent: UserMatchWatchingIntent = {
    userId: uid,
    matchId: mid,
    selectedMoments: cleanSelected,
    availableOptions: cleanAvailable,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.GamificationAndWallet,
      Item: {
        ...intent,
        userId: `USER#${uid}`,
        sk: `INTENT#${mid}`,
        rawUserId: uid,
      },
    })
  );

  // Update aggregate counts atomically in MATCH#<mid> / INTENT#AGGREGATE
  const prevAgg = await getMatchIntentAggregates(mid);
  const nextCounts: Record<string, number> = { ...prevAgg.optionCounts };

  for (const oldOpt of prevSelected) {
    if (!cleanSelected.includes(oldOpt)) {
      nextCounts[oldOpt] = Math.max(0, (nextCounts[oldOpt] || 0) - 1);
    }
  }
  for (const newOpt of cleanSelected) {
    if (!prevSelected.has(newOpt)) {
      nextCounts[newOpt] = (nextCounts[newOpt] || 0) + 1;
    }
  }

  const nextTotal = isNewRespondent ? prevAgg.totalRespondents + 1 : Math.max(1, prevAgg.totalRespondents);
  const trackingPercentages: Record<string, number> = {};
  for (const [opt, c] of Object.entries(nextCounts)) {
    trackingPercentages[opt] = nextTotal > 0 ? Math.min(100, Math.round((c / nextTotal) * 100)) : 0;
  }

  const aggregates: MatchIntentAggregates = {
    matchId: mid,
    totalRespondents: nextTotal,
    optionCounts: nextCounts,
    trackingPercentages,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.GamificationAndWallet,
      Item: {
        userId: `MATCH#${mid}`,
        sk: "INTENT#AGGREGATE",
        ...aggregates,
      },
    })
  );

  return { intent, aggregates };
}

// ─── 8. User Series Progress & Leaderboard Snapshot (TABLES.GamificationAndWallet) ──

function computeBadgeTier(percentile: number): LeaderboardBadgeTier {
  if (percentile <= 0.1) return "GOLD";
  if (percentile <= 0.3) return "SILVER";
  return "BRONZE";
}

export async function getSeriesLeaderboard(seriesId: string, limit = 50): Promise<SeriesLeaderboardEntry[]> {
  const cleanS = cleanSeriesId(seriesId);
  if (!cleanS) return [];

  try {
    const items = await queryPaginated(TABLES.GamificationAndWallet, {
      IndexName: "leaderboardType-points-index",
      KeyConditionExpression: "leaderboardType = :lt",
      ExpressionAttributeValues: { ":lt": `SERIES_PROGRESS#${cleanS}` },
      ScanIndexForward: false,
      Limit: limit,
    });

    const total = items.length;
    return items.slice(0, limit).map((it, idx) => {
      const rank = idx + 1;
      const pct = total > 0 ? rank / total : 1;
      const totalSeriesSxp = Number(it.points ?? it.stats?.totalSeriesSxp ?? 0);
      return {
        rank,
        userId: cleanUserId(it.rawUserId || it.userId),
        userName: String(it.userName || "Fan"),
        userAvatar: String(it.userAvatar || ""),
        fanArchetype: normalizeArchetype(it.fanArchetype),
        totalSeriesSxp,
        cumulativeInteractions: Number(it.stats?.cumulativeInteractions || 0),
        accuracyPercent: Number(it.stats?.accuracyPercent || 0),
        badgeTier: computeBadgeTier(pct),
        updatedAt: Number(it.updatedAt || Date.now()),
      };
    });
  } catch (err) {
    console.warn("[fanJourneyService] getSeriesLeaderboard GSI query notice:", err);
    return [];
  }
}

export async function getUserSeriesProgress(userId: string, seriesId: string): Promise<UserSeriesProgress | null> {
  const uid = cleanUserId(userId);
  const cleanS = cleanSeriesId(seriesId);
  if (!uid || !cleanS) return null;

  for (const table of getCandidateTableNames(TABLES.GamificationAndWallet)) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: { userId: `USER#${uid}`, sk: `SERIES_PROGRESS#${cleanS}` },
          ConsistentRead: true,
        })
      );
      if (res.Item) {
        const it = res.Item;
        return {
          userId: uid,
          seriesId: cleanS,
          userName: String(it.userName || uid),
          userAvatar: String(it.userAvatar || ""),
          fanArchetype: normalizeArchetype(it.fanArchetype),
          favoritePlayers: Array.isArray(it.favoritePlayers) ? it.favoritePlayers : [],
          favoriteClub: String(it.favoriteClub || ""),
          stats: it.stats || {
            cumulativeInteractions: 0,
            cumulativePredictionsCorrect: 0,
            cumulativePredictionsTotal: 0,
            accuracyPercent: 0,
            totalSeriesSxp: 0,
          },
          leaderboard: it.leaderboard || {
            rank: 0,
            totalParticipants: 0,
            percentile: 1,
            badgeTier: "BRONZE",
          },
          updatedAt: Number(it.updatedAt || Date.now()),
        };
      }
    } catch {
      // next table
    }
  }
  return null;
}

export async function saveUserSeriesProgress(progress: UserSeriesProgress): Promise<UserSeriesProgress> {
  const uid = cleanUserId(progress.userId);
  const cleanS = cleanSeriesId(progress.seriesId);
  const now = Date.now();
  const totalSxp = Number(progress.stats?.totalSeriesSxp || 0);

  const itemToSave: UserSeriesProgress = {
    ...progress,
    userId: uid,
    seriesId: cleanS,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLES.GamificationAndWallet,
      Item: {
        ...itemToSave,
        userId: `USER#${uid}`,
        sk: `SERIES_PROGRESS#${cleanS}`,
        rawUserId: uid,
        leaderboardType: `SERIES_PROGRESS#${cleanS}`,
        points: totalSxp,
      },
    })
  );

  // Refresh live rank & percentile via GSI after writing
  const board = await getSeriesLeaderboard(cleanS, 500);
  if (board.length > 0) {
    const found = board.find((e) => e.userId.toLowerCase() === uid.toLowerCase());
    if (found) {
      const pct = Number((found.rank / board.length).toFixed(4));
      itemToSave.leaderboard = {
        rank: found.rank,
        totalParticipants: board.length,
        percentile: pct,
        badgeTier: computeBadgeTier(pct),
      };
    }
  }

  return itemToSave;
}

async function resolveSeriesMatchIds(seriesId: string): Promise<string[]> {
  const cleanS = cleanSeriesId(seriesId);
  const matchSet = new Set<string>();

  const journey = await getSeriesJourneyState(cleanS);
  if (journey) {
    if (journey.currentMatchId) matchSet.add(cleanMatchId(journey.currentMatchId));
    if (journey.nextMatchId) matchSet.add(cleanMatchId(journey.nextMatchId));
    (journey.matchIds || []).forEach((m) => m && matchSet.add(cleanMatchId(m)));
  }

  // Also check SportsData SERIES#<id> / MATCH# links
  try {
    const links = await queryPaginated(TABLES.SportsData, {
      KeyConditionExpression: "entityId = :eId AND begins_with(sk, :pfx)",
      ExpressionAttributeValues: { ":eId": `SERIES#${cleanS}`, ":pfx": "MATCH#" },
    });
    for (const l of links) {
      const m = cleanMatchId(l.matchId || l.match_id);
      if (m) matchSet.add(m);
    }
  } catch {
    // ignore
  }

  // Also check MATCH#META items carrying seriesId
  for (const tbl of Array.from(new Set([...getCandidateTableNames(TABLES.MatchMoments), ...getCandidateTableNames(TABLES.SportsData)]))) {
    try {
      const items = await scanPaginated(tbl, {
        FilterExpression: "begins_with(entityId, :m) AND sk = :meta AND seriesId = :s",
        ExpressionAttributeValues: { ":m": "MATCH#", ":meta": "MATCH#META", ":s": cleanS },
      });
      for (const it of items) {
        const mid = cleanMatchId(it.match_id || it.entityId);
        if (mid) matchSet.add(mid);
      }
      if (matchSet.size > 0) break;
    } catch {
      // continue
    }
  }

  return Array.from(matchSet).filter(Boolean);
}

export async function computeUserSeriesProgress(
  rawUserId: string,
  seriesId: string,
  explicitMatchIds?: string[]
): Promise<UserSeriesProgress> {
  const uid = cleanUserId(rawUserId);
  const cleanS = cleanSeriesId(seriesId);
  const profile = await resolveDynamoUserProfile(uid);

  const matchIds =
    Array.isArray(explicitMatchIds) && explicitMatchIds.length > 0
      ? Array.from(new Set(explicitMatchIds.map(cleanMatchId).filter(Boolean)))
      : await resolveSeriesMatchIds(cleanS);

  let cumulativeInteractions = 0;
  let cumulativePredictionsCorrect = 0;
  let cumulativePredictionsTotal = 0;
  let totalSeriesSxp = 0;

  for (const mid of matchIds) {
    const recap = await computeUserMatchRecap(uid, mid, cleanS);
    cumulativeInteractions += recap.stats.totalInteractions;
    cumulativePredictionsCorrect += recap.stats.predictionsCorrect;
    cumulativePredictionsTotal += recap.stats.predictionsTotal;
    totalSeriesSxp += recap.stats.sxpEarned;
  }

  // Also include any previously awarded CommunityAward SXP bonuses for this user in this series
  const seriesAwards = await getSeriesAwards(cleanS);
  for (const award of seriesAwards) {
    if (cleanUserId(award.winner.userId).toLowerCase() === uid.toLowerCase()) {
      totalSeriesSxp += Number(award.sxpBonusAwarded || 0);
    }
  }

  const accuracyPercent =
    cumulativePredictionsTotal > 0
      ? Math.round((cumulativePredictionsCorrect / cumulativePredictionsTotal) * 100)
      : 0;

  return saveUserSeriesProgress({
    userId: uid,
    seriesId: cleanS,
    userName: profile.userName,
    userAvatar: profile.userAvatar,
    fanArchetype: profile.fanArchetype,
    favoritePlayers: profile.favoritePlayers,
    favoriteClub: profile.favoriteClub,
    stats: {
      cumulativeInteractions,
      cumulativePredictionsCorrect,
      cumulativePredictionsTotal,
      accuracyPercent,
      totalSeriesSxp,
    },
    leaderboard: {
      rank: 1,
      totalParticipants: 1,
      percentile: 1,
      badgeTier: "BRONZE",
    },
    updatedAt: Date.now(),
  });
}

// ─── 9. Community Awards (TABLES.GamificationAndWallet) ────────────────────────

export async function getSeriesAwards(seriesId: string, matchId?: string): Promise<CommunityAward[]> {
  const cleanS = cleanSeriesId(seriesId);
  if (!cleanS) return [];

  const cleanM = matchId ? cleanMatchId(matchId) : "";
  const skPrefix = cleanM ? `AWARD#${cleanM}#` : "AWARD#";

  for (const table of getCandidateTableNames(TABLES.GamificationAndWallet)) {
    try {
      const items = await queryPaginated(table, {
        KeyConditionExpression: "userId = :u AND begins_with(sk, :pfx)",
        ExpressionAttributeValues: { ":u": `SERIES#${cleanS}`, ":pfx": skPrefix },
      });
      if (items.length > 0) {
        return items.map((it) => ({
          awardId: String(it.awardId || `${cleanS}#${it.matchId}#${it.awardType}`),
          seriesId: cleanS,
          matchId: String(it.matchId || ""),
          awardType: it.awardType as CommunityAwardType,
          awardTitle: String(it.awardTitle || ""),
          winner: it.winner || { userId: "", userName: "", userAvatar: "", citation: "", statsHighlight: "" },
          badgeAwardedUrl: String(it.badgeAwardedUrl || ""),
          sxpBonusAwarded: Number(it.sxpBonusAwarded || 0),
          sxpCredited: Boolean(it.sxpCredited),
          awardedAt: Number(it.awardedAt || Date.now()),
        }));
      }
    } catch {
      // next table
    }
  }
  return [];
}

async function creditAwardSxpBonusIdempotently(award: CommunityAward): Promise<boolean> {
  const bonus = Number(award.sxpBonusAwarded || 0);
  const winnerUid = cleanUserId(award.winner?.userId);
  if (bonus <= 0 || !winnerUid || !isValidRealUid(winnerUid)) return false;

  const txId = `AWARD_${award.seriesId}_${award.matchId}_${award.awardType}`;
  const now = Date.now();

  try {
    // 1. Write ledger transaction with ConditionExpression so it can NEVER double-credit
    await docClient.send(
      new PutCommand({
        TableName: TABLES.GamificationAndWallet,
        Item: {
          userId: `USER#${winnerUid}`,
          sk: `ACT#${txId}`,
          transactionId: txId,
          type: "COMMUNITY_AWARD",
          label: `${award.awardTitle} — ${award.winner.citation || award.matchId}`,
          points: bonus,
          metadata: {
            seriesId: award.seriesId,
            matchId: award.matchId,
            awardType: award.awardType,
          },
          createdAt: now,
        },
        ConditionExpression: "attribute_not_exists(sk)",
      })
    );

    // 2. Increment winner balance on IdentityAndAccess if user item exists
    const profile = await resolveDynamoUserProfile(winnerUid);
    if (profile.entityKeyId) {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: { entityId: profile.entityKeyId, sk: "USER#META" },
          UpdateExpression: "ADD totalPoints :b, totalXP :b SET updatedAt = :u",
          ExpressionAttributeValues: { ":b": bonus, ":u": now },
        })
      ).catch(() => {});
    }
    return true;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      return false; // Already credited previously
    }
    console.warn("[fanJourneyService] creditAwardSxpBonus notice:", err);
    return false;
  }
}

export async function upsertCommunityAward(
  input: Omit<CommunityAward, "awardId" | "awardedAt"> & { awardId?: string; awardedAt?: number },
  options: { creditSxpBonus?: boolean } = {}
): Promise<CommunityAward> {
  const cleanS = cleanSeriesId(input.seriesId);
  const cleanM = cleanMatchId(input.matchId);
  const now = input.awardedAt || Date.now();
  const awardId = input.awardId || `${cleanS}_${cleanM}_${input.awardType}`;

  const award: CommunityAward = {
    awardId,
    seriesId: cleanS,
    matchId: cleanM,
    awardType: input.awardType,
    awardTitle: input.awardTitle,
    winner: {
      userId: cleanUserId(input.winner.userId),
      userName: input.winner.userName,
      userAvatar: input.winner.userAvatar || "",
      citation: input.winner.citation || "",
      statsHighlight: input.winner.statsHighlight || "",
    },
    badgeAwardedUrl: input.badgeAwardedUrl || "",
    sxpBonusAwarded: Number(input.sxpBonusAwarded || 0),
    sxpCredited: Boolean(input.sxpCredited),
    awardedAt: now,
  };

  if (options.creditSxpBonus) {
    const credited = await creditAwardSxpBonusIdempotently(award);
    if (credited) award.sxpCredited = true;
  }

  await docClient.send(
    new PutCommand({
      TableName: TABLES.GamificationAndWallet,
      Item: {
        ...award,
        userId: `SERIES#${cleanS}`,
        sk: `AWARD#${cleanM}#${award.awardType}`,
      },
    })
  );

  return award;
}

export async function autoComputeMatchAwards(
  seriesId: string,
  matchId: string,
  awardTypes: CommunityAwardType[] = ["fan_of_the_match", "prediction_oracle", "top_analyst"],
  creditSxpBonus = true
): Promise<CommunityAward[]> {
  const cleanS = cleanSeriesId(seriesId);
  const cleanM = cleanMatchId(matchId);
  const snapshot = await collectMatchActivitySnapshot(cleanM);
  const participants = Array.from(snapshot.participants.values());
  if (participants.length === 0) return [];

  const created: CommunityAward[] = [];

  for (const type of awardTypes) {
    let winnerStats: ParticipantMatchStats | null = null;
    let awardTitle = "Fan of the Match";
    let citation = "Top Community Contributor";
    let statsHighlight = "";
    let sxpBonus = 150;

    if (type === "fan_of_the_match") {
      winnerStats = [...participants].sort(
        (a, b) =>
          (b.participations * 2 + b.likes + (b.comments + b.replies) * 2 + b.shares) -
          (a.participations * 2 + a.likes + (a.comments + a.replies) * 2 + a.shares)
      )[0];
      awardTitle = "Fan of the Match";
      citation = "Most Engaging Fan";
      statsHighlight = `${winnerStats.likes + winnerStats.participations + winnerStats.shares} reactions • ${winnerStats.comments + winnerStats.replies} replies`;
      sxpBonus = 150;
    } else if (type === "prediction_oracle") {
      const predictors = participants.filter((p) => p.predictionsTotal > 0);
      if (predictors.length > 0) {
        winnerStats = [...predictors].sort((a, b) => {
          const accA = a.predictionsCorrect / a.predictionsTotal;
          const accB = b.predictionsCorrect / b.predictionsTotal;
          if (accB !== accA) return accB - accA;
          return b.predictionsCorrect - a.predictionsCorrect;
        })[0];
        const accPct = Math.round((winnerStats.predictionsCorrect / winnerStats.predictionsTotal) * 100);
        awardTitle = "Prediction Oracle";
        citation = "Sharpest Match Calls";
        statsHighlight = `${winnerStats.predictionsCorrect}/${winnerStats.predictionsTotal} predictions (${accPct}% accuracy)`;
        sxpBonus = 150;
      }
    } else if (type === "top_analyst") {
      const analysts = participants.filter((p) => p.comments + p.replies + p.upvotesReceived > 0);
      if (analysts.length > 0) {
        winnerStats = [...analysts].sort(
          (a, b) =>
            (b.comments + b.replies * 2 + b.upvotesReceived * 2) -
            (a.comments + a.replies * 2 + a.upvotesReceived * 2)
        )[0];
        awardTitle = "Top Analyst";
        citation = "Most Upvoted Match Takes";
        statsHighlight = `${winnerStats.comments + winnerStats.replies} takes • ${winnerStats.upvotesReceived} upvotes`;
        sxpBonus = 125;
      }
    }

    if (!winnerStats) continue;
    const profile = await resolveDynamoUserProfile(winnerStats.userId);

    const saved = await upsertCommunityAward(
      {
        seriesId: cleanS,
        matchId: cleanM,
        awardType: type,
        awardTitle,
        winner: {
          userId: winnerStats.userId,
          userName: profile.userName || winnerStats.userName,
          userAvatar: profile.userAvatar || winnerStats.userAvatar,
          citation,
          statsHighlight,
        },
        badgeAwardedUrl: "",
        sxpBonusAwarded: sxpBonus,
      },
      { creditSxpBonus }
    );
    created.push(saved);
  }

  return created;
}

export async function deleteCommunityAward(
  seriesId: string,
  matchId: string,
  awardType: CommunityAwardType
): Promise<void> {
  const cleanS = cleanSeriesId(seriesId);
  const cleanM = cleanMatchId(matchId);

  await docClient.send(
    new DeleteCommand({
      TableName: TABLES.GamificationAndWallet,
      Key: {
        userId: `SERIES#${cleanS}`,
        sk: `AWARD#${cleanM}#${awardType}`,
      },
    })
  );
}
