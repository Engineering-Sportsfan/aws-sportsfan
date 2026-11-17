// lib/matchLeaderboard.ts — per-match SXP leaderboard (materialised totals + GSI read)
//
// Storage (GamificationAndWallet, reuses the existing `leaderboardType-points-index` GSI,
// same pattern as SERIES_PROGRESS# in fanJourneyService):
//   aggregate : { userId: "USER#<uid>", sk: "MATCH_SXP#<matchId>", leaderboardType: "MATCH_SXP#<matchId>",
//                 points: <match SXP>, rawUserId, userName, lastActivityAt }
//   idempotency marker (not in GSI): { userId: "USER#<uid>", sk: "MATCH_SXP_TX#<matchId>#<txId>" }
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { BatchGetCommand, GetCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

const GSI = "leaderboardType-points-index";

// Creation-type activities never count towards match SXP (mirrors the Fan Scorecard rule).
const EXCLUDED_TYPES = new Set([
  "ROAR_POST",
  "ROAR_DEBATE",
  "ROAR_PREDICTION",
  "ROAR_HOT_TAKE",
  "ROAR_MEMORY",
  "ROAR_RAW_REACTIONS",
  "ROAR_QUIZ",
]);

export function isMatchScoredType(type: string): boolean {
  const t = String(type || "").toUpperCase();
  return !!t && !EXCLUDED_TYPES.has(t) && !t.includes("CREATE");
}

export function cleanMatchId(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^MATCH#/i, "").trim();
}

export const matchLbType = (matchId: string) => `MATCH_SXP#${matchId}`;

/**
 * Idempotently adds `points` to the user's aggregate for the match.
 * Safe to call more than once for the same transactionId (the marker Put has a condition).
 * Returns true if applied, false if it was a duplicate / not eligible.
 */
export async function recordMatchPoints(p: {
  userId: string; // same id used for USER#<id> in the global leaderboard item
  userName?: string;
  matchId: string;
  type: string;
  points: number;
  transactionId: string;
  at?: number;
}): Promise<boolean> {
  const matchId = cleanMatchId(p.matchId);
  const uid = String(p.userId || "").replace(/^USER#/, "");
  if (!matchId || !uid || !(p.points > 0) || !isMatchScoredType(p.type)) return false;

  const now = p.at ?? Date.now();
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLES.GamificationAndWallet,
              Item: {
                userId: `USER#${uid}`,
                sk: `MATCH_SXP_TX#${matchId}#${p.transactionId}`,
                createdAt: now,
              },
              ConditionExpression: "attribute_not_exists(sk)",
            },
          },
          {
            Update: {
              TableName: TABLES.GamificationAndWallet,
              Key: { userId: `USER#${uid}`, sk: `MATCH_SXP#${matchId}` },
              UpdateExpression:
                "ADD points :p SET leaderboardType = :lt, rawUserId = :uid, matchId = :m, " +
                "userName = :n, lastActivityAt = :t",
              ExpressionAttributeValues: {
                ":p": p.points,
                ":lt": matchLbType(matchId),
                ":uid": uid,
                ":m": matchId,
                ":n": p.userName || uid,
                ":t": now,
              },
            },
          },
        ],
      })
    );
    return true;
  } catch (err: any) {
    if (err?.name === "TransactionCanceledException") return false; // duplicate transactionId
    console.warn("[matchLeaderboard] recordMatchPoints notice:", err?.message || err);
    return false;
  }
}

// ─── Read side ────────────────────────────────────────────────────────────────
export interface MatchLeaderboardRow {
  userId: string;
  userName: string;
  userHandle: string;
  avatarUrl: string | null;
  matchPoints: number;
  rank: number;
}

export interface MatchLeaderboardResult {
  success: true;
  matchId: string;
  totalUsers: number;
  userRank: number | null;
  userMatchPoints: number;
  leaderboard: MatchLeaderboardRow[];
}

const CACHE_TTL_MS = 45_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: now, value });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
  }
  return value;
}

