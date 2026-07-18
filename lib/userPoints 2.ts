// lib/userPoints.ts
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Simple in-memory cache for user profiles to reduce Firestore reads
interface CachedUserProfile {
  userName: string;
  userEmail: string;
  exists: boolean;
  actualUserId: string;
  authUserId: string;
  cachedAt: number;
}

const userProfileCache = new Map<string, CachedUserProfile>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── getUserInfo ──────────────────────────────────────────────────────────────
export async function getUserInfo(
  userId: string,
  fallbackName?: string,
  fallbackEmail?: string
): Promise<{
  userName: string;
  userEmail: string;
  exists: boolean;
  actualUserId: string;
  authUserId: string;
}> {
  const cached = userProfileCache.get(userId);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
    return {
      userName: cached.userName,
      userEmail: cached.userEmail,
      exists: cached.exists,
      actualUserId: cached.actualUserId,
      authUserId: cached.authUserId,
    };
  }

  try {
    let snap = await db.collection("users").doc(userId).get();
    let actualUserId = userId;

    if (!snap.exists) {
      const fallbackPromises: Promise<any>[] = [];
      const promiseTypes: string[] = [];

      if (fallbackEmail) {
        fallbackPromises.push(
          db.collection("users").where("email", "==", fallbackEmail).limit(1).get()
        );
        promiseTypes.push("email");
      }

      let sanitizedId = "";
      if (userId.includes('@')) {
        sanitizedId = userId.replace(/\./g, '_').replace(/@/g, '_');
        fallbackPromises.push(db.collection("users").doc(sanitizedId).get());
        promiseTypes.push("sanitized");
      }

      let emailFormatId = "";
      if (userId.includes('_') && !userId.includes('@')) {
        emailFormatId = userId.replace(/_/g, '.');
        fallbackPromises.push(db.collection("users").doc(emailFormatId).get());
        promiseTypes.push("emailFormat");
      }

      const results = await Promise.all(fallbackPromises);

      for (let i = 0; i < results.length; i++) {
        const type = promiseTypes[i];
        const res = results[i];

        if (type === "email" && !res.empty) {
          snap = res.docs[0];
          actualUserId = snap.id;
          break;
        } else if (type === "sanitized" && res.exists) {
          snap = res;
          actualUserId = sanitizedId;
          break;
        } else if (type === "emailFormat" && res.exists) {
          snap = res;
          actualUserId = emailFormatId;
          break;
        }
      }
    }

    let resolvedProfile;

    if (snap.exists) {
      const d = snap.data()!;
      const userName = d.firstName
        ? [d.firstName, d.lastName].filter(Boolean).join(" ")
        : d.name ||
        (d.email ? d.email.split("@")[0] : fallbackName) ||
        "User";
      resolvedProfile = {
        userName,
        userEmail: d.email || fallbackEmail || "",
        exists: true,
        actualUserId,
        authUserId: userId,
      };
    } else {
      resolvedProfile = {
        userName: fallbackName || "User",
        userEmail: fallbackEmail || "",
        exists: false,
        actualUserId: userId,
        authUserId: userId,
      };
    }

    userProfileCache.set(userId, {
      ...resolvedProfile,
      cachedAt: Date.now(),
    });

    return resolvedProfile;
  } catch (err) {
    console.error("[getUserInfo] error:", err);
    return {
      userName: fallbackName || "User",
      userEmail: fallbackEmail || "",
      exists: false,
      actualUserId: userId,
      authUserId: userId,
    };
  }
}

