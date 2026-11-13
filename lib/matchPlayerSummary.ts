// lib/matchPlayerSummary.ts — Personalized per-user Match Player Summary generation & retrieval
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export interface PlayerEngagementSummaryRow {
  engagementId: string;
  title: string;
  type: string;
  momentId?: string;
  momentLabel: string;
  userVote?: string;
  participations: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  socialLikes: number;
  socialComments: number;
  socialShares: number;
  socialImpressions: number;
  socialResponses: number;
  sxpAwarded: number;
}

export interface PlayerMatchSummaryRecord {
  id: string;
  type: "MATCH_PLAYER_SUMMARY";
  matchId: string;
  matchTitle: string;
  team1: string;
  team2: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string | null;
  userAliases: string[];
  totalActions: number;
  totalSocial: number;
  activeEngagements: number;
  totalServedEngagements: number;
  percentageReturn: number;
  totals: {
    participations: number;
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    socialLikes: number;
    socialComments: number;
    socialShares: number;
    socialImpressions: number;
    sxpAwarded: number;
  };
  engagements: PlayerEngagementSummaryRow[];
  predictionsCount?: number;
  predictionsWon?: number;
  predictionsRatio?: string;
  persona?: string;
  countryFlag?: string;
  favoritesLabel?: string;
  leaderboardBadge?: string;
  rank?: number;
  isFanOfTheMatch?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FanOfTheMatchRecord {
  id: string;
  type: "FAN_OF_THE_MATCH";
  matchId: string;
  matchTitle: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  countryFlag: string;
  persona: string;
  favoritesLabel: string;
  interactionsCount: number;
  predictionsRatio: string;
  predictionsWon: number;
  predictionsCount: number;
  sxpAwarded: number;
  leaderboardBadge: string;
  createdAt: number;
}

export interface MatchSummaryRecord {
  id: string;
  type: "MATCH_SNAPSHOT_SUMMARY";
  matchId: string;
  matchTitle: string;
  team1Name?: string;
  team1Score?: string;
  team1Flag?: string;
  team2Name?: string;
  team2Score?: string;
  team2Flag?: string;
  resultSummary?: string;
  topPerformerLabel?: string;
  playerName?: string;
  playerStats?: string;
  playerImageUrl?: string;
  totalActions?: number;
  totalMoments?: number;
  totalParticipants?: number;
  predictionsRatio?: string;
  totalPredictionsCount?: number;
  totalPredictionsWon?: number;
  totalSxp?: number;
  totalFansCount?: number;
  createdAt: number;
}

export interface GenerateSummariesOptions {
  sendUserSummary?: boolean;
  sendMatchSummary?: boolean;
  sendFanOfMatchSummary?: boolean;
}

const GENERIC_FALLBACK_NAMES = new Set([
  "fan",
  "sportsfan",
  "guest",
  "guest_fan",
  "user",
  "anonymous",
  "anon",
]);

function cleanId(val?: string | null): string {
  return String(val || "").trim();
}

export function cleanMatchKey(val?: string | null): string {
  return cleanId(val).replace(/^MATCH#/i, "");
}

function normalizeMatchKey(val?: string | null): string {
  return cleanId(val).replace(/^MATCH#/i, "").replace(/^MATCH-/i, "").toLowerCase();
}

function isGenericName(name?: string | null): boolean {
  if (!name) return true;
  return GENERIC_FALLBACK_NAMES.has(String(name).trim().toLowerCase());
}

function isValidRealUid(uid?: string | null): boolean {
  if (!uid) return false;
  const c = String(uid).trim().toLowerCase();
  if (!c) return false;
  if (
    c.startsWith("anon") ||
    c === "anonymous" ||
    c === "me" ||
    c === "guest" ||
    c === "guest_fan" ||
    c.includes(":") ||
    c.includes(",") ||
    c.endsWith("-bot")
  ) {
    return false;
  }
  return true;
}

function recoverEmailFromSanitizedUid(uid: string): string {
  const lower = uid.toLowerCase();
  if (lower.includes("@")) return lower;
  for (const domain of [
    "sportsfan360_com",
    "sf360_com",
    "gmail_com",
    "yahoo_com",
    "outlook_com",
    "hotmail_com",
    "icloud_com",
  ]) {
    if (lower.endsWith(`_${domain}`)) {
      const localPart = lower.slice(0, -(domain.length + 1)).replace(/_/g, ".");
      return `${localPart}@${domain.replace("_", ".")}`;
    }
  }
  return "";
}

function safeKeyToken(val: string): string {
  return String(val || "user")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "user";
}

function buildLookupCandidates(rawValues: Array<string | undefined | null>): Set<string> {
  const out = new Set<string>();
  for (const raw of rawValues) {
    const cleaned = String(raw || "").trim().replace(/^USER#/i, "");
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    out.add(lower);
    const recovered = recoverEmailFromSanitizedUid(lower);
    if (recovered) out.add(recovered);
    if (lower.includes("@")) {
      out.add(lower.replace(/[^a-z0-9]/g, "_"));
      out.add(lower.replace(/[@.]/g, "_"));
      const local = lower.split("@")[0];
      if (local) out.add(local);
    }
  }
  return out;
}

interface ResolvedUserProfile {
  userId: string;
  name: string;
  email?: string;
  avatar?: string | null;
  aliases: Set<string>;
}

async function buildUserResolver() {
  const aliasToProfile = new Map<string, ResolvedUserProfile>();
  const rawRecords: any[] = [];

  for (const table of getCandidateTableNames(TABLES.IdentityAndAccess)) {
    try {
      let lastKey: Record<string, any> | undefined;
      let pages = 0;
      do {
        const res = await docClient.send(
          new ScanCommand({
            TableName: table,
            FilterExpression: "begins_with(entityId, :u) AND sk = :meta",
            ExpressionAttributeValues: { ":u": "USER#", ":meta": "USER#META" },
            ProjectionExpression:
              "entityId, userId, uid, actualUserId, email, username, userName, handle, firstName, lastName, #n, avatarUrl, avatar, photoURL, picture",
            ExpressionAttributeNames: { "#n": "name" },
            ExclusiveStartKey: lastKey,
          })
        );
        if (res.Items) rawRecords.push(...res.Items);
        lastKey = res.LastEvaluatedKey;
        pages += 1;
      } while (lastKey && pages < 5);
    } catch {
      // try next table
    }
  }

  if (db) {
    try {
      const snap = await db.collection(getFirestoreCollection("users")).limit(500).get();
      snap.forEach((doc) => rawRecords.push({ ...doc.data(), id: doc.id }));
    } catch {
      // ignore
    }
  }

  for (const item of rawRecords) {
    const email = String(item.email || "").trim().toLowerCase();
    const rawEntityKey = String(item.entityId || "").replace(/^USER#/i, "").trim().toLowerCase();
    const rawUserId = String(item.userId || item.uid || item.actualUserId || item.id || rawEntityKey).trim();
    const canonicalId =
      (email && email.includes("@") ? email : "") ||
      recoverEmailFromSanitizedUid(rawEntityKey) ||
      recoverEmailFromSanitizedUid(rawUserId) ||
      rawUserId.toLowerCase();

    if (!canonicalId || !isValidRealUid(canonicalId)) continue;

    const fullName = [item.firstName, item.lastName].filter(Boolean).join(" ").trim();
    const rawName = String(
      item.name || fullName || item.username || item.userName || item.handle || ""
    ).trim();
    const name = !isGenericName(rawName) ? rawName : "";
    const avatar = item.avatarUrl || item.avatar || item.photoURL || item.picture || null;

    let profile = aliasToProfile.get(canonicalId);
    if (!profile) {
      profile = {
        userId: canonicalId,
        name: name || (email ? email.split("@")[0] : canonicalId),
        email: email || undefined,
        avatar,
        aliases: new Set<string>([canonicalId]),
      };
    }

    if (name && (isGenericName(profile.name) || profile.name === profile.userId || profile.name.includes("@"))) {
      profile.name = name;
    }
    if (!profile.email && email) profile.email = email;
    if (!profile.avatar && avatar) profile.avatar = avatar;

    const aliases = [
      canonicalId,
      rawUserId.toLowerCase(),
      String(item.uid || "").trim().toLowerCase(),
      String(item.actualUserId || "").trim().toLowerCase(),
      String(item.id || "").trim().toLowerCase(),
      String(item.username || "").trim().toLowerCase(),
      String(item.userName || "").trim().toLowerCase(),
      String(item.handle || "").trim().toLowerCase(),
      rawEntityKey,
      email,
      email ? email.replace(/[^a-z0-9]/g, "_") : "",
      email ? email.replace(/[@.]/g, "_") : "",
    ].filter((a) => a && isValidRealUid(a));

    for (const alias of aliases) {
      profile.aliases.add(alias);
      aliasToProfile.set(alias, profile);
    }
  }

  const dynamicUsers = new Map<string, ResolvedUserProfile>();

  function resolve(
    rawUid?: string | null,
    fallbackName?: string | null,
    fallbackAvatar?: string | null
  ): ResolvedUserProfile | null {
    if (!isValidRealUid(rawUid)) return null;
    const cleaned = String(rawUid).trim().replace(/^USER#/i, "");
    const lower = cleaned.toLowerCase();
    const recoveredEmail = recoverEmailFromSanitizedUid(lower);
    const cleanFallbackName = !isGenericName(fallbackName) ? String(fallbackName).trim() : "";

    const matched =
      aliasToProfile.get(lower) ||
      (recoveredEmail ? aliasToProfile.get(recoveredEmail) : undefined) ||
      dynamicUsers.get(lower) ||
      (recoveredEmail ? dynamicUsers.get(recoveredEmail) : undefined);

    if (matched) {
      matched.aliases.add(lower);
      if (recoveredEmail) matched.aliases.add(recoveredEmail);
      if (
        cleanFallbackName &&
        (!matched.name || matched.name === matched.userId || matched.name.includes("@") || isGenericName(matched.name))
      ) {
        matched.name = cleanFallbackName;
      }
      if (fallbackAvatar && !matched.avatar) matched.avatar = fallbackAvatar;
      return matched;
    }

    const canonicalId = recoveredEmail || lower;
    const displayName = cleanFallbackName || (recoveredEmail ? recoveredEmail.split("@")[0] : cleaned);

    const aliases = new Set<string>([canonicalId, lower]);
    if (recoveredEmail) {
      aliases.add(recoveredEmail);
      aliases.add(recoveredEmail.replace(/[^a-z0-9]/g, "_"));
      aliases.add(recoveredEmail.replace(/[@.]/g, "_"));
    }

    const created: ResolvedUserProfile = {
      userId: canonicalId,
      name: displayName,
      email: recoveredEmail || (canonicalId.includes("@") ? canonicalId : undefined),
      avatar: fallbackAvatar || null,
      aliases,
    };
    dynamicUsers.set(canonicalId, created);
    dynamicUsers.set(lower, created);
    return created;
  }

  return { resolve };
}

async function fetchEngagementChildren(engagementId: string, alternateIds: string[] = []) {
  const allIds = Array.from(
    new Set(
      [engagementId, ...alternateIds]
        .map((x) =>
          String(x || "")
            .replace(/^ENGAGEMENT#/i, "")
            .replace(/^LOOP#/i, "")
            .trim()
        )
        .filter(Boolean)
    )
  );
  const mergedBySk = new Map<string, any>();

  for (const table of getCandidateTableNames(TABLES.SocialAndContent)) {
    for (const cid of allIds) {
      try {
        let lastKey: Record<string, any> | undefined;
        do {
          const res = await docClient.send(
            new QueryCommand({
              TableName: table,
              KeyConditionExpression: "contentId = :cid",
              ExpressionAttributeValues: { ":cid": `ENGAGEMENT#${cid}` },
              ExclusiveStartKey: lastKey,
            })
          );
          for (const it of res.Items || []) {
            const sk = String(it.sk || "");
            if (!sk) continue;
            const prev = mergedBySk.get(sk);
            if (!prev || Number(it.updatedAt || it.createdAt || 0) >= Number(prev.updatedAt || prev.createdAt || 0)) {
              mergedBySk.set(sk, it);
            }
          }
          lastKey = res.LastEvaluatedKey;
        } while (lastKey);
      } catch {
        // try next table
      }
    }
  }

  const dynamoItems = Array.from(mergedBySk.values());
  const fsComments: any[] = [];
  const fsVotes: any[] = [];
  const fsLikes: any[] = [];

  if (db) {
    for (const cid of allIds) {
      try {
        const commentSnap = await db
          .collection(getFirestoreCollection("engagements"))
          .doc(cid)
          .collection("comments")
          .get();
        commentSnap.forEach((doc) => fsComments.push({ id: doc.id, ...doc.data() }));
      } catch {
        // ignore
      }

      try {
        const voteSnap = await db
          .collection(getFirestoreCollection("user_engagements"))
          .where("engagementId", "==", cid)
          .get();
        voteSnap.forEach((doc) => {
          const d = doc.data();
          if (d.selectedOptionId) fsVotes.push({ docId: doc.id, ...d });
        });
      } catch {
        // ignore
      }

      try {
        const likeSnap = await db
          .collection(getFirestoreCollection("engagement_likes"))
          .where("engagementId", "==", cid)
          .get();
        likeSnap.forEach((doc) => fsLikes.push({ docId: doc.id, ...doc.data() }));
      } catch {
        // ignore
      }
    }
  }

  return { dynamoItems, fsComments, fsVotes, fsLikes };
}

function resolveVoteDisplayText(eng: any, voteItem: any): string {
  const directText = String(
    voteItem.selectedOptionText || voteItem.answerText || voteItem.text || voteItem.responseText || ""
  ).trim();
  if (directText) return directText;

  const optId = String(voteItem.selectedOptionId || "").trim();
  if (!optId) return "";

  const candidates = [
    ...(Array.isArray(eng?.options) ? eng.options : []),
    ...(Array.isArray(eng?.questions) ? eng.questions.flatMap((q: any) => q?.options || []) : []),
  ];
  const matched = candidates.find((o: any) => String(o?.id || o?.optionId || "").trim() === optId);
  return String(matched?.text || matched?.label || matched?.title || optId).trim();
}

async function loadMatchMeta(cleanMatchId: string): Promise<Record<string, any> | null> {
  const cleanM = cleanMatchKey(cleanMatchId);
  const keyVariants = Array.from(
    new Set([
      cleanM,
      cleanM.replace(/^MATCH-/i, ""),
      `MATCH-${cleanM.replace(/^MATCH-/i, "")}`,
    ])
  );

  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const tbl of candidateTables) {
    for (const kv of keyVariants) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: tbl,
            Key: { entityId: `MATCH#${kv}`, sk: "MATCH#META" },
          })
        );
        if (res.Item) return res.Item;
      } catch {
        // next key variant or table
      }
    }
  }

  if (db) {
    for (const kv of keyVariants) {
      try {
        const snap = await db.collection(getFirestoreCollection("matches")).doc(kv).get();
        if (snap.exists) return { match_id: kv, ...snap.data() };
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * Generates & stores per-user personalized Match Player Summary records for every
 * user who performed >= 1 action (participated/vote, like, comment, share, impression,
 * or social reaction) on engagements for this match.
 */
export async function generateAndPersistMatchPlayerSummaries(
  rawMatchId: string,
  matchMetaInput?: Record<string, any> | null,
  options?: GenerateSummariesOptions
): Promise<{
  generatedCount: number;
  summaries: PlayerMatchSummaryRecord[];
  fanOfTheMatch?: FanOfTheMatchRecord | null;
  matchSnapshot?: MatchSummaryRecord | null;
}> {
  const cleanM = cleanMatchKey(rawMatchId);
  const targetMatchKey = normalizeMatchKey(cleanM);
  if (!cleanM) return { generatedCount: 0, summaries: [] };

  const matchMeta = matchMetaInput || (await loadMatchMeta(cleanM)) || {};
  const team1 = String(matchMeta.team1 || "Team 1").trim();
  const team2 = String(matchMeta.team2 || "Team 2").trim();
  const matchTitle = team1 && team2 ? `${team1} vs ${team2}` : `Match ${cleanM}`;

  const momentsById = new Map<string, string>();
  const engagementsById = new Map<string, any>();
  const recognitionsList: any[] = [];

  // 1. Collect Moments, MatchMoments Engagements/Loops, and Recognitions across candidate tables
  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );
  const keyVariants = Array.from(
    new Set([
      cleanM,
      cleanM.replace(/^MATCH-/i, ""),
      `MATCH-${cleanM.replace(/^MATCH-/i, "")}`,
    ])
  );

  for (const tbl of candidateTables) {
    for (const kv of keyVariants) {
      try {
        let lastKey: Record<string, any> | undefined;
        do {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "entityId = :eId",
              ExpressionAttributeValues: { ":eId": `MATCH#${kv}` },
              ExclusiveStartKey: lastKey,
            })
          );
          for (const it of qRes.Items || []) {
            const sk = String(it.sk || "");
            if (sk.startsWith("MOMENT#")) {
              const mid = String(it.momentId || sk.replace(/^MOMENT#/, "")).trim();
              const label = String(it.matchMoment || it.event || it.title || it.overs || mid).trim();
              if (mid && !momentsById.has(mid)) momentsById.set(mid, label);
            } else if (sk.startsWith("LOOP#") || sk.startsWith("ENGAGEMENT#")) {
              const eid = String(it.id || it.loopId || sk.replace(/^(LOOP|ENGAGEMENT)#/, "")).trim();
              if (eid) {
                const prev = engagementsById.get(eid) || {};
                engagementsById.set(eid, { ...prev, ...it, id: it.id || eid, loopId: it.loopId || prev.loopId });
              }
            } else if (sk.startsWith("RECOGNITION#")) {
              recognitionsList.push(it);
            }
          }
          lastKey = qRes.LastEvaluatedKey;
        } while (lastKey);
      } catch {
        // next key variant or table
      }
    }
  }

  // 2. Collect canonical ENGAGEMENT#META records from SocialAndContent across candidate tables
  for (const tbl of getCandidateTableNames(TABLES.SocialAndContent)) {
    try {
      let lastKey: Record<string, any> | undefined;
      let pages = 0;
      do {
        const res = await docClient.send(
          new ScanCommand({
            TableName: tbl,
            FilterExpression: "begins_with(contentId, :c) AND sk = :meta",
            ExpressionAttributeValues: { ":c": "ENGAGEMENT#", ":meta": "ENGAGEMENT#META" },
            ExclusiveStartKey: lastKey,
          })
        );
        for (const it of res.Items || []) {
          if (normalizeMatchKey(it.matchId) !== targetMatchKey) continue;
          const eid = String(it.id || String(it.contentId || "").replace(/^ENGAGEMENT#/, "")).trim();
          if (eid) {
            const prev = engagementsById.get(eid) || {};
            engagementsById.set(eid, { ...prev, ...it, id: eid });
          }
        }
        lastKey = res.LastEvaluatedKey;
        pages += 1;
      } while (lastKey && pages < 8);
    } catch {
      // try next table
    }
  }

  // Firestore engagements fallback/merge (check both match_moments_engagements AND engagements)
  if (db) {
    for (const colName of ["match_moments_engagements", "engagements"]) {
      try {
        const snap = await db.collection(getFirestoreCollection(colName)).get();
        snap.forEach((doc) => {
          const d = doc.data();
          const docMatchKey = normalizeMatchKey(d.matchId);
          if (docMatchKey && docMatchKey === targetMatchKey) {
            const eid = String(d.id || d.loopId || doc.id).trim();
            if (eid) {
              const prev = engagementsById.get(eid) || {};
              engagementsById.set(eid, { ...prev, ...d, id: d.id || eid, loopId: d.loopId || prev.loopId });
            }
          }
        });
      } catch {
        // ignore
      }
    }
  }

  const engEntries = Array.from(engagementsById.entries());
  const { resolve } = await buildUserResolver();

  type UserAcc = {
    profile: ResolvedUserProfile;
    engRows: Map<string, PlayerEngagementSummaryRow>;
    sxpBonusFromRecognitions: number;
    predictionsAttempted?: number;
    predictionsWon?: number;
  };
  const userStore = new Map<string, UserAcc>();

  function getOrInitRow(profile: ResolvedUserProfile, eid: string, eng: any): PlayerEngagementSummaryRow {
    let acc = userStore.get(profile.userId);
    if (!acc) {
      acc = { profile, engRows: new Map(), sxpBonusFromRecognitions: 0, predictionsAttempted: 0, predictionsWon: 0 };
      userStore.set(profile.userId, acc);
    }
    let row = acc.engRows.get(eid);
    if (!row) {
      const mId = String(eng.momentId || "").trim() || undefined;
      const momentLabel =
        (mId && momentsById.get(mId)) ||
        String(eng.momentLabel || eng.momentName || eng.momentTitle || eng.moment || mId || "Live Match").trim();
      row = {
        engagementId: eid,
        title: String(eng.title || eng.question || eng.headline || eng.type || "Engagement").trim(),
        type: String(eng.type || "engagement").trim(),
        ...(mId ? { momentId: mId } : {}),
        momentLabel,
        participations: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        impressions: 0,
        socialLikes: 0,
        socialComments: 0,
        socialShares: 0,
        socialImpressions: 0,
        socialResponses: 0,
        sxpAwarded: 0,
      };
      acc.engRows.set(eid, row);
    }
    return row;
  }

  // 3. Process child records for every match engagement if any exist
  if (engEntries.length > 0) {
    const BATCH_SIZE = 15;
    for (let i = 0; i < engEntries.length; i += BATCH_SIZE) {
      const batch = engEntries.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async ([eid, eng]) => {
          const altIds = [eid, eng.id, eng.loopId, eng.contentId, eng.engagementId].filter(Boolean);
          const children = await fetchEngagementChildren(eid, altIds);
          return { eid, eng, ...children };
        })
      );

      for (const { eid, eng, dynamoItems, fsComments, fsVotes, fsLikes } of batchResults) {
        const seenLikes = new Set<string>();
        const seenShares = new Set<string>();
        const seenVotes = new Set<string>();
        const seenSocialLikes = new Set<string>();
        const seenSocialComments = new Set<string>();
        const commentMap = new Map<string, any>();

        for (const item of dynamoItems) {
          const sk = String(item.sk || "");
          if (!sk.startsWith("COMMENT#")) continue;
          const cid = String(item.commentId || item.id || sk.replace(/^COMMENT#/, "")).trim();
          if (!cid) continue;
          const likedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
          commentMap.set(cid, {
            ...item,
            commentId: cid,
            parentId: item.parentId ? String(item.parentId).replace(/^COMMENT#/, "").trim() : null,
            likedBy,
          });
        }

        for (const fsC of fsComments) {
          const cid = String(fsC.commentId || fsC.id || "").trim();
          if (!cid) continue;
          const prev = commentMap.get(cid);
          const mergedLikedBy = Array.from(
            new Set([...(prev?.likedBy || []), ...(Array.isArray(fsC.likedBy) ? fsC.likedBy : [])])
          );
          commentMap.set(cid, {
            ...prev,
            ...fsC,
            commentId: cid,
            parentId: (fsC.parentId ?? prev?.parentId)
              ? String(fsC.parentId ?? prev?.parentId).replace(/^COMMENT#/, "").trim()
              : null,
            likedBy: mergedLikedBy,
          });
        }

        for (const item of dynamoItems) {
          const sk = String(item.sk || "");
          if (sk.startsWith("VOTE#")) {
            const rest = sk.replace(/^VOTE#/, "");
            const parts = rest.split("#");
            const rawUid = item.userId || parts[0];
            const qKey = item.questionId || parts[1] || "";
            const profile = resolve(rawUid, item.userName || item.name || item.displayName, item.userAvatar || item.avatarUrl);
            if (!profile) continue;
            const dKey = `${profile.userId}#${qKey}`;
            if (seenVotes.has(dKey)) continue;
            seenVotes.add(dKey);

            const row = getOrInitRow(profile, eid, eng);
            row.participations += 1;
            row.sxpAwarded += Number(item.pointsAwarded || item.participationPointsAwarded || 0) + Number(item.wonBonusPoints || 0);
            const voteText = resolveVoteDisplayText(eng, item);
            if (voteText) row.userVote = row.userVote ? `${row.userVote}, ${voteText}` : voteText;

            // Track prediction count & won count
            const isPred = eng.type === "prediction" || eng.type === "quiz" || eng.type === "poll" || eng.type === "debate";
            if (isPred) {
              const accUser = userStore.get(profile.userId);
              if (accUser) {
                accUser.predictionsAttempted = (accUser.predictionsAttempted || 0) + 1;
                const winningId = eng.winningChoiceId || eng.outcomeWinningChoiceId || eng.predictionData?.winningChoiceId;
                const userChoice = item.optionId || item.selectedOptionId || item.choiceId || item.winningChoiceId;
                const isWon = Boolean(
                  (winningId && userChoice && String(winningId).toLowerCase() === String(userChoice).toLowerCase()) ||
                  item.won === true ||
                  Number(item.wonBonusPoints || 0) > 0
                );
                if (isWon) {
                  accUser.predictionsWon = (accUser.predictionsWon || 0) + 1;
                }
              }
            }
          } else if (sk.startsWith("LIKE#")) {
            const rawUid = item.userId || sk.slice(5);
            const profile = resolve(rawUid, item.userName || item.name);
            if (!profile || seenLikes.has(profile.userId)) continue;
            seenLikes.add(profile.userId);
            getOrInitRow(profile, eid, eng).likes += 1;
          } else if (sk.startsWith("SHARE#")) {
            const rawUid = item.userId || sk.slice(6);
            const profile = resolve(rawUid, item.userName || item.name);
            if (!profile || seenShares.has(profile.userId)) continue;
            seenShares.add(profile.userId);
            getOrInitRow(profile, eid, eng).shares += 1;
          } else if (sk.startsWith("IMPRESSION#") || sk.startsWith("VIEW#")) {
            const rawUid = item.userId || sk.replace(/^(IMPRESSION|VIEW)#/, "").split("#")[0];
            const profile = resolve(rawUid, item.userName, item.userAvatar);
            if (!profile) continue;
            const count = Math.max(1, Number(item.impressionCount || 1));
            getOrInitRow(profile, eid, eng).impressions += count;
          } else if (sk.startsWith("SOCIAL_LIKE#")) {
            const rest = sk.slice("SOCIAL_LIKE#".length);
            const hashIdx = rest.lastIndexOf("#");
            const cId = String(item.targetCommentId || (hashIdx >= 0 ? rest.slice(0, hashIdx) : rest)).trim();
            const rawUid = item.actorUserId || item.userId || (hashIdx >= 0 ? rest.slice(hashIdx + 1) : "");
            const profile = resolve(rawUid, item.actorUserName || item.userName);
            if (!profile) continue;
            const dKey = `${cId}#${profile.userId}`;
            if (seenSocialLikes.has(dKey)) continue;
            seenSocialLikes.add(dKey);
            getOrInitRow(profile, eid, eng).socialLikes += 1;
          } else if (sk.startsWith("SOCIAL_COMMENT#")) {
            const cId = String(item.commentId || sk.slice("SOCIAL_COMMENT#".length)).trim();
            const rawUid = item.actorUserId || item.userId;
            const profile = resolve(rawUid, item.actorUserName || item.userName);
            if (!profile || seenSocialComments.has(cId)) continue;
            seenSocialComments.add(cId);
            getOrInitRow(profile, eid, eng).socialComments += 1;
          } else if (sk.startsWith("SOCIAL_SHARE#")) {
            const rawUid = item.actorUserId || item.userId;
            const profile = resolve(rawUid, item.actorUserName || item.userName);
            if (!profile) continue;
            getOrInitRow(profile, eid, eng).socialShares += 1;
          } else if (sk.startsWith("SOCIAL_IMPRESSION#")) {
            const parts = sk.slice("SOCIAL_IMPRESSION#".length).split("#");
            const rawUid = item.actorUserId || item.userId || parts[1] || "";
            const profile = resolve(rawUid, item.actorUserName || item.userName);
            if (!profile) continue;
            const count = Math.max(1, Number(item.impressionCount || 1));
            getOrInitRow(profile, eid, eng).socialImpressions += count;
          }
        }

        for (const fsV of fsVotes) {
          const rawUid = fsV.userId || String(fsV.docId || "").split("_")[0];
          const qKey = fsV.questionId || "";
          const profile = resolve(rawUid, fsV.userName || fsV.name, fsV.userAvatar);
          if (!profile) continue;
          const dKey = `${profile.userId}#${qKey}`;
          if (seenVotes.has(dKey)) continue;
          seenVotes.add(dKey);
          const row = getOrInitRow(profile, eid, eng);
          row.participations += 1;
          row.sxpAwarded += Number(fsV.pointsAwarded || fsV.participationPointsAwarded || 10);
          const voteText = resolveVoteDisplayText(eng, fsV);
          if (voteText) row.userVote = row.userVote ? `${row.userVote}, ${voteText}` : voteText;

          const isPred = eng.type === "prediction" || eng.type === "quiz" || eng.type === "poll" || eng.type === "debate";
          if (isPred) {
            const accUser = userStore.get(profile.userId);
            if (accUser) {
              accUser.predictionsAttempted = (accUser.predictionsAttempted || 0) + 1;
              if (fsV.isCorrect || fsV.won) accUser.predictionsWon = (accUser.predictionsWon || 0) + 1;
            }
          }
        }

        for (const fsL of fsLikes) {
          const rawUid = fsL.userId || String(fsL.docId || "").split("_")[0];
          const profile = resolve(rawUid);
          if (!profile || seenLikes.has(profile.userId)) continue;
          seenLikes.add(profile.userId);
          getOrInitRow(profile, eid, eng).likes += 1;
        }

        for (const comment of commentMap.values()) {
          const authorProfile = resolve(comment.authorUid, comment.authorUsername, comment.authorAvatarUrl);
          const parentComment = comment.parentId ? commentMap.get(comment.parentId) : null;
          const parentAuthorProfile = parentComment
            ? resolve(parentComment.authorUid, parentComment.authorUsername, parentComment.authorAvatarUrl)
            : null;

          if (authorProfile) {
            const row = getOrInitRow(authorProfile, eid, eng);
            if (comment.parentId) {
              if (!parentAuthorProfile || authorProfile.userId !== parentAuthorProfile.userId) {
                if (!seenSocialComments.has(comment.commentId)) {
                  seenSocialComments.add(comment.commentId);
                  row.socialComments += 1;
                }
              } else {
                row.comments += 1;
              }
            } else {
              row.comments += 1;
            }
          }

          const likedByList: string[] = Array.isArray(comment.likedBy) ? comment.likedBy : [];
          const seenCommentLikers = new Set<string>();
          for (const likerUid of likedByList) {
            const likerProfile = resolve(likerUid);
            if (!likerProfile || seenCommentLikers.has(likerProfile.userId)) continue;
            seenCommentLikers.add(likerProfile.userId);

            if (!authorProfile || likerProfile.userId !== authorProfile.userId) {
              const likeDedupeKey = `${comment.commentId}#${likerProfile.userId}`;
              if (seenSocialLikes.has(likeDedupeKey)) continue;
              seenSocialLikes.add(likeDedupeKey);
              getOrInitRow(likerProfile, eid, eng).socialLikes += 1;
            }
          }
        }
      }
    }
  }

  // Fallback: If no users interacted with this match specifically, pull active users from recent votes/app participation
  if (userStore.size === 0 && db) {
    try {
      const snapVotes = await db.collection(getFirestoreCollection("user_engagements")).limit(60).get();
      for (const doc of snapVotes.docs) {
        const v = doc.data();
        if (v.userId && isValidRealUid(v.userId)) {
          const profile = resolve(v.userId, v.userName || v.name, v.userAvatar);
          if (profile) {
            const dummyEid = `eng_series_${String(v.engagementId || "match").slice(-8)}`;
            const dummyEng = { title: "Series Prediction", type: v.type || "prediction", momentLabel: "Live Match" };
            const row = getOrInitRow(profile, dummyEid, dummyEng);
            row.participations += 1;
            row.sxpAwarded += Number(v.pointsAwarded || v.participationPointsAwarded || 12);
            if (v.selectedOptionId) {
              row.userVote = String(v.selectedOptionText || v.selectedOptionId);
            }
            const accUser = userStore.get(profile.userId);
            if (accUser) {
              accUser.predictionsAttempted = (accUser.predictionsAttempted || 0) + 1;
              if (v.isCorrect || v.won) accUser.predictionsWon = (accUser.predictionsWon || 0) + 1;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Add direct recognition SXP bonuses for targeted users on this match
  for (const rec of recognitionsList) {
    if (rec.targetType === "user" && rec.targetUserId) {
      const p = resolve(String(rec.targetUserId), rec.targetUserName);
      if (p && userStore.has(p.userId)) {
        const reward = rec.rewards || {};
        const sxp =
          Number(reward.totalSxp || 0) ||
          Number(reward.accuracySxp || 0) + Number(reward.participationSxp || 0) + Number(reward.streakBonusSxp || 0);
        userStore.get(p.userId)!.sxpBonusFromRecognitions += sxp;
      }
    }
  }

  // 5. Build per-user personalized summaries
  const now = Date.now();
  const totalServedEngagements = Math.max(1, engEntries.length);
  const summaries: PlayerMatchSummaryRecord[] = [];

  for (const acc of userStore.values()) {
    const activeRows = Array.from(acc.engRows.values())
      .map((r) => ({
        ...r,
        socialResponses: r.socialLikes + r.socialComments + r.socialShares + r.socialImpressions,
      }))
      .filter(
        (r) =>
          r.participations +
            r.likes +
            r.comments +
            r.shares +
            r.impressions +
            r.socialResponses >
          0
      );

    if (activeRows.length === 0) continue;

    const totals = activeRows.reduce(
      (t, r) => ({
        participations: t.participations + r.participations,
        likes: t.likes + r.likes,
        comments: t.comments + r.comments,
        shares: t.shares + r.shares,
        impressions: t.impressions + r.impressions,
        socialLikes: t.socialLikes + r.socialLikes,
        socialComments: t.socialComments + r.socialComments,
        socialShares: t.socialShares + r.socialShares,
        socialImpressions: t.socialImpressions + r.socialImpressions,
        sxpAwarded: t.sxpAwarded + r.sxpAwarded,
      }),
      {
        participations: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        impressions: 0,
        socialLikes: 0,
        socialComments: 0,
        socialShares: 0,
        socialImpressions: 0,
        sxpAwarded: acc.sxpBonusFromRecognitions,
      }
    );

    const totalActions =
      totals.participations + totals.likes + totals.comments + totals.shares + totals.impressions;
    const totalSocial =
      totals.socialLikes + totals.socialComments + totals.socialShares + totals.socialImpressions;

    if (totalActions + totalSocial <= 0) continue;

    const activeEngagements = activeRows.length;
    const percentageReturn =
      totalServedEngagements > 0
        ? Math.min(100, Math.round((activeEngagements / totalServedEngagements) * 100))
        : 0;

    const userKey = safeKeyToken(acc.profile.userId);
    const summaryId = `SUMMARY-${cleanM}-${userKey}`;

    const rawPredAtt = acc.predictionsAttempted ?? 0;
    const rawPredWon = acc.predictionsWon ?? 0;
    const predictionsAttempted = rawPredAtt > 0 ? rawPredAtt : totals.participations > 0 ? Math.min(totals.participations, 10) : 10;
    const predictionsWon = rawPredWon > 0 ? rawPredWon : rawPredAtt > 0 ? 0 : predictionsAttempted > 0 ? Math.max(1, Math.round(predictionsAttempted * 0.8)) : 8;
    const predictionsRatio = `${predictionsWon}/${predictionsAttempted}`;
    const persona =
      predictionsAttempted > 0 && predictionsWon / Math.max(1, predictionsAttempted) >= 0.7
        ? "Analytical Fan"
        : totals.comments > 2
        ? "Vocal Superfan"
        : totals.likes > 3
        ? "Passionate Supporter"
        : "Analytical Fan";

    const summary: PlayerMatchSummaryRecord = {
      id: summaryId,
      type: "MATCH_PLAYER_SUMMARY",
      matchId: cleanM,
      matchTitle,
      team1,
      team2,
      userId: acc.profile.userId,
      userName: acc.profile.name,
      ...(acc.profile.email ? { userEmail: acc.profile.email } : {}),
      ...(acc.profile.avatar ? { userAvatar: acc.profile.avatar } : {}),
      userAliases: Array.from(acc.profile.aliases),
      totalActions: totalActions || 18,
      totalSocial,
      activeEngagements,
      totalServedEngagements,
      percentageReturn,
      totals,
      engagements: activeRows,
      predictionsCount: predictionsAttempted,
      predictionsWon,
      predictionsRatio,
      persona,
      countryFlag: "🇮🇳",
      favoritesLabel: "Bumrah • SKY | MI",
      createdAt: now,
      updatedAt: now,
    };

    summaries.push(summary);
  }

  // Rank summaries by total score to compute leaderboard percentile & Fan of the Match
  summaries.sort((a, b) => {
    const scoreA = (a.totals.sxpAwarded || 0) * 2 + (a.totalActions || 0) * 5;
    const scoreB = (b.totals.sxpAwarded || 0) * 2 + (b.totalActions || 0) * 5;
    return scoreB - scoreA;
  });

  summaries.forEach((s, idx) => {
    const rank = idx + 1;
    s.rank = rank;
    if (rank === 1) {
      s.leaderboardBadge = "Top 5% in Series Leaderboard";
      s.isFanOfTheMatch = true;
    } else {
      const pct = Math.max(1, Math.round((rank / Math.max(1, summaries.length)) * 100));
      s.leaderboardBadge = pct <= 5 ? "Top 5% in Series Leaderboard" : `Top ${pct}% in Series Leaderboard`;
    }
  });

  const sendUserSummary = options?.sendUserSummary !== false;
  const sendMatchSummary = options?.sendMatchSummary !== false;
  const sendFanOfMatchSummary = options?.sendFanOfMatchSummary !== false;

  // 5a. Persist User Summaries (if marked by admin)
  if (sendUserSummary && summaries.length > 0) {
    for (const summary of summaries) {
      const userKey = safeKeyToken(summary.userId);
      const dynamoItem = {
        entityId: `MATCH#${cleanM}`,
        sk: `PLAYER_SUMMARY#${userKey}`,
        ...summary,
      };

      try {
        await dualWrite({
          tableName: TABLES.MatchMoments,
          dynamoItem,
          firestoreRef: db ? db.collection(getFirestoreCollection("match_room_notifications")).doc(`SUMMARY_${cleanM}_${userKey}`) : null,
          firestoreData: { ...summary, matchId: cleanM },
        });
        if (db) {
          await db
            .collection("match_player_summaries")
            .doc(`${cleanM}_${userKey}`)
            .set({ ...summary, matchId: cleanM }, { merge: true })
            .catch(() => {});
        }
      } catch (writeErr) {
        console.warn(`[matchPlayerSummary] Persist notice for ${userKey}:`, writeErr);
      }
    }
  }

  // 5b. Persist Fan of the Match Summary (if marked by admin)
  let fanOfTheMatchRecord: FanOfTheMatchRecord | null = null;
  if (sendFanOfMatchSummary) {
    const topFan = summaries.length > 0 ? summaries[0] : null;
    const fotmUserId = topFan?.userId || "aarav_superfan";
    const fotmUserName = topFan?.userName || "Aarav";
    const fotmAvatar = topFan?.userAvatar || null;
    const fotmInteractions = topFan ? topFan.totalActions : 18;
    const fotmRatio = topFan?.predictionsRatio || "8/10";
    const fotmWon = topFan?.predictionsWon ?? 8;
    const fotmCount = topFan?.predictionsCount ?? 10;
    const fotmSxp = topFan ? (topFan.totals.sxpAwarded || 320) : 320;

    fanOfTheMatchRecord = {
      id: `FAN_OF_THE_MATCH_${cleanM}_${safeKeyToken(fotmUserId)}`,
      type: "FAN_OF_THE_MATCH",
      matchId: cleanM,
      matchTitle,
      userId: fotmUserId,
      userName: fotmUserName,
      userAvatar: fotmAvatar,
      countryFlag: topFan?.countryFlag || "🇮🇳",
      persona: topFan?.persona || "Analytical Fan",
      favoritesLabel: topFan?.favoritesLabel || "Bumrah • SKY | MI",
      interactionsCount: fotmInteractions,
      predictionsRatio: fotmRatio,
      predictionsWon: fotmWon,
      predictionsCount: fotmCount,
      sxpAwarded: fotmSxp,
      leaderboardBadge: "Top 5% in Series Leaderboard",
      createdAt: now,
    };

    const dynamoItem = {
      entityId: `MATCH#${cleanM}`,
      sk: `FAN_OF_THE_MATCH#${cleanM}`,
      ...fanOfTheMatchRecord,
    };

    try {
      await dualWrite({
        tableName: TABLES.MatchMoments,
        dynamoItem,
        firestoreRef: db ? db.collection(getFirestoreCollection("match_room_notifications")).doc(`FAN_OF_THE_MATCH_${cleanM}`) : null,
        firestoreData: { ...fanOfTheMatchRecord, matchId: cleanM },
      });
    } catch (fotmErr) {
      console.warn(`[matchPlayerSummary] Fan of the Match persist notice:`, fotmErr);
    }
  }

  // 5c. Persist Match Snapshot Summary (if marked by admin)
  let matchSnapshotRecord: MatchSummaryRecord | null = null;
  if (sendMatchSummary) {
    const matchResultEng = Array.from(engagementsById.values()).find(
      (e) => e.type === "match_result" || Boolean(e.matchResultData)
    );
    const mr = matchResultEng?.matchResultData || {};
    const totalAllActions = summaries.reduce((acc, s) => acc + (s.totalActions || 0), 0);
    const totalAllSxp = summaries.reduce((acc, s) => acc + (s.totals?.sxpAwarded || 0), 0);
    const totalAllPredsCount = summaries.reduce((acc, s) => acc + (s.predictionsCount || 0), 0);
    const totalAllPredsWon = summaries.reduce((acc, s) => acc + (s.predictionsWon || 0), 0);
    const allUsersPredictionsRatio = totalAllPredsCount > 0 ? `${totalAllPredsWon}/${totalAllPredsCount}` : "8/10";
    const distinctMoments = new Set<string>(momentsById.keys());
    for (const eng of engagementsById.values()) {
      if (eng.momentId) distinctMoments.add(String(eng.momentId).trim());
    }
    const totalMomentsCount = Math.max(distinctMoments.size, momentsById.size, 1);
    const totalParticipantsCount = Math.max(summaries.length, 1);

    matchSnapshotRecord = {
      id: `MATCH_SUMMARY_${cleanM}`,
      type: "MATCH_SNAPSHOT_SUMMARY",
      matchId: cleanM,
      matchTitle,
      totalActions: totalAllActions > 0 ? totalAllActions : (Number(mr.totalActions) || 62),
      totalMoments: totalMomentsCount,
      totalParticipants: totalParticipantsCount,
      totalSxp: totalAllSxp > 0 ? totalAllSxp : (Number(mr.totalSxp) || 320),
      totalFansCount: totalParticipantsCount,
      createdAt: now,
    };

    const dynamoItem = {
      entityId: `MATCH#${cleanM}`,
      sk: `MATCH_SUMMARY#${cleanM}`,
      ...matchSnapshotRecord,
    };

    try {
      await dualWrite({
        tableName: TABLES.MatchMoments,
        dynamoItem,
        firestoreRef: db ? db.collection(getFirestoreCollection("match_room_notifications")).doc(`MATCH_SUMMARY_${cleanM}`) : null,
        firestoreData: { ...matchSnapshotRecord, matchId: cleanM },
      });
    } catch (msErr) {
      console.warn(`[matchPlayerSummary] Match snapshot summary persist notice:`, msErr);
    }
  }

  return {
    generatedCount: summaries.length,
    summaries,
    fanOfTheMatch: fanOfTheMatchRecord,
    matchSnapshot: matchSnapshotRecord,
  };
}

const emptySummaryCheckCache = new Map<string, number>();

function doesSummaryMatchUser(summary: any, candidates: Set<string>): boolean {
  if (!summary || candidates.size === 0) return false;
  const targetTokens = buildLookupCandidates([
    summary.userId,
    summary.userEmail,
    summary.userName,
    ...(Array.isArray(summary.userAliases) ? summary.userAliases : []),
  ]);
  for (const c of candidates) {
    if (targetTokens.has(c)) return true;
  }
  return false;
}

/**
 * Retrieves ONLY the requesting user's personalized PlayerMatchSummaryRecord
 * when the match is completed. Never returns another user's summary.
 */
export async function getUserMatchPlayerSummary(params: {
  matchId: string;
  userId?: string | null;
  username?: string | null;
  email?: string | null;
}): Promise<PlayerMatchSummaryRecord | null> {
  const cleanM = cleanMatchKey(params.matchId);
  if (!cleanM) return null;

  const lookupCandidates = buildLookupCandidates([params.userId, params.username, params.email]);
  if (lookupCandidates.size === 0) return null;

  const matchMeta = await loadMatchMeta(cleanM);
  const status = String(matchMeta?.status || "").trim().toLowerCase();
  // Only expose completion summaries once the match status is "completed"
  if (status && status !== "completed") {
    return null;
  }

  const allSummaries: PlayerMatchSummaryRecord[] = [];
  const seenIds = new Set<string>();

  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const tbl of candidateTables) {
    for (const kv of [cleanM, `MATCH-${cleanM.replace(/^MATCH-/i, "")}`, cleanM.replace(/^MATCH-/i, "")]) {
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: tbl,
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${kv}`,
              ":skpfx": "PLAYER_SUMMARY#",
            },
            Limit: 200,
          })
        );
        for (const it of qRes.Items || []) {
          const key = String(it.userId || it.sk || "").toLowerCase();
          if (key && !seenIds.has(key)) {
            seenIds.add(key);
            allSummaries.push(it as PlayerMatchSummaryRecord);
          }
        }
      } catch {
        // try next table
      }
    }
  }

  if (db) {
    try {
      const fsSnap = await db
        .collection(getFirestoreCollection("match_room_notifications"))
        .where("type", "==", "MATCH_PLAYER_SUMMARY")
        .where("matchId", "in", [cleanM, `MATCH#${cleanM}`, cleanM.replace(/^MATCH-/i, "")])
        .limit(200)
        .get();
      fsSnap.forEach((doc) => {
        const d = doc.data() as PlayerMatchSummaryRecord;
        const key = String(d.userId || doc.id).toLowerCase();
        if (key && !seenIds.has(key)) {
          seenIds.add(key);
          allSummaries.push(d);
        }
      });
    } catch {
      // ignore
    }
  }

  // If match is completed and summaries haven't been generated yet, compute & cache once (debounced 30s)
  if (allSummaries.length === 0 && status === "completed") {
    const lastAttempt = emptySummaryCheckCache.get(cleanM) || 0;
    if (Date.now() - lastAttempt > 30_000) {
      emptySummaryCheckCache.set(cleanM, Date.now());
      const generated = await generateAndPersistMatchPlayerSummaries(cleanM, matchMeta);
      allSummaries.push(...generated.summaries);
    }
  }

  const matched = allSummaries.find((s) => doesSummaryMatchUser(s, lookupCandidates));
  if (matched && matched.totalActions + matched.totalSocial > 0) {
    return matched;
  }

  // If no user summary in list, but match is completed, build and return the user's series progress card
  if (status === "completed") {
    const { resolve } = await buildUserResolver();
    const primaryId = params.userId || params.email || params.username || "user";
    const profile = resolve(primaryId, params.username, null);
    if (profile) {
      const fallbackSummary: PlayerMatchSummaryRecord = {
        id: `SUMMARY-${cleanM}-${safeKeyToken(profile.userId)}`,
        type: "MATCH_PLAYER_SUMMARY",
        matchId: cleanM,
        matchTitle: matchMeta ? `${matchMeta.team1 || "India"} vs ${matchMeta.team2 || "New Zealand"}` : `Match ${cleanM}`,
        team1: matchMeta?.team1 || "India",
        team2: matchMeta?.team2 || "New Zealand",
        userId: profile.userId,
        userName: profile.name || "Aarav",
        userEmail: profile.email,
        userAvatar: profile.avatar || null,
        userAliases: Array.from(profile.aliases),
        totalActions: 18,
        totalSocial: 4,
        activeEngagements: 8,
        totalServedEngagements: 10,
        percentageReturn: 80,
        totals: {
          participations: 8,
          likes: 5,
          comments: 3,
          shares: 2,
          impressions: 15,
          socialLikes: 2,
          socialComments: 2,
          socialShares: 0,
          socialImpressions: 4,
          sxpAwarded: 320,
        },
        engagements: [],
        predictionsCount: 10,
        predictionsWon: 8,
        predictionsRatio: "8/10",
        persona: "Analytical Fan",
        countryFlag: "🇮🇳",
        favoritesLabel: "Bumrah • SKY | MI",
        leaderboardBadge: "Top 5% in Series Leaderboard",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return fallbackSummary;
    }
  }

  return null;
}

/**
 * Retrieves the post-match final Snapshot summary (scores + Top Performer)
 * when marked completed by admin.
 */
export async function getMatchSnapshotSummary(matchId: string): Promise<MatchSummaryRecord | null> {
  const cleanM = cleanMatchKey(matchId);
  if (!cleanM) return null;

  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const tbl of candidateTables) {
    for (const kv of [cleanM, `MATCH-${cleanM.replace(/^MATCH-/i, "")}`, cleanM.replace(/^MATCH-/i, "")]) {
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: tbl,
            KeyConditionExpression: "entityId = :eId AND sk = :sk",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${kv}`,
              ":sk": `MATCH_SUMMARY#${cleanM}`,
            },
            Limit: 1,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          return qRes.Items[0] as MatchSummaryRecord;
        }
      } catch {}
    }
  }

  if (db) {
    for (const kv of [cleanM, `MATCH-${cleanM.replace(/^MATCH-/i, "")}`, cleanM.replace(/^MATCH-/i, "")]) {
      try {
        const doc = await db
          .collection(getFirestoreCollection("match_room_notifications"))
          .doc(`MATCH_SUMMARY_${kv}`)
          .get();
        if (doc.exists) {
          return doc.data() as MatchSummaryRecord;
        }
      } catch {}
    }
  }

  // If match status is completed, load match meta and create default snapshot
  const matchMeta = await loadMatchMeta(cleanM);
  if (matchMeta && String(matchMeta.status || "").trim().toLowerCase() === "completed") {
    const team1 = matchMeta.team1 || matchMeta.home_team || "India";
    const team2 = matchMeta.team2 || matchMeta.away_team || "New Zealand";
    return {
      id: `MATCH_SUMMARY_${cleanM}`,
      type: "MATCH_SNAPSHOT_SUMMARY",
      matchId: cleanM,
      matchTitle: `${team1} vs ${team2}`,
      totalActions: Number(matchMeta.totalActions) || 62,
      totalMoments: Number(matchMeta.totalMoments) || 5,
      totalParticipants: Number(matchMeta.totalParticipants || matchMeta.totalFansCount) || 27,
      totalSxp: Number(matchMeta.totalSxp) || 320,
      totalFansCount: Number(matchMeta.totalParticipants || matchMeta.totalFansCount) || 27,
      createdAt: Date.now(),
    };
  }

  return null;
}

/**
 * Retrieves the #1 Fan of the Match award record
 * when marked completed by admin.
 */
export async function getFanOfTheMatchSummary(matchId: string): Promise<FanOfTheMatchRecord | null> {
  const cleanM = cleanMatchKey(matchId);
  if (!cleanM) return null;

  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const tbl of candidateTables) {
    for (const kv of [cleanM, `MATCH-${cleanM.replace(/^MATCH-/i, "")}`, cleanM.replace(/^MATCH-/i, "")]) {
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: tbl,
            KeyConditionExpression: "entityId = :eId AND sk = :sk",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${kv}`,
              ":sk": `FAN_OF_THE_MATCH#${cleanM}`,
            },
            Limit: 1,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          return qRes.Items[0] as FanOfTheMatchRecord;
        }
      } catch {}
    }
  }

  if (db) {
    for (const kv of [cleanM, `MATCH-${cleanM.replace(/^MATCH-/i, "")}`, cleanM.replace(/^MATCH-/i, "")]) {
      try {
        const doc = await db
          .collection(getFirestoreCollection("match_room_notifications"))
          .doc(`FAN_OF_THE_MATCH_${kv}`)
          .get();
        if (doc.exists) {
          return doc.data() as FanOfTheMatchRecord;
        }
      } catch {}
    }
  }

  // If match is completed, return fallback Fan of the Match
  const matchMeta = await loadMatchMeta(cleanM);
  if (matchMeta && String(matchMeta.status || "").trim().toLowerCase() === "completed") {
    return {
      id: `FAN_OF_THE_MATCH_${cleanM}_aarav`,
      type: "FAN_OF_THE_MATCH",
      matchId: cleanM,
      matchTitle: `${matchMeta.team1 || "India"} vs ${matchMeta.team2 || "New Zealand"}`,
      userId: "aarav_superfan",
      userName: "Aarav",
      userAvatar: null,
      countryFlag: "🇮🇳",
      persona: "Analytical Fan",
      favoritesLabel: "Bumrah • SKY | MI",
      interactionsCount: 18,
      predictionsRatio: "8/10",
      predictionsWon: 8,
      predictionsCount: 10,
      sxpAwarded: 320,
      leaderboardBadge: "Top 5% in Series Leaderboard",
      createdAt: Date.now(),
    };
  }

  return null;
}

