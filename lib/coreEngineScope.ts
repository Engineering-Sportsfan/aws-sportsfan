// lib/coreEngineScope.ts
// Canonical Core Engine entity scoping & normalization helpers (active environment only).

import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";

export function normalizeMatchKey(raw?: unknown): string {
  return cleanMatchId(raw).replace(/^MATCH-/i, "").toLowerCase();
}

export interface CoreMatchHint {
  matchId: string;
  title?: string;
  sport?: string;
  seriesId?: string;
  tournament?: string;
  home_team?: string;
  away_team?: string;
  teamA?: string;
  teamB?: string;
  status?: string;
  matchDate?: string;
  updatedAt?: number;
}

/** Normalize a match ID by stripping MATCH# prefix and rejecting sentinel strings. */
export function cleanMatchId(raw?: unknown): string {
  const s = String(raw || "")
    .replace(/^MATCH#/i, "")
    .trim();
  if (!s || s === "undefined" || s === "null" || s === "[object Object]") {
    return "";
  }
  return s;
}

/** Reject empty, nullish, or stringified object labels such as "[object Object]". */
export function isValidTeamLabel(val: unknown): boolean {
  if (!val || typeof val === "object") return false;
  const s = String(val).trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower !== "undefined" && lower !== "null" && !lower.includes("[object object]");
}

/** Validate that a match record does not have corrupted team/title fields. */
export function hasValidMatchTeams(match: any): boolean {
  if (!match || typeof match !== "object") return false;
  const candidates = [match.home_team, match.away_team, match.teamA, match.teamB, match.title, match.name];
  for (const c of candidates) {
    if (typeof c === "string" && c.toLowerCase().includes("[object object]")) {
      return false;
    }
    if (c && typeof c === "object") {
      return false;
    }
  }
  const hasHome = isValidTeamLabel(match.home_team) || isValidTeamLabel(match.teamA);
  const hasAway = isValidTeamLabel(match.away_team) || isValidTeamLabel(match.teamB);
  const hasTitle = isValidTeamLabel(match.title) || isValidTeamLabel(match.name);
  if (match.isCoreEngineMatch && cleanMatchId(match.match_id || match.id)) {
    return true;
  }
  return (hasHome && hasAway) || hasTitle;
}

/** Determine whether an engagement belongs to Core Engine Match Moments (not standalone FlipArena). */
export function isCoreMatchMomentEngagement(e: any): boolean {
  if (!e || typeof e !== "object") return false;
  const src = String(e.source || "").toLowerCase();
  const cat = String(e.category || "").toLowerCase();
  if (src === "fliparena" || cat === "fliparena") return false;
  return (
    src === "match_moment" ||
    cat === "match_moment" ||
    Boolean(e.isMatchMoment) ||
    Boolean(e.momentId) ||
    Boolean(e.matchId) ||
    String(e.sk || "").startsWith("LOOP#")
  );
}

/** Deduplicate Match Moments by clean momentId, keeping the freshest/richest record. */
export function dedupeMoments<T extends Record<string, any>>(list: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of list || []) {
    if (!item || typeof item !== "object") continue;
    const rawId = String(item.momentId || item.id || String(item.sk || "").replace(/^MOMENT#/i, "")).trim();
    const id = rawId.replace(/^MOMENT#/i, "").trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...item, id, momentId: id });
      continue;
    }
    const prevTs = Number(prev.updatedAt || prev.createdAt || 0);
    const curTs = Number(item.updatedAt || item.createdAt || 0);
    const merged = curTs >= prevTs ? { ...prev, ...item, id, momentId: id } : { ...item, ...prev, id, momentId: id };
    byId.set(id, merged);
  }
  return Array.from(byId.values());
}

/** Scan DynamoDB with full LastEvaluatedKey pagination (safety-capped). */
async function scanAllItems(
  client: typeof docClient,
  tableName: string,
  options: {
    FilterExpression?: string;
    ExpressionAttributeValues?: Record<string, any>;
    ProjectionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    maxPages?: number;
  } = {}
): Promise<any[]> {
  const items: any[] = [];
  let lastKey: Record<string, any> | undefined;
  let pages = 0;
  const maxPages = options.maxPages ?? 30;
  try {
    do {
      const res = await client.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: options.FilterExpression,
          ExpressionAttributeValues: options.ExpressionAttributeValues,
          ProjectionExpression: options.ProjectionExpression,
          ExpressionAttributeNames: options.ExpressionAttributeNames,
          ExclusiveStartKey: lastKey,
        })
      );
      if (res.Items?.length) items.push(...res.Items);
      lastKey = res.LastEvaluatedKey;
      pages++;
    } while (lastKey && pages < maxPages);
  } catch (err) {
    console.warn(`[coreEngineScope] Scan notice on ${tableName}:`, err);
  }
  return items;
}

/**
 * Discover all Match IDs belonging to the active environment's Core Engine scope:
 * - MATCH#META records inside TABLES.MatchMoments
 * - Any matchId referenced by MOMENT#, LOOP#, RECOGNITION# in TABLES.MatchMoments
 * - Any matchId referenced by Core Engine match-moment ENGAGEMENT#META rows in TABLES.SocialAndContent
 */