// ─── SPEC HARCODED FALLBACK VALUES ──────────────────────────────────────────
const DEFAULT_RULES_FALLBACKS: Record<string, { points: number; dailyLimit: number }> = {
  CREATE_POST: { points: 65, dailyLimit: 5 },
  CREATE_DEBATE: { points: 80, dailyLimit: 3 },
  CREATE_PREDICTION: { points: 55, dailyLimit: 5 },
  CREATE_TRIVIA: { points: 80, dailyLimit: 3 },
  CREATE_BATTLE: { points: 95, dailyLimit: 3 },
  UPLOAD_IMAGE: { points: 25, dailyLimit: 10 },
  UPLOAD_VIDEO: { points: 55, dailyLimit: 5 },
  WIN_FEATURED_POST: { points: 200, dailyLimit: 1 },
  CREATOR_STREAK_BONUS: { points: 50, dailyLimit: 1 },
  LIKE: { points: 2, dailyLimit: 15 },
  REACT: { points: 3, dailyLimit: 15 },
  COMMENT: { points: 8, dailyLimit: 20 },
  VOTE_PREDICTION: { points: 8, dailyLimit: 10 },
  JOIN_TRIVIA: { points: 8, dailyLimit: 10 },
  JOIN_BATTLE: { points: 15, dailyLimit: 10 },
  SHARE: { points: 15, dailyLimit: 10 },
  SAVE_POST: { points: 3, dailyLimit: 10 },
  FOLLOW_USER: { points: 3, dailyLimit: 10 },
  DAILY_LOGIN: { points: 15, dailyLimit: 1 },
  WATCH_ALONG_JOIN: { points: 10, dailyLimit: 3 },
  WATCH_ALONG_REACT: { points: 2, dailyLimit: 20 },
  WATCH_ALONG_CHAT: { points: 3, dailyLimit: 30 },
  WATCH_ALONG_HOST: { points: 40, dailyLimit: 1 },
  WATCH_ALONG_COMPLETE: { points: 25, dailyLimit: 2 },
  FANTASY_CREATE_TEAM: { points: 30, dailyLimit: 2 },
  FANTASY_JOIN_LEAGUE: { points: 15, dailyLimit: 5 },
  FANTASY_TOP_SCORE: { points: 50, dailyLimit: 1 },
  FANTASY_WIN_CONTEST: { points: 100, dailyLimit: 1 },
  ARTICLE_READ: { points: 3, dailyLimit: 10 },
  ARTICLE_COMMENT: { points: 5, dailyLimit: 10 },
  ARTICLE_SHARE: { points: 8, dailyLimit: 10 },
  ARTICLE_REACT: { points: 2, dailyLimit: 10 },
  LISTEN_AUDIO_DROP: { points: 5, dailyLimit: 5 },
  WATCH_VIDEO_DROP: { points: 8, dailyLimit: 5 },
  COMPLETE_DROP_SERIES: { points: 15, dailyLimit: 1 },
  SHARE_DROP: { points: 10, dailyLimit: 5 },
  SEND_INVITE: { points: 5, dailyLimit: 10 },
  INVITE_SIGNUP: { points: 50, dailyLimit: 10 },
  INVITE_CHANT: { points: 100, dailyLimit: 5 },
  STORE_PURCHASE: { points: 25, dailyLimit: 5 },
  REDEEM_REWARD: { points: 10, dailyLimit: 5 },
  WISHLIST_SAVE: { points: 2, dailyLimit: 10 },
  AUCTION_BID: { points: 5, dailyLimit: 20 },
  AUCTION_JOIN: { points: 10, dailyLimit: 5 },
  AUCTION_WIN: { points: 150, dailyLimit: 2 },
  BOOK_PLAYER_SESSION: { points: 20, dailyLimit: 2 },
  ATTEND_TRAINING: { points: 30, dailyLimit: 2 },
  ATTEND_BTS: { points: 30, dailyLimit: 2 },
  FEEDBACK_COMPLETE: { points: 10, dailyLimit: 2 },
  AMA_JOIN: { points: 15, dailyLimit: 3 },
  AMA_ASK_QUESTION: { points: 20, dailyLimit: 5 },
  AMA_QUESTION_ANSWERED: { points: 75, dailyLimit: 2 },
  STREAK_7: { points: 100, dailyLimit: 1 },
  STREAK_30: { points: 500, dailyLimit: 1 },
  STREAK_100: { points: 2000, dailyLimit: 1 },
  STREAK_365: { points: 10000, dailyLimit: 1 },
  RECEIVE_10_LIKES: { points: 25, dailyLimit: 10 },
  RECEIVE_50_LIKES: { points: 60, dailyLimit: 5 },
  RECEIVE_25_COMMENTS: { points: 50, dailyLimit: 5 },
  DEBATE_TOP_DISCUSSION: { points: 120, dailyLimit: 1 },
  PREDICTION_ACCURATE: { points: 40, dailyLimit: 10 },
  TRIVIA_WINNER: { points: 90, dailyLimit: 3 },
  BATTLE_WINNER: { points: 125, dailyLimit: 3 },
  POST_TRENDING: { points: 180, dailyLimit: 1 },
  EDITORS_PICK: { points: 300, dailyLimit: 1 },
  POST_VIRAL: { points: 500, dailyLimit: 1 }
};

