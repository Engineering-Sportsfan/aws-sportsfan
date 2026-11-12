// lib/engagementSocial.ts — Single-source-of-truth counters for Engagement Actions & Social Responses
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";

export async function countRecords(
  engagementId: string,
  prefix: "LIKE#" | "SHARE#" | "IMPRESSION#" | "SOCIAL_LIKE#" | "SOCIAL_COMMENT#" | "SOCIAL_IMPRESSION#"
) {
  let total = 0;
  let key: Record<string, any> | undefined;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: TABLES.SocialAndContent,
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `ENGAGEMENT#${engagementId}`, ":p": prefix },
        Select: "COUNT",
        ExclusiveStartKey: key,
      })
    );
    total += r.Count || 0;
    key = r.LastEvaluatedKey;
  } while (key);
  return total;
}

export interface EngagementStats {
  // Primary engagement actions
  likes: number;
  shares: number;
  impressions: number;
  participations: number;
  actionComments: number;
  totalActions: number;

  // Total comments (top-level + replies) for comment drawer badge
  commentsCount: number;

  // Social responses (reactions on other users' comments under this engagement)
  socialLikes: number;
  socialComments: number;
  socialImpressions: number;
  totalSocialResponses: number;

  /** single-question votes, keyed by lower-cased selectedOptionId */
  votesByOption: Record<string, number>;
  /** sk values present, used to hydrate userLiked / userVote without extra reads */
  userLikes: Set<string>;
  userVotes: Map<string, string>;
}

/**
 * Reads every child record of an engagement in one paginated query.
 * Reconciles primary actions (LIKE#, SHARE#, IMPRESSION#, COMMENT# top-level, VOTE#)
 * separately from social responses (SOCIAL_LIKE#, SOCIAL_COMMENT# / nested replies, SOCIAL_IMPRESSION#).
 */