async function countInPartition(lt: string, minPointsExclusive?: number): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.GamificationAndWallet,
        IndexName: GSI,
        KeyConditionExpression:
          minPointsExclusive === undefined ? "leaderboardType = :lt" : "leaderboardType = :lt AND points > :p",
        ExpressionAttributeValues:
          minPointsExclusive === undefined ? { ":lt": lt } : { ":lt": lt, ":p": minPointsExclusive },
        Select: "COUNT",
        ExclusiveStartKey: lastKey,
      })
    );
    count += res.Count ?? 0;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

// Leaderboard ids are the underscore form (chandu_srikakulam_sportsfan360_com) but IdentityAndAccess is
// usually keyed by email (USER#chandu.srikakulam@sportsfan360.com). Generate the likely keys for an id.
function identityKeyCandidates(uid: string): string[] {
  const clean = String(uid || "").trim().replace(/^USER#/i, "");
  if (!clean) return [];
  const out = new Set<string>([clean, clean.toLowerCase()]);
  if (clean.includes("@")) {
    const lower = clean.toLowerCase();
    out.add(lower);
    out.add(lower.replace(/[@.]/g, "_"));
    out.add(lower.replace(/[^a-z0-9]/g, "_"));
    const local = lower.split("@")[0];
    if (local) {
      out.add(local);
      out.add(local.replace(/[.]/g, "_"));
    }
    return Array.from(out);
  }
  const parts = clean.split("_");
  const SECOND = ["edu", "co", "ac", "gov", "org", "net"];
  const TLDS = ["com", "in", "org", "net", "edu", "io", "co", "ac", "gov", "app", "dev", "ai", "uk", "au", "ca"];
  const last = (parts[parts.length - 1] || "").toLowerCase();
  if (parts.length >= 3 && TLDS.includes(last)) {
    const second = (parts[parts.length - 2] || "").toLowerCase();
    const domainLen = SECOND.includes(second) && parts.length >= 4 ? 3 : 2;
    const domain = parts.slice(parts.length - domainLen).join(".");
    const local = parts.slice(0, parts.length - domainLen);
    for (const sep of [".", "_", "-", ""]) out.add(`${local.join(sep)}@${domain}`.toLowerCase());
  }
  return Array.from(out);
}

async function loadProfiles(uids: string[]): Promise<Map<string, any>> {
  const byUid = new Map<string, any[]>();
  const keyToUid = new Map<string, string>();
  const keys: string[] = [];
  for (const uid of new Set(uids)) {
    for (const c of identityKeyCandidates(uid)) {
      const k = `USER#${c}`;
      if (!keyToUid.has(k)) { keyToUid.set(k, uid); keys.push(k); }
    }
  }
  for (let i = 0; i < keys.length; i += 100) {
    try {
      const res = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLES.IdentityAndAccess]: {
              Keys: keys.slice(i, i + 100).map((k) => ({ entityId: k, sk: "USER#META" })),
            },
          },
        })
      );
      for (const it of res.Responses?.[TABLES.IdentityAndAccess] ?? []) {
        const uid = keyToUid.get(String(it.entityId));
        if (!uid) continue;
        (byUid.get(uid) ?? byUid.set(uid, []).get(uid)!).push(it);
      }
    } catch (err) {
      console.warn("[matchLeaderboard] profile batch get notice:", err);
    }
  }
  // Second pass: a stub record (e.g. only `email`) may point to a richer email-keyed record we didn't guess.
  const second = new Map<string, string>(); // identity key -> uid
  for (const [uid, recs] of byUid) {
    const merged = Object.assign({}, ...recs);
    if (displayNameOf(merged)) continue;
    const email = String(merged.email || "").trim().toLowerCase();
    const k = email ? `USER#${email}` : "";
    if (k && !keyToUid.has(k)) second.set(k, uid);
  }
  const secondKeys = Array.from(second.keys());
  for (let i = 0; i < secondKeys.length; i += 100) {
    try {
      const res = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLES.IdentityAndAccess]: {
              Keys: secondKeys.slice(i, i + 100).map((k) => ({ entityId: k, sk: "USER#META" })),
            },
          },
        })
      );
      for (const it of res.Responses?.[TABLES.IdentityAndAccess] ?? []) {
        const uid = second.get(String(it.entityId));
        if (uid) byUid.get(uid)!.push(it);
      }
    } catch (err) {
      console.warn("[matchLeaderboard] profile second-pass notice:", err);
    }
  }

  // Several records can exist per user (stub + full). Merge so the richest record wins per field.
  const out = new Map<string, any>();
  for (const [uid, recs] of byUid) {
    recs.sort((a, b) => Object.keys(a).length - Object.keys(b).length);
    out.set(uid, Object.assign({}, ...recs));
  }
  return out;
}

