// lib/engagementList.ts
// Helpers for GET /api/engagements: GSI keys + queries, list pagination, and cheap per-user hydration.
//
// ── GSI (create BEFORE setting ENGAGEMENTS_GSI_ENABLED=true; see docs in the PR / reply) ──────────────
//   Index name : EngagementsBySource           (same name on SocialAndContent and MatchMoments tables)
//   Partition  : engSource    (S)  "match_moment" | "fliparena"
//   Sort       : engCreatedAt (N)  createdAt in epoch ms
//   Projection : ALL           (list items are mapped from the full row; a KEYS_ONLY index would need a GetItem per row)
// Dedicated attributes (not `createdAt`/`source`) are used on purpose: a table write fails with a
// ValidationException if an attribute that is a GSI key has the wrong type, and legacy rows hold
// createdAt as ISO strings in places. The index is sparse: rows without engSource are simply absent from it,
// so every row must be backfilled (scripts/backfill-engagement-gsi.ts) before the flag is switched on.

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { batchGetItems } from "@/lib/dynamodbBatch";
import { applyEngagementStats, getEngagementStats } from "@/lib/engagementSocial";

export const ENGAGEMENT_GSI_NAME = "EngagementsBySource";
export const DEFAULT_LIST_LIMIT = 15;
export const MAX_LIST_LIMIT = 50;
export const LIST_CACHE_TTL_SECONDS = 5;
const STATS_CHUNK_SIZE = 5;

export function isGsiEnabled(): boolean {
  return String(process.env.ENGAGEMENTS_GSI_ENABLED || "").toLowerCase() === "true";
}

export function parseListLimit(raw: string | null): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(n, MAX_LIST_LIMIT);
}

export function parseBefore(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Same default the list mapper uses when `source` is absent. */
export function engagementSourceOf(item: any): string {
  return String(item?.source || (item?.isMatchMoment ? "match_moment" : "fliparena"));
}

/** Adds the sparse-GSI key attributes to an item that is about to be written. Safe to call repeatedly. */
export function withEngagementGsiKeys<T extends Record<string, any>>(item: T): T & { engSource: string; engCreatedAt: number } {
  const ts = Number(item.createdAt) || Number(item.updatedAt) || Date.now();
  return { ...item, engSource: engagementSourceOf(item), engCreatedAt: ts };
}

/** Which engSource partitions a request can match. */
export function sourcePartitionsFor(opts: { source: string | null; category: string | null; excludeFlipArena: boolean; excludeMatchMoments: boolean }): string[] {
  if (opts.source === "match_moment" || opts.category === "match_moment" || opts.excludeFlipArena) return ["match_moment"];
  if (opts.source === "fliparena" || opts.category === "fliparena" || opts.excludeMatchMoments) return ["fliparena"];
  return ["match_moment", "fliparena"];
}

export function isMissingIndexError(err: any): boolean {
  const msg = String(err?.message || "");
  // A missing GSI surfaces as ValidationException ("The table does not have the specified index").
  // ResourceNotFoundException means the table itself is missing and is handled by the caller's table fallback.
  return err?.name === "ValidationException" && /index/i.test(msg);
}

/**
 * Newest-first rows from the GSI of one table, across the requested partitions, strictly older than `before`.
 * Returns at most `rows` rows per partition; `exhausted` is true when no partition has more rows and
 * `cursorTs` is the `before` value to continue from.
 * Throws on a missing index so the caller can fall back to the Scan path.
 */
export async function queryEngagementIndex(
  table: string,
  partitions: string[],
  before: number | null,
  rows: number
): Promise<{ items: any[]; exhausted: boolean; cursorTs: number | null }> {
  const results = await Promise.all(
    partitions.map(async (source) => {
      const res = await docClient.send(
        new QueryCommand({
          TableName: table,
          IndexName: ENGAGEMENT_GSI_NAME,
          KeyConditionExpression: before != null ? "engSource = :s AND engCreatedAt < :b" : "engSource = :s",
          ExpressionAttributeValues: before != null ? { ":s": source, ":b": before } : { ":s": source },
          ScanIndexForward: false,
          Limit: rows,
        })
      );
      const items = res.Items || [];
      const last = items[items.length - 1];
      return { items, more: Boolean(res.LastEvaluatedKey), lastTs: last ? Number(last.engCreatedAt) : null };
    })
  );
  // Where the next round must resume: the oldest row among partitions that still have more rows.
  const resumeTs = results.filter((r) => r.more && r.lastTs != null).map((r) => r.lastTs as number);
  return {
    items: results.flatMap((r) => r.items),
    exhausted: results.every((r) => !r.more),
    cursorTs: resumeTs.length ? Math.min(...resumeTs) : null,
  };
}

/** Public (user-independent) stats for each item, in small parallel chunks so a page never fans out N queries at once. */
export async function hydratePublicStats(items: any[]): Promise<void> {
  for (let i = 0; i < items.length; i += STATS_CHUNK_SIZE) {
    const chunk = items.slice(i, i + STATS_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (it) => {
        try {
          applyEngagementStats(it, await getEngagementStats(String(it.id)));
        } catch (err) {
          console.warn("Engagements stats hydration notice:", err);
        }
      })
    );
  }
}

