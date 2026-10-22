// backend/lib/notifications/gamificationNotifications.ts — Gamification Notification Dispatcher
// Follows the same pattern as flipLongNotifications.ts / fliplineNotifications.ts
import { createNotification } from "./service";

// ─── Payload Interfaces ──────────────────────────────────────────────────────

export interface PointsEarnedPayload {
  userId: string;
  userEmail?: string | null;
  userName?: string;
  pointsAwarded: number;
  newTotalXP: number;
  reason: string;                       // e.g. "LIKE", "CREATE_POST", "DAILY_LOGIN"
  reasonLabel?: string;                 // human-readable label, e.g. "Liked a post"
  entityId?: string;                    // post/video/quiz ID that triggered the points
  metadata?: Record<string, unknown>;
}

export interface BadgeUnlockedPayload {
  userId: string;
  userEmail?: string | null;
  userName?: string;
  badgeId: string;                      // e.g. "post", "trivia", "community"
  badgeName: string;                    // e.g. "Headliner", "Quiz Master"
  badgeLevel: number;                   // 1-5
  badgeIcon?: string;                   // e.g. "/images/badges/postl3.png"
  featureKey?: string;                  // FeatureKey from roarBadges
  metadata?: Record<string, unknown>;
}

export interface LevelUpPayload {
  userId: string;
  userEmail?: string | null;
  userName?: string;
  previousTier: string;                 // e.g. "Spark"
  newTier: string;                      // e.g. "Chant"
  tierLevel: number;                    // 1-7
  subRank?: number;                     // 1-3
  tierLabel: string;                    // e.g. "Chant II"
  tierIcon?: string;                    // e.g. "/images/badges/globalchant.png"
  totalXP: number;
  metadata?: Record<string, unknown>;
}

export interface StreakMilestonePayload {
  userId: string;
  userEmail?: string | null;
  userName?: string;
  streakDays: number;
  milestoneId: string;                  // e.g. "STREAK_7", "STREAK_30", "STREAK_100", "STREAK_365"
  bonusXP: number;
  metadata?: Record<string, unknown>;
}

export interface GamificationGenericPayload {
  userId: string;
  recipientEmail?: string | null;
  notificationType: string;
  title: string;
  body: string;
  actor?: {
    userId?: string;
    username?: string;
    avatarUrl?: string;
  };
  priority?: "HIGH" | "NORMAL" | "LOW";
  metadata?: Record<string, unknown>;
}

// ─── 1. Points Earned Notification ───────────────────────────────────────────

/**
 * Dispatches a notification when a user earns XP points from an action.
 * Typically called right after awardUserPoints() returns true.
 */
export async function notifyPointsEarned(
  payload: PointsEarnedPayload
): Promise<string | null> {
  if (!payload.userId || payload.pointsAwarded <= 0) return null;

  const label = payload.reasonLabel || formatReasonLabel(payload.reason);
  const title = `+${payload.pointsAwarded} XP Earned!`;
  const body = `You earned ${payload.pointsAwarded} XP for ${label}. Total: ${payload.newTotalXP.toLocaleString()} XP`;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.userEmail || null,
    category: "gamification",
    notification_type: "gamification.points_earned",
    title,
    body,
    subtitle: `${payload.pointsAwarded} XP — ${label}`,
    cta_label: "View Progress",
    cta_target: "/MainModules/ROAR?tab=profile",
    priority: "NORMAL",
    actor: payload.userName
      ? { username: payload.userName, userId: payload.userId }
      : null,
    metadata: {
      pointsAwarded: payload.pointsAwarded,
      newTotalXP: payload.newTotalXP,
      reason: payload.reason,
      ...(payload.entityId && { entityId: payload.entityId }),
      ...payload.metadata,
    },
  });
}

// ─── 2. Badge Unlocked Notification ──────────────────────────────────────────

