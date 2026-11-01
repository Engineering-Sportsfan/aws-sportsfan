// lib/engagementSocial.ts — counts per-user LIKE# / SHARE# / COMMENT# / VOTE# records for an engagement
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";

export async function countRecords(engagementId: string, prefix: "LIKE#" | "SHARE#") {
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
  likes: number;
  shares: number;
  commentsCount: number;
  /** single-question votes, keyed by lower-cased selectedOptionId */
  votesByOption: Record<string, number>;
  /** sk values present, used to hydrate userLiked / userVote without extra reads */
  userLikes: Set<string>;
  userVotes: Map<string, string>;
}

/**
 * Reads every child record of an engagement in one paginated query.
 * These records are the source of truth; the counters stored on the engagement are only a mirror.
 */
export async function getEngagementStats(engagementId: string): Promise<EngagementStats> {
  const stats: EngagementStats = {
    likes: 0,
    shares: 0,
    commentsCount: 0,
    votesByOption: {},
    userLikes: new Set(),
    userVotes: new Map(),
  };
  let key: Record<string, any> | undefined;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: TABLES.SocialAndContent,
        KeyConditionExpression: "contentId = :c",
        ExpressionAttributeValues: { ":c": `ENGAGEMENT#${engagementId}` },
        ProjectionExpression: "sk, selectedOptionId, questionId, userId",
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
      } else if (sk.startsWith("COMMENT#")) {
        stats.commentsCount++;
      } else if (sk.startsWith("VOTE#") && it.selectedOptionId != null) {
        // key is "{userId}" or "{userId}#{questionId}" for quiz answers
        stats.userVotes.set(sk.slice(5), String(it.selectedOptionId));
        if (!it.questionId) {
          const opt = String(it.selectedOptionId).trim().toLowerCase();
          stats.votesByOption[opt] = (stats.votesByOption[opt] || 0) + 1;
        }
      }
    }
    key = r.LastEvaluatedKey;
  } while (key);
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

function recountOptions(options: any[], votesByOption: Record<string, number>) {
  // Never go below the stored number: seeded or legacy votes have no VOTE# record
  const counted = options.map((o, i) => ({
    ...o,
    votes: Math.max(Number(o?.votes) || 0, countedVotesFor(o, i, votesByOption)),
  }));
  const totalVotes = counted.reduce((s, o) => s + o.votes, 0);
  return {
    options: counted.map((o) => ({ ...o, percentage: totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0 })),
    totalVotes,
  };
}

/**
 * Overwrites likes / shares / comments / vote counts on an engagement with the real record counts,
 * so every API returns the same numbers no matter which stored copy the item was read from.
 */
export function applyEngagementStats(item: any, stats: EngagementStats) {
  item.likes = stats.likes;
  item.likeCount = stats.likes;
  item.shares = stats.shares;
  item.commentsCount = Math.max(stats.commentsCount, Number(item.commentsCount) || 0);

  if (item.type === "quiz" || item.type === "fan_battle" || item.type === "meme") return item;

  let result: { options: any[]; totalVotes: number } | null = null;
  for (const key of ["pollData", "debateData", "expressData", "questionData", "predictionData"]) {
    const data = item[key];
    if (data && Array.isArray(data.options) && data.options.length) {
      result = recountOptions(data.options, stats.votesByOption);
      data.options = result.options;
      data.totalVotes = result.totalVotes;
    }
  }
  if (Array.isArray(item.options) && item.options.length) {
    const top = recountOptions(item.options, stats.votesByOption);
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
