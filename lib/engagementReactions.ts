// lib/engagementReactions.ts
// Helpers for GET /api/engagements/my-reactions: sparse-GSI keys written at like/comment/reply time.
//
// ── GSI (create BEFORE deploying the write-time change; see PR notes) ────────────────────────────────
//   Index name : ReactionsByUser                (SocialAndContent table only)
//   Partition  : reactorKey (S)  "<userId>#like" | "<userId>#comment" | "<userId>#reply"
//   Sort       : reactedAt  (N)  epoch ms when the user liked / commented / replied
//   Projection : INCLUDE engagementId, text, parentId, commentId   (no GetItem per row)
// Dedicated attributes (not `createdAt` / `userId`) are used on purpose, same as EngagementsBySource:
// comment rows store the user as `authorUid` (no `userId`), and a GSI key attribute with the wrong type
// fails the whole table write. The index is sparse: only like/comment rows of match-moment engagements
// carry reactorKey, so unliking (row deleted) removes the entry with no extra cleanup.

export const REACTION_GSI_NAME = "ReactionsByUser";

export type ReactionAction = "like" | "comment" | "reply";
export const REACTION_ACTIONS: ReactionAction[] = ["like", "comment", "reply"];

export function reactorKeyOf(userId: string, action: ReactionAction): string {
  return `${userId}#${action}`;
}

/** Same rule engagementPersistence uses to decide an engagement is a match moment. */
export function isMatchMomentEngagement(item: any): boolean {
  return Boolean(item && (item.source === "match_moment" || item.isMatchMoment === true));
}

/**
 * Which likes/comments count as "reactions":
 *  - match-moment engagements, and
 *  - visible recognitions / outcome reveals. These use the same like/comment routes but have no engagement row
 *    (findEngagementById returns null), and the fan app always sends their matchId, so "no engagement + a
 *    matchId" identifies them.
 */
export function isTrackedReactionTarget(engagement: any, matchIdHint?: string): boolean {
  if (engagement) return isMatchMomentEngagement(engagement);
  return Boolean(matchIdHint && String(matchIdHint).trim());
}

/**
 * Adds the sparse-GSI key attributes to a like / comment / reply row about to be written.
 * Returns the row unchanged unless the target is a tracked reaction target (see above).
 */
export function withReactionKeys<T extends Record<string, any>>(
  row: T,
  opts: { userId: string; action: ReactionAction; at: number; engagement: any; matchIdHint?: string }
): T & { reactorKey?: string; reactedAt?: number } {
  if (!opts.userId || !isTrackedReactionTarget(opts.engagement, opts.matchIdHint)) return row;
  return { ...row, reactorKey: reactorKeyOf(opts.userId, opts.action), reactedAt: opts.at };
}

export function isMissingIndexError(err: any): boolean {
  return err?.name === "ValidationException" && /index/i.test(String(err?.message || ""));
}