/**
 * Dispatches a notification when a user unlocks a new feature mastery badge level.
 * Call after featureLevels[key] increments in awardUserPoints.
 */
export async function notifyBadgeUnlocked(
  payload: BadgeUnlockedPayload
): Promise<string | null> {
  if (!payload.userId || !payload.badgeName) return null;

  const levelLabel = `Level ${payload.badgeLevel}`;
  const title = `🏅 Badge Unlocked: ${payload.badgeName}!`;
  const body = `Congrats! You've reached ${payload.badgeName} (${levelLabel}) in ${formatBadgeCategory(payload.badgeId)}. Keep going!`;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.userEmail || null,
    category: "gamification",
    notification_type: "gamification.badge_unlocked",
    title,
    body,
    subtitle: `${payload.badgeName} — ${levelLabel}`,
    cta_label: "View Badges",
    cta_target: "/MainModules/ROAR?tab=profile&section=badges",
    priority: "HIGH",
    actor: payload.userName
      ? { username: payload.userName, userId: payload.userId }
      : null,
    metadata: {
      badgeId: payload.badgeId,
      badgeName: payload.badgeName,
      badgeLevel: payload.badgeLevel,
      badgeIcon: payload.badgeIcon || null,
      featureKey: payload.featureKey || payload.badgeId,
      ...payload.metadata,
    },
  });
}

// ─── 3. Level Up (Global Tier Promotion) Notification ────────────────────────

/**
 * Dispatches a notification when a user's global tier changes (e.g. Spark → Chant).
 * Call when rankState.globalTier differs from the user's previous tier.
 */
export async function notifyLevelUp(
  payload: LevelUpPayload
): Promise<string | null> {
  if (!payload.userId || !payload.newTier) return null;

  // Don't notify if tier hasn't actually changed
  if (payload.previousTier === payload.newTier) return null;

  const title = `🚀 Level Up: ${payload.tierLabel}!`;
  const body = `You've advanced from ${payload.previousTier} to ${payload.tierLabel}! Your total XP: ${payload.totalXP.toLocaleString()}`;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.userEmail || null,
    category: "gamification",
    notification_type: "gamification.level_up",
    title,
    body,
    subtitle: `${payload.previousTier} → ${payload.tierLabel}`,
    cta_label: "View Rank",
    cta_target: "/MainModules/ROAR?tab=profile&section=rank",
    priority: "HIGH",
    actor: payload.userName
      ? { username: payload.userName, userId: payload.userId }
      : null,
    metadata: {
      previousTier: payload.previousTier,
      newTier: payload.newTier,
      tierLevel: payload.tierLevel,
      subRank: payload.subRank || 0,
      tierLabel: payload.tierLabel,
      tierIcon: payload.tierIcon || null,
      totalXP: payload.totalXP,
      ...payload.metadata,
    },
  });
}

// ─── 4. Streak Milestone Notification ────────────────────────────────────────

/**
 * Dispatches a notification when a user hits a streak milestone (7, 30, 100, 365 days).
 * Call after milestoneToUnlock is set and unlocked in awardUserPoints.
 */
export async function notifyStreakMilestone(
  payload: StreakMilestonePayload
): Promise<string | null> {
  if (!payload.userId || !payload.milestoneId) return null;

  const title = `🔥 ${payload.streakDays}-Day Streak!`;
  const body = `Amazing! You've maintained a ${payload.streakDays}-day login streak and earned a ${payload.bonusXP} XP bonus!`;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.userEmail || null,
    category: "gamification",
    notification_type: "gamification.streak_milestone",
    title,
    body,
    subtitle: `${payload.streakDays}-day streak — +${payload.bonusXP} XP`,
    cta_label: "View Streak",
    cta_target: "/MainModules/ROAR?tab=profile&section=streaks",
    priority: "HIGH",
    actor: payload.userName
      ? { username: payload.userName, userId: payload.userId }
      : null,
    metadata: {
      streakDays: payload.streakDays,
      milestoneId: payload.milestoneId,
      bonusXP: payload.bonusXP,
      ...payload.metadata,
    },
  });
}