export async function getCoreEngineReferencedMatchIds(
  client: typeof docClient = docClient
): Promise<{
  matchMetaById: Map<string, any>;
  referencedHintsById: Map<string, CoreMatchHint>;
  coreMatchIds: Set<string>;
}> {
  const matchMetaById = new Map<string, any>();
  const referencedHintsById = new Map<string, CoreMatchHint>();
  const coreMatchIds = new Set<string>();
  const canonicalIdByKey = new Map<string, string>();

  const pickCanonicalMatchId = (prevId: string | undefined, nextId: string): string => {
    if (!prevId) return nextId;
    if (nextId.toUpperCase().startsWith("MATCH-") && !prevId.toUpperCase().startsWith("MATCH-")) {
      return nextId;
    }
    return prevId;
  };

  const upsertHint = (rawMatchId: unknown, item: any) => {
    const rawClean = cleanMatchId(rawMatchId);
    const key = normalizeMatchKey(rawClean);
    if (!rawClean || !key) return;
    const matchId = pickCanonicalMatchId(canonicalIdByKey.get(key), rawClean);
    canonicalIdByKey.set(key, matchId);
    if (rawClean !== matchId) {
      coreMatchIds.delete(rawClean);
      const oldHint = referencedHintsById.get(rawClean);
      if (oldHint) referencedHintsById.delete(rawClean);
    }
    coreMatchIds.add(matchId);

    const prev = referencedHintsById.get(matchId);
    const ts = Number(item?.updatedAt || item?.createdAt || 0);
    const nextHint: CoreMatchHint = {
      matchId,
      title: isValidTeamLabel(item?.matchTitle)
        ? String(item.matchTitle).trim()
        : isValidTeamLabel(item?.title) && String(item?.sk || "") === "MATCH#META"
        ? String(item.title).trim()
        : prev?.title,
      sport: item?.sport ? String(item.sport).toLowerCase() : prev?.sport,
      seriesId: item?.seriesId || prev?.seriesId,
      tournament: isValidTeamLabel(item?.tournament) ? String(item.tournament).trim() : prev?.tournament,
      home_team: isValidTeamLabel(item?.home_team) ? String(item.home_team).trim() : prev?.home_team,
      away_team: isValidTeamLabel(item?.away_team) ? String(item.away_team).trim() : prev?.away_team,
      teamA: isValidTeamLabel(item?.teamA) ? String(item.teamA).trim() : prev?.teamA,
      teamB: isValidTeamLabel(item?.teamB) ? String(item.teamB).trim() : prev?.teamB,
      status: item?.status && String(item?.sk || "") === "MATCH#META" ? String(item.status) : prev?.status,
      matchDate: item?.matchDate || item?.date || prev?.matchDate,
      updatedAt: Math.max(prev?.updatedAt || 0, ts),
    };
    referencedHintsById.set(matchId, nextHint);
  };

  const [mmItems, socialItems] = await Promise.all([
    scanAllItems(client, TABLES.MatchMoments, {
      FilterExpression:
        "sk = :meta OR begins_with(sk, :mom) OR begins_with(sk, :lp) OR begins_with(sk, :rec)",
      ExpressionAttributeValues: {
        ":meta": "MATCH#META",
        ":mom": "MOMENT#",
        ":lp": "LOOP#",
        ":rec": "RECOGNITION#",
      },
    }),
    scanAllItems(client, TABLES.SocialAndContent, {
      FilterExpression: "sk = :engMeta",
      ExpressionAttributeValues: { ":engMeta": "ENGAGEMENT#META" },
    }),
  ]);

  // Index canonical MATCH#META records first so bare refs (e.g. MVX99...) merge onto MATCH-MVX99...
  for (const it of mmItems) {
    if (String(it.sk || "") !== "MATCH#META") continue;
    const mid = cleanMatchId(it.matchId || it.match_id || it.entityId);
    const key = normalizeMatchKey(mid);
    if (!mid || !key) continue;
    const canonicalMid = pickCanonicalMatchId(canonicalIdByKey.get(key), mid);
    canonicalIdByKey.set(key, canonicalMid);
    coreMatchIds.add(canonicalMid);
    const prev = matchMetaById.get(canonicalMid);
    if (!prev || Number(it.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
      matchMetaById.set(canonicalMid, {
        ...it,
        id: canonicalMid,
        match_id: canonicalMid,
        isCoreEngineMatch: true,
      });
    }
    upsertHint(canonicalMid, it);
  }

  for (const it of mmItems) {
    if (String(it.sk || "") === "MATCH#META") continue;
    const mid = cleanMatchId(it.matchId || it.match_id || it.entityId);
    if (!mid) continue;
    upsertHint(mid, it);
  }

  for (const it of socialItems) {
    if (!isCoreMatchMomentEngagement(it)) continue;
    const mid = cleanMatchId(it.matchId || it.match_id || (String(it.entityId || "").startsWith("MATCH#") ? it.entityId : ""));
    if (!mid) continue;
    upsertHint(mid, it);
  }

  return { matchMetaById, referencedHintsById, coreMatchIds };
}