// ─── DYNAMIC SPREADSHEET CONFIGURATION CACHE ───────────────────────────────
interface MultipliersConfig {
  streakCurve: { minDay: number; multiplier: number }[];
  matchDay: number;
  powerFanCombo: number;
  viralCascade: { minShares: number; bonus: number }[];
  streakSettings: { minSessionSeconds: number };
}

interface GlobalLevel {
  id: string;
  minXP: number;
  maxXP: number;
}

interface FeatureThreshold {
  id: string;
  thresholds: number[];
  label?: string;
}

let cachedMultipliers: MultipliersConfig | null = null;
let cachedGlobalLevels: GlobalLevel[] | null = null;
let cachedFeatureThresholds: Map<string, FeatureThreshold> | null = null;
let configCachedAt = 0;
const CONFIG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes config cache

async function loadConfigTables() {
  const now = Date.now();
  if (cachedMultipliers && cachedGlobalLevels && cachedFeatureThresholds && (now - configCachedAt) < CONFIG_CACHE_TTL) {
    return {
      multipliers: cachedMultipliers,
      globalLevels: cachedGlobalLevels,
      featureThresholds: cachedFeatureThresholds
    };
  }

  try {
    const [multSnap, levelsSnap, threshSnap] = await Promise.all([
      db.collection("multipliers").get(),
      db.collection("globalLevels").get(),
      db.collection("featureThresholds").get()
    ]);

    const mults: Record<string, any> = {};
    multSnap.docs.forEach(doc => {
      mults[doc.id] = doc.data();
    });

    const streakCurve = mults.streakCurve?.curve || [
      { minDay: 1, multiplier: 1.0 },
      { minDay: 3, multiplier: 1.1 },
      { minDay: 7, multiplier: 1.25 },
      { minDay: 14, multiplier: 1.5 },
      { minDay: 30, multiplier: 1.75 },
      { minDay: 60, multiplier: 2.0 }
    ];
    const matchDayVal = mults.matchDay?.value ?? 1.2;
    const comboVal = mults.powerFanCombo?.value ?? 25;
    const viralCurve = mults.viralCascade?.curve || [
      { minShares: 0, bonus: 0 },
      { minShares: 50, bonus: 50 },
      { minShares: 200, bonus: 150 },
      { minShares: 1000, bonus: 500 }
    ];
    const streakSettings = mults.streakSettings || { minSessionSeconds: 60 };

    cachedMultipliers = {
      streakCurve,
      matchDay: matchDayVal,
      powerFanCombo: comboVal,
      viralCascade: viralCurve,
      streakSettings
    };

    cachedGlobalLevels = levelsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        minXP: d.minXP ?? 0,
        maxXP: d.maxXP ?? 0
      };
    });
    if (cachedGlobalLevels.length === 0) {
      cachedGlobalLevels = [
        { id: "Spark", minXP: 0, maxXP: 999 },
        { id: "Chant", minXP: 1000, maxXP: 3999 },
        { id: "Roar", minXP: 4000, maxXP: 11999 },
        { id: "Storm", minXP: 12000, maxXP: 29999 },
        { id: "Legend", minXP: 30000, maxXP: 74999 },
        { id: "Icon", minXP: 75000, maxXP: 149999 },
        { id: "GOAT", minXP: 150000, maxXP: 999999999 }
      ];
    }
    cachedGlobalLevels.sort((a, b) => a.minXP - b.minXP);

    const thresholdsMap = new Map<string, FeatureThreshold>();
    threshSnap.docs.forEach(doc => {
      const d = doc.data();
      thresholdsMap.set(doc.id, {
        id: doc.id,
        thresholds: d.thresholds || []
      });
    });
    cachedFeatureThresholds = thresholdsMap;
    configCachedAt = now;

  } catch (error) {
    console.error("[PointsEngine] Failed to load Firestore config collections, using defaults:", error);
    cachedMultipliers = {
      streakCurve: [
        { minDay: 1, multiplier: 1.0 },
        { minDay: 3, multiplier: 1.1 },
        { minDay: 7, multiplier: 1.25 },
        { minDay: 14, multiplier: 1.5 },
        { minDay: 30, multiplier: 1.75 },
        { minDay: 60, multiplier: 2.0 }
      ],
      matchDay: 1.2,
      powerFanCombo: 25,
      viralCascade: [
        { minShares: 0, bonus: 0 },
        { minShares: 50, bonus: 50 },
        { minShares: 200, bonus: 150 },
        { minShares: 1000, bonus: 500 }
      ],
      streakSettings: { minSessionSeconds: 60 }
    };
    cachedGlobalLevels = [
      { id: "Spark", minXP: 0, maxXP: 999 },
      { id: "Chant", minXP: 1000, maxXP: 3999 },
      { id: "Roar", minXP: 4000, maxXP: 11999 },
      { id: "Storm", minXP: 12000, maxXP: 29999 },
      { id: "Legend", minXP: 30000, maxXP: 74999 },
      { id: "Icon", minXP: 75000, maxXP: 149999 },
      { id: "GOAT", minXP: 150000, maxXP: 999999999 }
    ];
    cachedFeatureThresholds = new Map();
  }

  return {
    multipliers: cachedMultipliers,
    globalLevels: cachedGlobalLevels,
    featureThresholds: cachedFeatureThresholds
  };
}

