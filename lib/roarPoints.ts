//lib/roarPoints.ts

import { awardUserPoints } from "@/lib/userPoints";
import type { PostType } from "@/app/models/Post";

// ─── Point values per ROAR post type ─────────────────────────────────────────
// Keeping fallback constants, but points will now load dynamically from pointRules config
export const ROAR_POINTS: Record<PostType | "post", number> = {
  hot_take: 2,
  prediction: 2,
  debate: 2,
  raw_reactions: 2,
  post: 2,
  quiz: 2,
};

// ─── Point values for non-post ROAR events ───────────────────────────────────
// Legacy fallback points for event actions (points now loaded from pointRules dynamically)
export const ROAR_EVENT_POINTS: Record<string, number> = {
  ROAR_DEBATE_PARTICIPATE: 2,
  ROAR_PREDICTION_PARTICIPATE: 2,
  ROAR_TRIVIA_CORRECT: 2,
  ROAR_BATTLE_PARTICIPATE: 2,
};


// ─── Reason key from post type ────────────────────────────────────────────────
export function roarReasonFromType(type: PostType | "post"): string {
  const map: Record<PostType | "post", string> = {
    hot_take: "ROAR_HOT_TAKE",
    prediction: "ROAR_PREDICTION",
    debate: "ROAR_DEBATE",
    raw_reactions: "ROAR_RAW_REACTIONS",
    post: "ROAR_POST",
    quiz: "ROAR_QUIZ",
  };
  return map[type];
}

// ─── awardRoarPoints ──────────────────────────────────────────────────────────
// Thin delegate wrapper to route post type reward logic
export async function awardRoarPoints({
  actualUserId,
  authUserId,
  userName,
  userEmail,
  userExists,
  postType,
  transactionId,
  metadata,
}: {
  actualUserId: string;
  authUserId?: string;
  userName: string;
  userEmail: string;
  userExists: boolean;
  postType: PostType | "post";
  transactionId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ awarded: boolean; points: number }> {
  const points = ROAR_POINTS[postType] ?? 2;
  const reason = roarReasonFromType(postType);

  return awardRoarPointsByReason({
    actualUserId,
    authUserId,
    userName,
    userEmail,
    userExists,
    reason,
    points,
    transactionId,
    metadata,
  });
}

// ─── awardRoarPointsByReason ──────────────────────────────────────────────────
// Delegates directly to awardUserPoints which handles Firestore pointRules lookup,
// streaks, limits, transaction auditing, and updating the users master score doc.
export async function awardRoarPointsByReason({
  actualUserId,
  authUserId,
  userName,
  userEmail,
  userExists,
  reason,
  points,
  transactionId,
  metadata,
}: {
  actualUserId: string;
  authUserId?: string;
  userName: string;
  userEmail: string;
  userExists: boolean;
  reason: string;
  points: number;
  transactionId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ awarded: boolean; points: number }> {
  const awarded = await awardUserPoints({
    actualUserId,
    authUserId,
    userName,
    userEmail,
    userExists,
    points,
    reason,
    transactionId,
    metadata,
  });

  return { awarded, points };
}