// ─── 5. Generic Gamification Notification Dispatcher ─────────────────────────

/**
 * General-purpose dispatcher for any gamification event not covered above.
 * E.g. combo bonus, completionist badge, referral payout, etc.
 */
export async function dispatchGamificationNotification(
  payload: GamificationGenericPayload
): Promise<string | null> {
  if (!payload.userId) return null;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.recipientEmail || null,
    category: "gamification",
    notification_type: payload.notificationType.startsWith("gamification")
      ? payload.notificationType
      : `gamification.${payload.notificationType}`,
    title: payload.title,
    body: payload.body,
    cta_label: "View Profile",
    cta_target: "/MainModules/ROAR?tab=profile",
    priority: payload.priority || "NORMAL",
    actor: payload.actor || null,
    metadata: payload.metadata,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converts a reason code like "CREATE_POST" to "creating a post" */
function formatReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    DAILY_LOGIN: "daily login",
    LIKE: "liking content",
    COMMENT: "commenting",
    CREATE_POST: "creating a post",
    SHARE: "sharing content",
    ARTICLE_SHARE: "sharing an article",
    SHARE_DROP: "sharing a drop",
    SIGNUP_BONUS: "signing up",
    WELCOME_BONUS: "welcome bonus",
    INVITE_CHANT: "referral payout",
    REFERRAL_COMMISSION: "referral commission",
    CREATOR_STREAK_BONUS: "creator streak bonus",
    WIN_FEATURED_POST: "winning featured post",
    ROAR_POST: "posting on ROAR",
    ROAR_HOT_TAKE: "posting a hot take",
    ROAR_DEBATE: "starting a debate",
    ROAR_PREDICTION: "making a prediction",
    ROAR_QUIZ: "completing a quiz",
    ROAR_TRIVIA_CORRECT: "answering trivia correctly",
    ROAR_BATTLE_PARTICIPATE: "participating in a fan battle",
    ROAR_DEBATE_PARTICIPATE: "joining a debate",
    ROAR_PREDICTION_PARTICIPATE: "making a prediction",
    ENGAGEMENT_CREATE: "creating an engagement",
    ENGAGEMENT_PARTICIPATE: "participating in an engagement",
    ENGAGEMENT_CREATE_FAN_BATTLE: "creating a fan battle",
    ENGAGEMENT_CREATE_QUIZ: "creating a quiz",
    ENGAGEMENT_CREATE_POLL: "creating a poll",
    ENGAGEMENT_CREATE_PREDICTION: "creating a prediction",
    ENGAGEMENT_PARTICIPATE_FAN_BATTLE: "joining a fan battle",
    ENGAGEMENT_PARTICIPATE_QUIZ: "taking a quiz",
    ENGAGEMENT_PARTICIPATE_POLL: "voting in a poll",
    ENGAGEMENT_PARTICIPATE_PREDICTION: "making a prediction",
    AUCTION_BID: "placing a bid",
    AMA_JOIN: "joining an AMA",
    BOOK_PLAYER_SESSION: "booking a player session",
    LISTEN_AUDIO_DROP: "listening to an audio drop",
    WATCH_VIDEO_DROP: "watching a video drop",
  };

  return map[reason] || reason.replace(/_/g, " ").toLowerCase();
}

/** Converts badge ID to a human-readable category string */
function formatBadgeCategory(badgeId: string): string {
  const map: Record<string, string> = {
    post: "Posts",
    debate: "Debates",
    prediction: "Predictions",
    trivia: "Trivia",
    fanBattle: "Fan Battles",
    community: "Community",
    shares: "Shares",
    comments: "Comments",
    media: "Media",
    referrals: "Referrals",
  };
  return map[badgeId] || badgeId;
}
