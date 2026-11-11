import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface UserProfile {
  userId: string;
  name: string;
  username?: string;
  email?: string;
  avatar?: string | null;
}

interface UserEngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  participations: number;
  socialLikes: number;
  socialComments: number;
  socialShares: number;
  socialImpressions: number;
}

interface EngagementTotals {
  engagementId: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  participations: number;
  totalActions: number;
  socialLikes: number;
  socialComments: number;
  socialShares: number;
  socialImpressions: number;
  totalSocial: number;
  uniqueParticipants: number;
}

function emptyUserMetrics(): UserEngagementMetrics {
  return {
    likes: 0,
    comments: 0,
    shares: 0,
    impressions: 0,
    participations: 0,
    socialLikes: 0,
    socialComments: 0,
    socialShares: 0,
    socialImpressions: 0,
  };
}

function cleanId(val?: string | null): string {
  return String(val || "").trim();
}

function normalizeMatchKey(val?: string | null): string {
  return cleanId(val).replace(/^MATCH#/i, "").replace(/^MATCH-/i, "").toLowerCase();
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

const GENERIC_FALLBACK_NAMES = new Set([
  "fan",
  "sportsfan",
  "guest",
  "guest_fan",
  "user",
  "anonymous",
  "anon",
]);

function isGenericName(name?: string | null): boolean {
  if (!name) return true;
  return GENERIC_FALLBACK_NAMES.has(String(name).trim().toLowerCase());
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

/**
 * Loads IdentityAndAccess users (+ Firestore fallback) across env tables to map any userId / uid / email /
 * sanitized email alias onto a single canonical UserProfile.
 */
async function buildUserResolver() {
  const aliasToProfile = new Map<string, UserProfile>();
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
            ProjectionExpression: "entityId, userId, uid, actualUserId, email, username, userName, handle, firstName, lastName, #n, avatarUrl, avatar, photoURL, picture",
            ExpressionAttributeNames: { "#n": "name" },
            ExclusiveStartKey: lastKey,
          })
        );
        if (res.Items?.length) rawRecords.push(...res.Items);
        lastKey = res.LastEvaluatedKey;
        pages++;
      } while (lastKey && pages < 20);
    } catch {
      // try next candidate table
    }
  }

  if (db) {
    try {
      const snap = await db.collection(getFirestoreCollection("users")).limit(500).get();
      for (const doc of snap.docs) {
        rawRecords.push({ id: doc.id, ...doc.data() });
      }
    } catch {
      // ignore firestore fallback error
    }
  }

  for (const item of rawRecords) {
    const rawEmail = String(item.email || "").trim().toLowerCase();
    const rawUserId = String(item.userId || item.uid || item.actualUserId || item.id || String(item.entityId || "").replace(/^USER#/i, "")).trim();
    const rawEntityKey = String(item.entityId || "").replace(/^USER#/i, "").trim().toLowerCase();
    const email =
      rawEmail ||
      recoverEmailFromSanitizedUid(rawUserId) ||
      recoverEmailFromSanitizedUid(rawEntityKey);

    const rawUsername = String(item.username || item.userName || item.handle || "").trim();
    const username = isGenericName(rawUsername) ? "" : rawUsername;
    const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
    const rawItemName = String(item.name || "").trim();
    const itemName = isGenericName(rawItemName) ? "" : rawItemName;
    const incomingStrongName = fullName || itemName || username || "";
    const fallbackDisplay = email ? email.split("@")[0] : rawUserId;
    const avatar = item.avatarUrl || item.avatar || item.photoURL || item.picture || null;

    if (!email && !rawUserId) continue;

    const canonicalId = email || rawUserId.toLowerCase();
    const existing =
      aliasToProfile.get(canonicalId) ||
      (rawUserId ? aliasToProfile.get(rawUserId.toLowerCase()) : undefined);

    const existingNameIsWeak =
      !existing?.name ||
      existing.name === existing.userId ||
      existing.name.includes("@") ||
      existing.name.includes("_") ||
      isGenericName(existing.name);

    const resolvedName =
      incomingStrongName && existingNameIsWeak
        ? incomingStrongName
        : (!existingNameIsWeak && existing?.name)
        ? existing.name
        : incomingStrongName || existing?.name || fallbackDisplay || canonicalId;

    const profile: UserProfile = existing || {
      userId: canonicalId,
      name: resolvedName,
      username: username || undefined,
      email: email || undefined,
      avatar: avatar || null,
    };

    profile.userId = email || profile.userId || canonicalId;
    profile.name = resolvedName;
    if (!profile.username && username) profile.username = username;
    if (!profile.email && email) profile.email = email;
    if (!profile.avatar && avatar) profile.avatar = avatar;

    const aliases = [
      canonicalId,
      rawUserId.toLowerCase(),
      String(item.uid || "").trim().toLowerCase(),
      String(item.actualUserId || "").trim().toLowerCase(),
      String(item.id || "").trim().toLowerCase(),
      rawEntityKey,
      email,
      email ? email.replace(/[^a-z0-9]/g, "_") : "",
      email ? email.replace(/[@.]/g, "_") : "",
    ].filter((a) => a && isValidRealUid(a));

    for (const alias of aliases) {
      aliasToProfile.set(alias, profile);
    }
  }

  const dynamicUsers = new Map<string, UserProfile>();

  function resolve(
    rawUid?: string | null,
    fallbackName?: string | null,
    fallbackAvatar?: string | null
  ): UserProfile | null {
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
      if (cleanFallbackName && (!matched.name || matched.name === matched.userId || matched.name.includes("@") || isGenericName(matched.name))) {
        matched.name = cleanFallbackName;
      }
      if (fallbackAvatar && !matched.avatar) {
        matched.avatar = fallbackAvatar;
      }
      return matched;
    }

    const canonicalId = recoveredEmail || lower;
    const displayName =
      cleanFallbackName ||
      (recoveredEmail ? recoveredEmail.split("@")[0] : cleaned);

    const created: UserProfile = {
      userId: canonicalId,
      name: displayName,
      email: recoveredEmail || undefined,
      avatar: fallbackAvatar || null,
    };
    dynamicUsers.set(canonicalId, created);
    dynamicUsers.set(lower, created);
    return created;
  }

  return { resolve };
}

/**
 * Fetches all child records (VOTE#, LIKE#, SHARE#, COMMENT#, IMPRESSION#, VIEW#, USER#)
 * for one engagement from DynamoDB SocialAndContent (+ Firestore fallbacks).
 */
async function fetchEngagementChildren(engagementId: string) {
  const cleanEngId = engagementId.replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
  const mergedBySk = new Map<string, any>();

  for (const table of getCandidateTableNames(TABLES.SocialAndContent)) {
    try {
      let lastKey: Record<string, any> | undefined;
      do {
        const res = await docClient.send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: "contentId = :cid",
            ExpressionAttributeValues: { ":cid": `ENGAGEMENT#${cleanEngId}` },
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
      // try next candidate table
    }
  }

  const dynamoItems = Array.from(mergedBySk.values());

  const fsComments: any[] = [];
  const fsVotes: any[] = [];
  const fsLikes: any[] = [];

  if (db) {
    try {
      const commentSnap = await db
        .collection(getFirestoreCollection("engagements"))
        .doc(cleanEngId)
        .collection("comments")
        .get();
      commentSnap.forEach((doc) => fsComments.push({ id: doc.id, ...doc.data() }));
    } catch {
      // ignore
    }

    const hasDynVotes = dynamoItems.some((it) => String(it.sk || "").startsWith("VOTE#"));
    if (!hasDynVotes) {
      try {
        const voteSnap = await db
          .collection(getFirestoreCollection("user_engagements"))
          .where("engagementId", "==", cleanEngId)
          .get();
        voteSnap.forEach((doc) => {
          const d = doc.data();
          if (d.selectedOptionId) fsVotes.push({ docId: doc.id, ...d });
        });
      } catch {
        // ignore
      }
    }

    const hasDynLikes = dynamoItems.some((it) => String(it.sk || "").startsWith("LIKE#"));
    if (!hasDynLikes) {
      try {
        const likeSnap = await db
          .collection("engagement_likes")
          .where("engagementId", "==", cleanEngId)
          .get();
        likeSnap.forEach((doc) => fsLikes.push({ docId: doc.id, ...doc.data() }));
      } catch {
        // ignore
      }
    }
  }

  return { dynamoItems, fsComments, fsVotes, fsLikes };
}

async function handleOverviewRequest(req: NextRequest, body: {
  matchIds?: string[];
  engagementIds?: string[];
  recognitionIds?: string[];
}) {
  const engagementIds = Array.from(new Set((body.engagementIds || []).map((id) => cleanId(id)).filter(Boolean)));
  const matchIds = Array.from(new Set((body.matchIds || []).map((id) => cleanId(id)).filter(Boolean)));

  const { resolve } = await buildUserResolver();

  const perEngagement: Record<string, EngagementTotals> = {};
  const userStore = new Map<
    string,
    {
      profile: UserProfile;
      engagements: Record<string, UserEngagementMetrics>;
      roomVisitMatchIds: Set<string>;
    }
  >();

  function getOrInitUserEngagement(profile: UserProfile, engId: string): UserEngagementMetrics {
    let userEntry = userStore.get(profile.userId);
    if (!userEntry) {
      userEntry = {
        profile,
        engagements: {},
        roomVisitMatchIds: new Set<string>(),
      };
      userStore.set(profile.userId, userEntry);
    }
    if (!userEntry.engagements[engId]) {
      userEntry.engagements[engId] = emptyUserMetrics();
    }
    return userEntry.engagements[engId];
  }

  const BATCH_SIZE = 15;
  for (let i = 0; i < engagementIds.length; i += BATCH_SIZE) {
    const batch = engagementIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (engId) => {
        const children = await fetchEngagementChildren(engId);
        return { engId, ...children };
      })
    );

    for (const { engId, dynamoItems, fsComments, fsVotes, fsLikes } of batchResults) {
      const seenLikes = new Set<string>();
      const seenShares = new Set<string>();
      const seenVotes = new Set<string>();
      const seenImpressions = new Set<string>();
      const seenSocialLikes = new Set<string>();
      const seenSocialComments = new Set<string>();
      const seenSocialImpressions = new Set<string>();
      const participants = new Set<string>();
      const commentMap = new Map<string, any>();

      const totals: EngagementTotals = {
        engagementId: engId,
        likes: 0,
        comments: 0,
        shares: 0,
        impressions: 0,
        participations: 0,
        totalActions: 0,
        socialLikes: 0,
        socialComments: 0,
        socialShares: 0,
        socialImpressions: 0,
        totalSocial: 0,
        uniqueParticipants: 0,
      };

      // 1. Collect & merge comments first so parent lookups and likedBy work accurately
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

      // 2. Process DynamoDB action records (VOTE#, LIKE#, SHARE#, IMPRESSION#/VIEW#)
      for (const item of dynamoItems) {
        const sk = String(item.sk || "");

        if (sk.startsWith("VOTE#")) {
          const rest = sk.replace(/^VOTE#/, "");
          const parts = rest.split("#");
          const rawUid = item.userId || parts[0];
          const qKey = item.questionId || parts[1] || "";
          const profile = resolve(rawUid, item.userName || item.name || item.displayName, item.userAvatar || item.avatarUrl);
          if (!profile) continue;

          const dedupeKey = `${profile.userId}#${qKey}`;
          if (seenVotes.has(dedupeKey)) continue;
          seenVotes.add(dedupeKey);

          const m = getOrInitUserEngagement(profile, engId);
          m.participations += 1;
          totals.participations += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("LIKE#")) {
          const rawUid = item.userId || sk.slice(5);
          const profile = resolve(rawUid, item.userName || item.name);
          if (!profile || seenLikes.has(profile.userId)) continue;
          seenLikes.add(profile.userId);

          const m = getOrInitUserEngagement(profile, engId);
          m.likes += 1;
          totals.likes += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("SHARE#")) {
          const rawUid = item.userId || sk.slice(6);
          const profile = resolve(rawUid, item.userName || item.name);
          if (!profile || seenShares.has(profile.userId)) continue;
          seenShares.add(profile.userId);

          const m = getOrInitUserEngagement(profile, engId);
          m.shares += 1;
          totals.shares += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("IMPRESSION#") || sk.startsWith("VIEW#")) {
          const rawUid = item.userId || sk.replace(/^(IMPRESSION|VIEW)#/, "").split("#")[0];
          const profile = resolve(rawUid, item.userName, item.userAvatar);
          if (!profile || seenImpressions.has(profile.userId)) continue;
          seenImpressions.add(profile.userId);

          const m = getOrInitUserEngagement(profile, engId);
          m.impressions += 1;
          totals.impressions += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("SOCIAL_LIKE#")) {
          const rest = sk.slice("SOCIAL_LIKE#".length);
          const hashIdx = rest.lastIndexOf("#");
          const cId = String(item.targetCommentId || (hashIdx >= 0 ? rest.slice(0, hashIdx) : rest)).trim();
          const rawUid = item.actorUserId || item.userId || (hashIdx >= 0 ? rest.slice(hashIdx + 1) : "");
          const profile = resolve(rawUid, item.actorUserName || item.userName);
          if (!profile) continue;
          const dedupeKey = `${cId}#${profile.userId}`;
          if (seenSocialLikes.has(dedupeKey)) continue;
          seenSocialLikes.add(dedupeKey);

          const m = getOrInitUserEngagement(profile, engId);
          m.socialLikes += 1;
          totals.socialLikes += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("SOCIAL_COMMENT#")) {
          const cId = String(item.commentId || sk.slice("SOCIAL_COMMENT#".length)).trim();
          const rawUid = item.actorUserId || item.userId;
          const profile = resolve(rawUid, item.actorUserName || item.userName);
          if (!profile || seenSocialComments.has(cId)) continue;
          seenSocialComments.add(cId);

          const m = getOrInitUserEngagement(profile, engId);
          m.socialComments += 1;
          totals.socialComments += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("SOCIAL_IMPRESSION#")) {
          const rest = sk.slice("SOCIAL_IMPRESSION#".length);
          const hashIdx = rest.lastIndexOf("#");
          const cId = String(item.targetCommentId || (hashIdx >= 0 ? rest.slice(0, hashIdx) : rest)).trim();
          const rawUid = item.actorUserId || item.userId || (hashIdx >= 0 ? rest.slice(hashIdx + 1) : "");
          const profile = resolve(rawUid, item.actorUserName || item.userName);
          if (!profile) continue;
          const dedupeKey = `${cId}#${profile.userId}`;
          if (seenSocialImpressions.has(dedupeKey)) continue;
          seenSocialImpressions.add(dedupeKey);

          const m = getOrInitUserEngagement(profile, engId);
          m.socialImpressions += 1;
          totals.socialImpressions += 1;
          participants.add(profile.userId);
        } else if (sk.startsWith("USER#")) {
          // Do not register passive USER# markers without actual interactions (VOTE/LIKE/COMMENT/SHARE/IMPRESSION/SOCIAL)
          continue;
        }
      }

      // 3. Process Firestore fallbacks when DynamoDB had no VOTE# / LIKE# records
      for (const fsV of fsVotes) {
        const rawUid = fsV.userId || String(fsV.docId || "").split("_")[0];
        const qKey = fsV.questionId || "";
        const profile = resolve(rawUid, fsV.userName || fsV.name, fsV.userAvatar);
        if (!profile) continue;

        const dedupeKey = `${profile.userId}#${qKey}`;
        if (seenVotes.has(dedupeKey)) continue;
        seenVotes.add(dedupeKey);

        const m = getOrInitUserEngagement(profile, engId);
        m.participations += 1;
        totals.participations += 1;
        participants.add(profile.userId);
      }

      for (const fsL of fsLikes) {
        const rawUid = fsL.userId || String(fsL.docId || "").split("_")[0];
        const profile = resolve(rawUid);
        if (!profile || seenLikes.has(profile.userId)) continue;
        seenLikes.add(profile.userId);

        const m = getOrInitUserEngagement(profile, engId);
        m.likes += 1;
        totals.likes += 1;
        participants.add(profile.userId);
      }

      // 4. Process Comments & Comment Likes (distinguishing Action Comment vs Social Response)
      for (const comment of commentMap.values()) {
        const authorProfile = resolve(comment.authorUid, comment.authorUsername, comment.authorAvatarUrl);
        const parentComment = comment.parentId ? commentMap.get(comment.parentId) : null;
        const parentAuthorProfile = parentComment
          ? resolve(parentComment.authorUid, parentComment.authorUsername, parentComment.authorAvatarUrl)
          : null;

        if (authorProfile) {
          const m = getOrInitUserEngagement(authorProfile, engId);
          participants.add(authorProfile.userId);

          if (comment.parentId) {
            // Nested reply to another user counts as a Social Response comment (deduped with SOCIAL_COMMENT#)
            if (!parentAuthorProfile || authorProfile.userId !== parentAuthorProfile.userId) {
              if (!seenSocialComments.has(comment.commentId)) {
                seenSocialComments.add(comment.commentId);
                m.socialComments += 1;
                totals.socialComments += 1;
              }
            } else {
              // Self-continuation on own thread stays an engagement comment
              m.comments += 1;
              totals.comments += 1;
            }
          } else {
            // Top-level comment on the engagement counts under Actions
            m.comments += 1;
            totals.comments += 1;
          }
        }

        // Likes on comments count under Social Response (deduped with SOCIAL_LIKE#)
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

            const m = getOrInitUserEngagement(likerProfile, engId);
            m.socialLikes += 1;
            totals.socialLikes += 1;
            participants.add(likerProfile.userId);
          }
        }
      }

      totals.totalActions =
        totals.likes + totals.comments + totals.shares + totals.impressions + totals.participations;
      totals.totalSocial =
        totals.socialLikes + totals.socialComments + totals.socialShares + totals.socialImpressions;
      totals.uniqueParticipants = participants.size;

      perEngagement[engId] = totals;
    }
  }

  // Only participated/interacted users (likes, comments, shares, impressions, votes, or social responses)
  const users = Array.from(userStore.values())
    .map((u) => ({
      ...u.profile,
      engagements: u.engagements,
      roomVisitMatchIds: [] as string[],
    }))
    .filter((u) =>
      Object.values(u.engagements).some(
        (m) =>
          m.participations +
            m.likes +
            m.comments +
            m.shares +
            m.impressions +
            m.socialLikes +
            m.socialComments +
            m.socialShares +
            m.socialImpressions >
          0
      )
    );

  users.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    {
      success: true,
      perEngagement,
      users,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    return handleOverviewRequest(req, body);
  } catch (err: any) {
    console.error("POST /api/admin/core-engine/overview error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load overview telemetry" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementIds = (searchParams.get("engagementIds") || "").split(",").filter(Boolean);
    const matchIds = (searchParams.get("matchIds") || "").split(",").filter(Boolean);
    return handleOverviewRequest(req, { engagementIds, matchIds });
  } catch (err: any) {
    console.error("GET /api/admin/core-engine/overview error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load overview telemetry" },
      { status: 500 }
    );
  }
}

