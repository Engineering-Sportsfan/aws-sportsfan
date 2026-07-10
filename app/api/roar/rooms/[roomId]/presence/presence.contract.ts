// api/roar/rooms/[roomId]/presence/presence.contract.ts
//
// Pure, framework-free logic shared by POST and GET in route.ts. The goal
// is that `fanCount` and `fans` can never structurally diverge: both are
// derived from the same `buildPresencePayload` call over the same
// already-TTL-filtered record set.

export const PRESENCE_TTL_MS = 60_000;

export interface FanRecord {
  uid: string;
  username: string;
  avatarUrl: string | null;
  badge: string | null;
  lastSeenAt: number;
}

export interface PublicFan {
  uid: string;
  username: string;
  avatarUrl: string | null;
  badge: string | null;
}

export interface PresencePayload {
  fanCount: number;
  fans: PublicFan[];
  totalJoinCount: number;
  pinnedPost: unknown | null;
}

export function isWithinTtl(
  lastSeenAt: number,
  now: number,
  ttlMs: number = PRESENCE_TTL_MS,
): boolean {
  return lastSeenAt >= now - ttlMs;
}

// Keeps the most-recently-seen record per uid. Defensive against a fan
// appearing twice in a snapshot (e.g. a doc write racing the read).
export function dedupeByUid(records: FanRecord[]): FanRecord[] {
  const byUid = new Map<string, FanRecord>();
  for (const r of records) {
    const existing = byUid.get(r.uid);
    if (!existing || r.lastSeenAt > existing.lastSeenAt) {
      byUid.set(r.uid, r);
    }
  }
  return Array.from(byUid.values());
}

export function sortByRecency(records: FanRecord[]): FanRecord[] {
  return [...records].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function toPublicFan(r: FanRecord): PublicFan {
  return {
    uid: r.uid,
    username: r.username,
    avatarUrl: r.avatarUrl ?? null,
    badge: r.badge ?? null,
  };
}

// `activeRecords` MUST already be TTL-filtered by the caller (both POST
// and GET run the same `lastSeenAt >= cutoff` Firestore query before
// calling this — no `.limit()` on that query, so the full active set is
// passed in). fanCount = the true size of that set; `fans` is a slice of
// it capped at `maxFans` for the avatar stack. Because both numbers come
// from the same `sorted` array, they cannot disagree.
export function buildPresencePayload(
  activeRecords: FanRecord[],
  opts: { totalJoinCount: number; pinnedPost: unknown | null; maxFans?: number },
): PresencePayload {
  const sorted = sortByRecency(dedupeByUid(activeRecords));
  const maxFans = opts.maxFans ?? 3;
  return {
    fanCount: sorted.length,
    fans: sorted.slice(0, maxFans).map(toPublicFan),
    totalJoinCount: opts.totalJoinCount,
    pinnedPost: opts.pinnedPost,
  };
}