// ─── HELPER FUNCTIONS FOR CALCULATIONS ──────────────────────────────────────
function getDayString(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toISOString().split("T")[0];
}

function matchStreakMultiplier(day: number, curve: { minDay: number; multiplier: number }[]): number {
  let matched = 1.0;
  for (const c of curve) {
    if (day >= c.minDay) {
      matched = c.multiplier;
    }
  }
  return matched;
}

function calculateGlobalRank(totalXP: number, tiers: GlobalLevel[]): { globalTier: string; subRank: string } {
  const tier = tiers.find(t => totalXP >= t.minXP && totalXP <= t.maxXP) || tiers[0];
  if (tier.id === "GOAT") {
    return { globalTier: "GOAT", subRank: "—" };
  }

  const rangeSize = (tier.maxXP - tier.minXP + 1) / 3;
  const progress = totalXP - tier.minXP;
  const subIndex = Math.min(Math.floor(progress / rangeSize) + 1, 3);

  const subRank = subIndex === 1 ? "I" : subIndex === 2 ? "II" : "III";
  return { globalTier: tier.id, subRank };
}

function calculateFeatureLevel(feature: string, count: number, threshMap: Map<string, FeatureThreshold>): string {
  const fThresh = threshMap.get(feature);
  if (!fThresh || !fThresh.thresholds || fThresh.thresholds.length < 5) {
    const defaults: Record<string, number[]> = {
      predictions: [5, 25, 75, 150, 300],
      trivia: [5, 25, 75, 150, 300],
      community: [10, 50, 150, 400, 1000],
      shares: [5, 20, 60, 150, 300],
      comments: [10, 40, 120, 300, 600],
      drops: [5, 20, 60, 150, 300]
    };
    const thresholds = defaults[feature] || [1, 10, 30, 75, 150];
    if (count >= thresholds[4]) return "L5";
    if (count >= thresholds[3]) return "L4";
    if (count >= thresholds[2]) return "L3";
    if (count >= thresholds[1]) return "L2";
    if (count >= thresholds[0]) return "L1";
    return "—";
  }

  const t = fThresh.thresholds;
  if (count >= t[4]) return "L5";
  if (count >= t[3]) return "L4";
  if (count >= t[2]) return "L3";
  if (count >= t[1]) return "L2";
  if (count >= t[0]) return "L1";
  return "—";
}