/**
 * The requesting user's like / vote for each item using key lookups (BatchGetItem) instead of reading every
 * child row of every engagement. Matching rules are the same as before: exact `LIKE#<id>` / `VOTE#<id>`, plus
 * `VOTE#<id>#<questionId>` for multi-question quizzes (prefix Query, quizzes only).
 */
export async function getUserInteractions(
  itemIds: string[],
  quizIds: Set<string>,
  candidateIds: string[]
): Promise<Map<string, { liked: boolean; vote: string | null }>> {
  const out = new Map<string, { liked: boolean; vote: string | null }>();
  for (const id of itemIds) out.set(id, { liked: false, vote: null });
  if (itemIds.length === 0 || candidateIds.length === 0) return out;

  const keys: Record<string, any>[] = [];
  for (const id of itemIds) {
    for (const uid of candidateIds) {
      keys.push({ contentId: `ENGAGEMENT#${id}`, sk: `LIKE#${uid}` });
      keys.push({ contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}` });
    }
  }

  try {
    const rows = await batchGetItems(TABLES.SocialAndContent, keys, {
      projectionExpression: "contentId, sk, selectedOptionId",
    });
    for (const r of rows) {
      const id = String(r.contentId || "").replace(/^ENGAGEMENT#/, "");
      const entry = out.get(id);
      if (!entry) continue;
      const sk = String(r.sk || "");
      if (sk.startsWith("LIKE#")) entry.liked = true;
      else if (sk.startsWith("VOTE#") && r.selectedOptionId != null && entry.vote === null) entry.vote = String(r.selectedOptionId);
    }
  } catch (err) {
    console.warn("Engagements per-user BatchGet notice:", err);
  }

  // Multi-question quizzes store VOTE#<uid>#<questionId>; BatchGet cannot prefix-match, so do a key-bounded Query.
  const quizLookups: Promise<void>[] = [];
  for (const id of quizIds) {
    const entry = out.get(id);
    if (!entry || entry.vote !== null) continue;
    for (const uid of candidateIds) {
      quizLookups.push(
        docClient
          .send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
              ExpressionAttributeValues: { ":c": `ENGAGEMENT#${id}`, ":p": `VOTE#${uid}#` },
              ProjectionExpression: "sk, selectedOptionId",
              Limit: 1,
            })
          )
          .then((res) => {
            const hit = (res.Items || []).find((x) => x.selectedOptionId != null);
            if (hit && entry.vote === null) entry.vote = String(hit.selectedOptionId);
          })
          .catch((err) => console.warn("Engagements quiz vote lookup notice:", err))
      );
    }
  }
  await Promise.all(quizLookups);
  return out;
}