export async function getEngagementStats(
  engagementId: string,
  opts: { consistent?: boolean } = {}
): Promise<EngagementStats> {
  const stats: EngagementStats = {
    likes: 0,
    shares: 0,
    impressions: 0,
    participations: 0,
    actionComments: 0,
    totalActions: 0,
    commentsCount: 0,
    socialLikes: 0,
    socialComments: 0,
    socialImpressions: 0,
    totalSocialResponses: 0,
    votesByOption: {},
    userLikes: new Set(),
    userVotes: new Map(),
  };

  const commentMap = new Map<string, any>();
  const explicitSocialLikes = new Set<string>();      // key: `${commentId}#${actorId}`
  const explicitSocialComments = new Set<string>();   // key: `${commentId}`

  let key: Record<string, any> | undefined;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: TABLES.SocialAndContent,
        KeyConditionExpression: "contentId = :c",
        ExpressionAttributeValues: { ":c": `ENGAGEMENT#${engagementId}` },
        ProjectionExpression:
          "sk, selectedOptionId, questionId, userId, parentId, authorUid, likedBy, actorUserId, targetCommentId, targetAuthorUid, commentId, id, impressionCount",
        ConsistentRead: Boolean(opts.consistent),
        ExclusiveStartKey: key,
      })
    );

    for (const it of r.Items || []) {
      const sk = String(it.sk || "");
      if (sk.startsWith("LIKE#")) {
        stats.likes++;
        stats.userLikes.add(sk.slice(5));
      } else if (sk.startsWith("SHARE#")) {
        stats.shares++;
      } else if (sk.startsWith("IMPRESSION#") || sk.startsWith("VIEW#")) {
        stats.impressions += Math.max(1, Number(it.impressionCount || 1));
      } else if (sk.startsWith("VOTE#") && it.selectedOptionId != null) {
        stats.participations++;
        stats.userVotes.set(sk.slice(5), String(it.selectedOptionId));
        if (!it.questionId) {
          const opt = String(it.selectedOptionId).trim().toLowerCase();
          stats.votesByOption[opt] = (stats.votesByOption[opt] || 0) + 1;
        }
      } else if (sk.startsWith("COMMENT#")) {
        stats.commentsCount++;
        const cid = String(it.commentId || it.id || sk.replace(/^COMMENT#/, "")).trim();
        if (cid) commentMap.set(cid, it);
      } else if (sk.startsWith("SOCIAL_LIKE#")) {
        const rest = sk.slice("SOCIAL_LIKE#".length);
        const parts = rest.split("#");
        const cId = String(it.targetCommentId || parts[0] || "").trim();
        const actor = String(it.actorUserId || parts[1] || "").trim().toLowerCase();
        if (cId && actor) explicitSocialLikes.add(`${cId}#${actor}`);
      } else if (sk.startsWith("SOCIAL_COMMENT#")) {
        const cId = String(it.commentId || sk.slice("SOCIAL_COMMENT#".length)).trim();
        if (cId) explicitSocialComments.add(cId);
      } else if (sk.startsWith("SOCIAL_IMPRESSION#")) {
        stats.socialImpressions += Math.max(1, Number(it.impressionCount || 1));
      }
    }
    key = r.LastEvaluatedKey;
  } while (key);

  // Classify COMMENT# items into Action Comments vs Social Response Comments and merge likedBy
  for (const [cid, c] of commentMap.entries()) {
    const author = String(c.authorUid || "").trim().toLowerCase();
    const pId = c.parentId ? String(c.parentId).replace(/^COMMENT#/, "").trim() : "";

    if (pId) {
      const parentC = commentMap.get(pId);
      const parentAuthor = parentC ? String(parentC.authorUid || "").trim().toLowerCase() : "";
      if (!parentAuthor || !author || author !== parentAuthor || explicitSocialComments.has(cid)) {
        explicitSocialComments.add(cid);
      } else {
        stats.actionComments++;
      }
    } else {
      stats.actionComments++;
    }

    const likedBy: string[] = Array.isArray(c.likedBy) ? c.likedBy : [];
    for (const rawLiker of likedBy) {
      const liker = String(rawLiker || "").trim().toLowerCase();
      if (!liker || liker === "me") continue;
      if (!author || liker !== author) {
        explicitSocialLikes.add(`${cid}#${liker}`);
      }
    }
  }

  stats.socialLikes = explicitSocialLikes.size;
  stats.socialComments = explicitSocialComments.size;
  stats.totalActions =
    stats.likes + stats.actionComments + stats.shares + stats.impressions + stats.participations;
  stats.totalSocialResponses =
    stats.socialLikes + stats.socialComments + stats.socialImpressions;

  return stats;
}

// Same matching rules the vote route uses: a vote may be stored as the option id, its text/label/code,
// or "left"/"right" for two-sided predictions.
function countedVotesFor(opt: any, index: number, votesByOption: Record<string, number>) {
  const keys = new Set(
    [opt?.id, opt?.text, opt?.label, opt?.code, index === 0 ? "left" : index === 1 ? "right" : null]
      .filter((v) => v != null && v !== "")
      .map((v) => String(v).trim().toLowerCase())
  );
  let n = 0;
  keys.forEach((k) => { n += votesByOption[k] || 0; });
  return n;
}

function recountOptions(options: any[], votesByOption: Record<string, number>, exact = false) {
  const counted = options.map((o, i) => ({
    ...o,
    votes: exact
      ? countedVotesFor(o, i, votesByOption)
      : Math.max(Number(o?.votes) || 0, countedVotesFor(o, i, votesByOption)),
  }));
  const totalVotes = counted.reduce((s, o) => s + o.votes, 0);
  return {
    options: counted.map((o) => ({ ...o, percentage: totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0 })),
    totalVotes,
  };
}

/**
 * Overwrites primary action & social response counters on an engagement from its real child records,
 * so every API returns the exact separated counts stored cleanly in DynamoDB.
 */
export function applyEngagementStats(item: any, stats: EngagementStats, opts: { exactVotes?: boolean } = {}) {
  const exact = Boolean(opts.exactVotes);
  item.likes = stats.likes;
  item.likeCount = stats.likes;
  item.shares = stats.shares;
  item.impressionsCount = stats.impressions;
  item.impressions = stats.impressions;
  item.actionCommentsCount = stats.actionComments;
  item.commentsCount = Math.max(stats.commentsCount, Number(item.commentsCount) || 0);
  item.participationsCount = stats.participations;
  item.totalActionsCount = stats.totalActions;

  // Separate Social Response counters stored on engagement
  item.socialLikesCount = stats.socialLikes;
  item.socialCommentsCount = stats.socialComments;
  item.socialImpressionsCount = stats.socialImpressions;
  item.totalSocialResponsesCount = stats.totalSocialResponses;

  if (item.type === "quiz" || item.type === "fan_battle" || item.type === "meme") return item;

  if (
    item.type === "express" &&
    (item.expressData?.responseMode === "text" || !primaryOptions(item)?.length)
  ) {
    item.totalResponses = stats.participations;
    item.totalVotes = stats.participations;
    if (item.expressData) {
      item.expressData.responseMode = "text";
      item.expressData.options = [];
      item.expressData.totalResponses = stats.participations;
      item.expressData.totalVotes = stats.participations;
    }
    return item;
  }

  let result: { options: any[]; totalVotes: number } | null = null;
  for (const key of ["pollData", "debateData", "expressData", "questionData", "predictionData"]) {
    const data = item[key];
    if (data && Array.isArray(data.options) && data.options.length) {
      result = recountOptions(data.options, stats.votesByOption, exact);
      data.options = result.options;
      data.totalVotes = result.totalVotes;
    }
  }
  if (Array.isArray(item.options) && item.options.length) {
    const top = recountOptions(item.options, stats.votesByOption, exact);
    item.options = top.options;
    result = result || top;
  }

  const pd = item.predictionData;
  if (pd && result) {
    if (pd.leftChoice) pd.leftChoice = { ...pd.leftChoice, votes: result.options[0]?.votes ?? 0, percentage: result.options[0]?.percentage ?? 0 };
    if (pd.rightChoice) pd.rightChoice = { ...pd.rightChoice, votes: result.options[1]?.votes ?? 0, percentage: result.options[1]?.percentage ?? 0 };
  }
  if (result) item.totalVotes = result.totalVotes;
  return item;
}

/** The user's vote on this engagement (first match across their candidate ids), or null */
export function findUserVote(stats: EngagementStats, userIds: string[]): string | null {
  for (const uid of userIds) {
    if (stats.userVotes.has(uid)) return stats.userVotes.get(uid)!;
    for (const [k, v] of stats.userVotes) {
      if (k.startsWith(`${uid}#`)) return v;
    }
  }
  return null;
}

/** Options array the vote / list responses expose for poll-style engagements */
export function primaryOptions(item: any): any[] | undefined {
  return (
    item.pollData?.options ||
    item.debateData?.options ||
    item.expressData?.options ||
    item.questionData?.options ||
    item.predictionData?.options ||
    item.options
  );
}