function getFeatureCategory(reason: string): string {
  const map: Record<string, string> = {
    CREATE_POST: "post",
    CREATE_DEBATE: "debate",
    CREATE_PREDICTION: "predictions",
    CREATE_TRIVIA: "trivia",
    CREATE_BATTLE: "battles",
    LIKE: "community",
    SHARE: "shares",
    COMMENT: "comments",
    UPLOAD_IMAGE: "media",
    UPLOAD_VIDEO: "media",
    WATCH_ALONG_JOIN: "watch_along",
    FANTASY_CREATE_TEAM: "fantasy",
    ARTICLE_READ: "news",
    INVITE_SIGNUP: "invites",
    STORE_PURCHASE: "store",
    AUCTION_BID: "auctions",
    AMA_JOIN: "ama",
    BOOK_PLAYER_SESSION: "player_sessions",
    LISTEN_AUDIO_DROP: "drops",
    WATCH_VIDEO_DROP: "drops",
    ROAR_DEBATE_PARTICIPATE: "debate_participate",
    ROAR_PREDICTION_PARTICIPATE: "prediction_participate",
    ROAR_TRIVIA_CORRECT: "trivia",
    ROAR_BATTLE_PARTICIPATE: "battles",
    ROAR_POST: "post",
    ROAR_HOT_TAKE: "post",
    ROAR_DEBATE: "debate",
    ROAR_PREDICTION: "predictions",
    ROAR_RAW_REACTIONS: "post",
    ROAR_QUIZ: "trivia",
  };
  return map[reason] || "";
}