const displayNameOf = (u: any): string =>
  String(
    u?.name ||
      [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
      u?.displayName ||
      u?.username ||
      ""
  ).trim();

// Same fallback chain as /api/roar/profile -> user.avatarUrl
const avatarOf = (u: any): string | null =>
  u?.avatarUrl || u?.photoURL || u?.picture || u?.image || u?.profilePicture || u?.avatar || null;

export async function getMatchLeaderboard(opts: {
  matchId: string;
  limit: number;
  userId?: string | null;
}): Promise<MatchLeaderboardResult> {
  const matchId = cleanMatchId(opts.matchId);
  const lt = matchLbType(matchId);
  const limit = opts.limit;
  const userId = opts.userId ? String(opts.userId).replace(/^USER#/, "") : "";

  const board = await cached(`board|${matchId}|${limit}`, async () => {
    let [top, totalUsers] = await Promise.all([
      docClient.send(
        new QueryCommand({
          TableName: TABLES.GamificationAndWallet,
          IndexName: GSI,
          KeyConditionExpression: "leaderboardType = :lt",
          ExpressionAttributeValues: { ":lt": lt },
          ScanIndexForward: false,
          Limit: Math.min(Math.max(limit * 3, 50), 300), // over-fetch: one person can appear under several ids
        })
      ),
      countInPartition(lt),
    ]);
    const fetchedAll = (top.Items?.length ?? 0) >= totalUsers;
    let items = top.Items ?? [];

    // Fallback for completed matches where MATCH_SXP# was not populated in GSI:
    // Read PLAYER_SUMMARY# from MatchMoments table
    if (items.length === 0) {
      try {
        const summariesRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.MatchMoments,
            KeyConditionExpression: "entityId = :e AND begins_with(sk, :pfx)",
            ExpressionAttributeValues: { ":e": `MATCH#${matchId}`, ":pfx": "PLAYER_SUMMARY#" },
          })
        );
        if (summariesRes.Items && summariesRes.Items.length > 0) {
          items = summariesRes.Items.map((s: any) => ({
            rawUserId: s.userId || String(s.sk || "").replace(/^PLAYER_SUMMARY#/, ""),
            userId: s.userId || String(s.sk || "").replace(/^PLAYER_SUMMARY#/, ""),
            userName: s.name || s.userName,
            points: Number(s.totals?.sxpAwarded || s.sxpAwarded || 0),
            rank: Number(s.rank || 0),
            avatarUrl: s.avatarUrl || s.avatar,
          }));
          items.sort((a, b) => b.points - a.points);
          totalUsers = items.length;
        }
      } catch (sumErr) {
        console.warn("[matchLeaderboard] fallback to player summaries notice:", sumErr);
      }
    }

    // Collapse one person's multiple ids (email form / underscore form) into one row, summing their points.
    // Key = id with every non-alphanumeric removed: chandu.srikakulam@x.com and chandu_srikakulam_x_com match.
    const merged = new Map<string, any>();
    for (const it of items) {
      const rid = String(it.rawUserId || it.userId).replace(/^USER#/, "");
      const key = rid.toLowerCase().replace(/[^a-z0-9]/g, "");
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { ...it, rawUserId: rid, userId: rid, points: Number(it.points ?? 0) });
      } else {
        prev.points += Number(it.points ?? 0);
        // prefer the underscore-form id (the canonical leaderboard id) as the displayed userId
        if (!rid.includes("@") && String(prev.rawUserId).includes("@")) { prev.rawUserId = rid; prev.userId = rid; }
      }
    }
    items = Array.from(merged.values()).sort((a, b) => b.points - a.points);
    if (fetchedAll) totalUsers = items.length;
    items = items.slice(0, limit);

    const profiles = await loadProfiles(items.map((i) => String(i.rawUserId || i.userId).replace(/^USER#/, "")));

    let prevPoints = -1;
    let prevRank = 0;
    const rows: MatchLeaderboardRow[] = items.map((it, idx) => {
      const uid = String(it.rawUserId || it.userId).replace(/^USER#/, "");
      const pts = Number(it.points ?? 0);
      const rank = pts === prevPoints ? prevRank : idx + 1; // ties share a rank (1,2,2,4)
      prevPoints = pts;
      prevRank = rank;
      const prof = profiles.get(uid);
      return {
        userId: uid,
        // Never expose the raw underscore id: profile name -> email local part -> stored name only if it isn't an id.
        userName:
          displayNameOf(prof) ||
          String(prof?.email || "").split("@")[0] ||
          (/^[a-z0-9]+(_[a-z0-9]+)+$/i.test(String(it.userName || "")) ? "Fan" : String(it.userName || "Fan")),
        userHandle: String(prof?.handle || prof?.username || ""),
        avatarUrl: avatarOf(prof) || it.avatarUrl || null,
        matchPoints: pts,
        rank,
      };
    });
    return { totalUsers, rows };
  });

  let userRank: number | null = null;
  let userMatchPoints = 0;
  if (userId && userId !== "null" && userId !== "undefined") {
    const me = await cached(`user|${matchId}|${userId}`, async () => {
      const candidates = identityKeyCandidates(userId);
      let foundPts = 0;
      let foundRank: number | null = null;

      // 1. Try MATCH_SXP# across candidate IDs
      for (const cand of candidates) {
        try {
          const got = await docClient.send(
            new GetCommand({
              TableName: TABLES.GamificationAndWallet,
              Key: { userId: `USER#${cand}`, sk: `MATCH_SXP#${matchId}` },
            })
          );
          const pts = Number(got.Item?.points ?? 0);
          if (got.Item && pts > 0) {
            foundPts = pts;
            foundRank = (await countInPartition(lt, pts)) + 1;
            break;
          }
        } catch {}
      }

      // 2. If not found, try RECAP#MATCH# in GamificationAndWallet
      if (!foundRank) {
        for (const cand of candidates) {
          try {
            const got = await docClient.send(
              new GetCommand({
                TableName: TABLES.GamificationAndWallet,
                Key: { userId: `USER#${cand}`, sk: `RECAP#MATCH#${matchId}` },
              })
            );
            if (got.Item) {
              foundPts = Number(got.Item.sxpAwarded ?? 0);
              foundRank = Number(got.Item.rank) || null;
              if (foundRank) break;
            }
          } catch {}
        }
      }

      // 3. If not found, try PLAYER_SUMMARY# in MatchMoments
      if (!foundRank) {
        for (const cand of candidates) {
          try {
            const safeKey = cand.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
            const got = await docClient.send(
              new GetCommand({
                TableName: TABLES.MatchMoments,
                Key: { entityId: `MATCH#${matchId}`, sk: `PLAYER_SUMMARY#${safeKey}` },
              })
            );
            if (got.Item) {
              foundPts = Number(got.Item.totals?.sxpAwarded || got.Item.sxpAwarded || 0);
              foundRank = Number(got.Item.rank) || null;
              if (foundRank) break;
            }
          } catch {}
        }
      }

      // 4. If not found, check if user exists in the resolved board rows
      if (!foundRank && board.rows.length > 0) {
        const candSet = new Set(candidates.map((c) => c.toLowerCase()));
        const matched = board.rows.find((r) => candSet.has(r.userId.toLowerCase()));
        if (matched) {
          foundPts = matched.matchPoints;
          foundRank = matched.rank;
        }
      }

      return { pts: foundPts, rank: foundRank };
    });
    userRank = me.rank;
    userMatchPoints = me.pts;
  }

  const resolvedTotalUsers = Math.max(board.totalUsers, board.rows.length, userRank || 0);

  return {
    success: true,
    matchId,
    totalUsers: resolvedTotalUsers,
    userRank,
    userMatchPoints,
    leaderboard: board.rows,
  };
}