// ─── awardUserPoints ──────────────────────────────────────────────────────────
export async function awardUserPoints({
  actualUserId,
  authUserId,
  userName,
  userEmail,
  userExists,
  points: argPoints,
  reason,
  transactionId,
  metadata,
}: {
  actualUserId: string;
  authUserId?: string;
  userName: string;
  userEmail: string;
  userExists: boolean;
  points: number;
  reason: string;
  transactionId: string;
  metadata?: Record<string, any>;
}): Promise<boolean> {
  const leaderboardUserId = authUserId ?? actualUserId;

  const transactionRef = db.collection("pointTransactions").doc(transactionId);
  const userRef = db.collection("users").doc(actualUserId);
  const globalRef = db.collection("globalLeaderboard").doc(leaderboardUserId);

  try {
    // 0. Load spreadsheet config tables dynamically (with TTL cache)
    const config = await loadConfigTables();

    const success = await db.runTransaction(async (transaction) => {
      // 1. Idempotency Check (PRE-CHECK: Review input #3)
      const txSnap = await transaction.get(transactionRef);
      if (txSnap.exists) {
        console.log(`[PointsEngine] Pre-check: Activity transaction ${transactionId} already exists. Skipping.`);
        return false;
      }

      // 2. Fetch User Profile Data
      let userDoc: Record<string, any> = {};
      if (userExists) {
        const uSnap = await transaction.get(userRef);
        if (uSnap.exists) {
          userDoc = uSnap.data() || {};
        }
      }

      // 3. Dynamic points weight configuration lookup
      const ruleRef = db.collection("pointRules").doc(reason);
      const ruleSnap = await transaction.get(ruleRef);

      const fallback = DEFAULT_RULES_FALLBACKS[reason] || { points: argPoints, dailyLimit: 9999 };
      let basePoints = fallback.points;
      let dailyLimit = fallback.dailyLimit;
      let isRuleActive = true;

      if (ruleSnap.exists) {
        const rData = ruleSnap.data()!;
        basePoints = rData.points ?? basePoints;
        dailyLimit = rData.dailyLimit ?? dailyLimit;
        if (rData.status === "inactive" || rData.status === "suspended") {
          isRuleActive = false;
        }
      }

      if (!isRuleActive) {
        console.warn(`[PointsEngine] Action ${reason} is currently suspended/inactive. 0 points awarded.`);
        return false;
      }

      const now = Date.now();
      const todayStr = getDayString(now);

      // Handle daily limits reset
      const lastActiveTimestamp = userDoc.lastActiveTimestamp ?? 0;
      const lastActiveDate = getDayString(lastActiveTimestamp);
      const isNewDay = todayStr !== lastActiveDate;

      // Initialize defaults
      let totalXP = userDoc.totalXP ?? 0;
      let dailyPointsEarned = isNewDay ? 0 : (userDoc.dailyPointsEarned ?? 0);
      let dailyLikeCount = isNewDay ? 0 : (userDoc.dailyLikeCount ?? 0);
      let dailyActionsList = isNewDay ? [] : (userDoc.dailyActionsList ?? []);
      let streakFreezeCount = userDoc.streakFreezeCount ?? 0;
      let currentLoginStreak = userDoc.currentLoginStreak ?? 0;
      let loginStreakMultiplier = userDoc.loginStreakMultiplier ?? 1.0;
      let currentCreatorStreak = userDoc.currentCreatorStreak ?? 0;
      let lastCreatorActionTimestamp = userDoc.lastCreatorActionTimestamp ?? 0;
      let unlockedMilestones = userDoc.unlockedMilestones ?? [];
      let featureStats = userDoc.featureStats ?? {};
      let featureLevels = userDoc.featureLevels ?? {};

      let welcomeBackXP = 0;

      // 4. Welcome Back Grace Bonus & Streak Freeze Grant (§8)
      if (reason === "DAILY_LOGIN" && lastActiveTimestamp > 0) {
        const daysDifference = (now - lastActiveTimestamp) / (24 * 60 * 60 * 1000);
        if (daysDifference >= 14) {
          welcomeBackXP = 50;
          streakFreezeCount += 1;
          console.log(`[PointsEngine] Welcome Back grace triggered. +50 XP and 1 Streak Freeze granted.`);
        }
      }

      // 5. Duolingo Consecutive Streaks Logic & Active Login Session Duration Check (Spec review #4)
      if (reason === "DAILY_LOGIN") {
        const minSessionSeconds = config.multipliers.streakSettings?.minSessionSeconds ?? 60;
        const sessionSeconds = metadata?.sessionDurationSeconds ?? 0;

        if (sessionSeconds < minSessionSeconds) {
          console.log(`[PointsEngine] Login session duration (${sessionSeconds}s) is below required minimum (${minSessionSeconds}s). Streak/Login points skipped.`);
          return false; // Skip awarding points and updating streak if not active long enough
        }

        if (lastActiveTimestamp > 0) {
          const yesterdayStr = getDayString(now - 24 * 60 * 60 * 1000);

          if (lastActiveDate === todayStr) {
            // Already logged in today, streak unchanged
          } else if (lastActiveDate === yesterdayStr) {
            currentLoginStreak += 1;
          } else {
            if (streakFreezeCount > 0) {
              streakFreezeCount -= 1;
              console.log(`[PointsEngine] Streak Freeze consumed. Saved login streak of ${currentLoginStreak}.`);
            } else {
              currentLoginStreak = 1;
            }
          }
        } else {
          currentLoginStreak = 1;
        }

        loginStreakMultiplier = matchStreakMultiplier(currentLoginStreak, config.multipliers.streakCurve);
      }

      // Creator Streaks Logic
      if (reason === "CREATOR_STREAK_BONUS" || reason.startsWith("CREATE_")) {
        const yesterdayStr = getDayString(now - 24 * 60 * 60 * 1000);
        const lastCreatorDate = getDayString(lastCreatorActionTimestamp);

        if (lastCreatorDate === yesterdayStr) {
          currentCreatorStreak += 1;
        } else if (lastCreatorDate !== todayStr) {
          currentCreatorStreak = 1;
        }
        lastCreatorActionTimestamp = now;
      }

      // 6. Anti-Spam Caps & Daily Limits Enforcements (§9)
      if (reason === "LIKE") {
        if (dailyLikeCount >= 15) {
          console.log(`[PointsEngine] Like daily cap (15) reached. Action skipped.`);
          return false;
        }
        dailyLikeCount += 1;
      }

      // 7. Apply Point Multipliers & Match-Day boosts (§5)
      let pointsAwarded = basePoints;

      // Apply Duolingo multiplier to streak-eligible categories
      const isStreakEligible = reason === "DAILY_LOGIN" || reason === "CREATOR_STREAK_BONUS";
      let activeMultiplier = 1.0;
      if (isStreakEligible) {
        activeMultiplier = loginStreakMultiplier;
        pointsAwarded = Math.round(pointsAwarded * activeMultiplier);
      }

      // Apply Match-Day flat boost
      const isMatchDay = metadata?.isMatchDay === true || metadata?.isMatchRoom === true;
      if (isMatchDay) {
        pointsAwarded = Math.round(pointsAwarded * config.multipliers.matchDay);
      }

      // Apply Squad Boost (+10% points) (§8)
      const isSquadBoost = metadata?.squadBoostActive === true;
      if (isSquadBoost) {
        pointsAwarded = Math.round(pointsAwarded * 1.1);
      }

      // Apply Viral Cascade Escalation Bonus (§5)
      let viralCascadeXP = 0;
      if (reason === "SHARE" || reason === "ARTICLE_SHARE" || reason === "SHARE_DROP") {
        const shareCount = metadata?.shareCount ?? 0;
        let matchedCascade = 0;
        for (const c of config.multipliers.viralCascade) {
          if (shareCount >= c.minShares) {
            matchedCascade = c.bonus;
          }
        }
        viralCascadeXP = matchedCascade;
      }

      // Enforce 300 XP Daily Limit on participation categories
      const isCreatorPoint = reason.startsWith("CREATE_") || reason === "CREATOR_STREAK_BONUS" || reason === "WIN_FEATURED_POST";
      if (!isCreatorPoint) {
        if (dailyPointsEarned >= 300) {
          console.log(`[PointsEngine] Daily engagement XP cap (300) reached. Action skipped.`);
          return false;
        }
        const remaining = 300 - dailyPointsEarned;
        if (pointsAwarded > remaining) {
          pointsAwarded = remaining;
        }
        dailyPointsEarned += pointsAwarded;
      }

      // 8. Power Fan Combo Check (§5)
      let comboBonusXP = 0;
      if (!dailyActionsList.includes(reason)) {
        dailyActionsList.push(reason);
        if (dailyActionsList.length === 3 && !userDoc.dailyComboAwarded) {
          comboBonusXP = config.multipliers.powerFanCombo;
        }
      }

      // 9. Streak Milestones Bonuses (§4)
      let milestoneBonusXP = 0;
      let milestoneToUnlock = "";
      if (reason === "DAILY_LOGIN") {
        if (currentLoginStreak >= 365 && !unlockedMilestones.includes("STREAK_365")) {
          milestoneBonusXP = 10000;
          milestoneToUnlock = "STREAK_365";
        } else if (currentLoginStreak >= 100 && !unlockedMilestones.includes("STREAK_100")) {
          milestoneBonusXP = 2000;
          milestoneToUnlock = "STREAK_100";
        } else if (currentLoginStreak >= 30 && !unlockedMilestones.includes("STREAK_30")) {
          milestoneBonusXP = 500;
          milestoneToUnlock = "STREAK_30";
        } else if (currentLoginStreak >= 7 && !unlockedMilestones.includes("STREAK_7")) {
          milestoneBonusXP = 100;
          milestoneToUnlock = "STREAK_7";
        }
        if (milestoneToUnlock) {
          unlockedMilestones.push(milestoneToUnlock);
        }
      }

      // Total XP gained from this transaction
      const finalTotalXPGained = pointsAwarded + comboBonusXP + milestoneBonusXP + welcomeBackXP + viralCascadeXP;
      totalXP += finalTotalXPGained;

      // 10. Auto-calculate Global Ranks & Sub-Ranks (§1)
      const rankState = calculateGlobalRank(totalXP, config.globalLevels);

      // 11. Auto-calculate Feature Mastery badge levels (§2)
      const fCat = getFeatureCategory(reason);
      if (fCat) {
        const currentCount = (featureStats[fCat] ?? 0) + 1;
        featureStats[fCat] = currentCount;
        featureLevels[fCat] = calculateFeatureLevel(fCat, currentCount, config.featureThresholds);
      }

      // Completionist Badge check: L5 reached in 3+ feature ladders
      let l5Count = 0;
      Object.keys(featureLevels).forEach((k) => {
        if (featureLevels[k] === "L5") l5Count += 1;
      });
      const isCompletionist = l5Count >= 3;

      // 12. Write immutable transaction audit entry
      transaction.set(transactionRef, {
        userId: leaderboardUserId,
        userEmail,
        userName,
        points: finalTotalXPGained,
        basePoints,
        reason,
        appliedMultiplier: isStreakEligible ? activeMultiplier : 1.0,
        isMatchDay,
        entityId: metadata?.entityId ?? "",
        watchAlongRoomId: metadata?.watchAlongRoomId ?? null,
        roarRoomId: metadata?.roarRoomId ?? null,
        createdAt: now,
      });
      //12.b
      const activityLogRef = userRef.collection("activityLog").doc(transactionId);
      transaction.set(activityLogRef, {
        type: reason,
        // label: metadata?.label ?? reason,
         label: metadata?.statement ?? metadata?.label ?? reason,
        points: finalTotalXPGained,
        metadata: metadata ?? {},
        roomId: metadata?.roomId ?? null,
        matchId: metadata?.matchId ?? null,
        createdAt: now,
      });

      // 13. Update master users document (Atomic sync for three-way consistency)
      const updatePayload: Record<string, any> = {
        totalXP,
        totalPoints: totalXP,
        reputationScore: totalXP,
        globalTier: rankState.globalTier,
        subRank: rankState.subRank,
        lastActiveTimestamp: now,
        dailyPointsEarned,
        dailyLikeCount,
        dailyActionsList,
        currentLoginStreak,
        loginStreakMultiplier,
        currentCreatorStreak,
        lastCreatorActionTimestamp,
        streakFreezeCount,
        unlockedMilestones,
        featureStats,
        featureLevels,
        isCompletionist,
        lastUpdated: now
      };

      if (comboBonusXP > 0) {
        updatePayload.dailyComboAwarded = true;
      }
      if (isNewDay) {
        updatePayload.dailyComboAwarded = false;
      }

      // 14. Payout referrer 100 XP if referred friend reaches L2 Chant (§3c & §8)
      const referredBy = userDoc.referredBy;
      if (referredBy && rankState.globalTier === "Chant" && !unlockedMilestones.includes("CLAIMED_CHANT_PAYOUT")) {
        unlockedMilestones.push("CLAIMED_CHANT_PAYOUT");
        updatePayload.unlockedMilestones = unlockedMilestones;

        const payoutTxId = `ref_chant_payout_${transactionId}`;
        db.collection("users").doc(referredBy).get().then(refSnap => {
          if (refSnap.exists) {
            const refData = refSnap.data()!;
            awardUserPoints({
              actualUserId: referredBy,
              authUserId: referredBy,
              userName: refData.firstName ? [refData.firstName, refData.lastName].filter(Boolean).join(" ") : refData.name || "Referrer",
              userEmail: refData.email || "",
              userExists: true,
              points: 100,
              reason: "INVITE_CHANT",
              transactionId: payoutTxId,
              metadata: { referredFriendUid: actualUserId }
            });
          }
        }).catch(err => console.error("[PointsEngine] Referral Chant payout failed:", err));
      }

      transaction.update(userRef, updatePayload);

      // 15. Update single consolidated globalLeaderboard document
      transaction.set(globalRef, {
        userId: leaderboardUserId,
        userName,
        userEmail,
        totalPoints: totalXP,
        lastUpdated: now
      }, { merge: true });

      // 16. Check Referred friend commissions (5% ongoing) (§3c & §8)
      if (referredBy && finalTotalXPGained > 0) {
        const referredCreatedAt = userDoc.createdAt ?? 0;
        const daysActive = (now - referredCreatedAt) / (24 * 60 * 60 * 1000);

        if (daysActive <= 30) {
          const referrerCommissionXP = Math.round(finalTotalXPGained * 0.05);
          if (referrerCommissionXP > 0) {
            const commissionTxId = `ref_commission_${transactionId}`;
            db.collection("users").doc(referredBy).get().then(refSnap => {
              if (refSnap.exists) {
                const refData = refSnap.data()!;
                awardUserPoints({
                  actualUserId: referredBy,
                  authUserId: referredBy,
                  userName: refData.firstName ? [refData.firstName, refData.lastName].filter(Boolean).join(" ") : refData.name || "Referrer",
                  userEmail: refData.email || "",
                  userExists: true,
                  points: referrerCommissionXP,
                  reason: "REFERRAL_COMMISSION",
                  transactionId: commissionTxId,
                  metadata: { referredFriendUid: actualUserId }
                });
              }
            }).catch(err => console.error("[PointsEngine] Referral commission payout failed:", err));
          }
        }
      }

      return true;
    });

    return success;
  } catch (error) {
    console.error("[PointsEngine] Transaction failed gracefully:", error);
    return false;
  }
}