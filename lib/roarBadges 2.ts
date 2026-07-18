// lib/roarBadges.ts
//
// Pure, dependency-free badge/rank evaluation for the ROAR Reputation & Rewards
// system. No Firestore reads/writes in here — feed it plain numbers, get back
// plain badge state. This is deliberate: it keeps badge level "derived", not
// "stored", so it can never drift out of sync with the activity that earned it.
//
// Source: SportsFan360 ROAR Reputation & Rewards System doc, sections 1, 2, 12.

// 
// 1. GLOBAL REPUTATION (§1)

export const GLOBAL_TIER_ICONS: Record<string, string> = {
  Spark:  "/images/badges/globalspark.png",
  Chant:  "/images/badges/globalchant.png",
  Roar:   "/images/badges/globalroar.png",
  Storm:  "/images/badges/globalstorm.png",
  Legend: "/images/badges/globallegend.png",
  Icon:   "/images/badges/globalicon.png",
  GOAT:   "/images/badges/globalgoat.png",
};

export interface GlobalTier {
  tier: string;       // "Spark" | "Chant" | ... | "GOAT"
  tierLevel: number;  // 1..7
  subRank: number;    // 1..3, or 0 for GOAT (no sub-ranks)
  label: string;      // "Storm II"
  min: number;
  max: number;     
icon: string;    // Infinity for GOAT
}

// [tierName, tierLevel, minXP, maxXP-exclusive-or-Infinity]
const GLOBAL_TIERS: [string, number, number, number][] = [
  ["Spark", 1, 0, 1000],
  ["Chant", 2, 1000, 4000],
  ["Roar", 3, 4000, 12000],
  ["Storm", 4, 12000, 30000],
  ["Legend", 5, 30000, 75000],
  ["Icon", 6, 75000, 150000],
  ["GOAT", 7, 150000, Infinity],
];

export function getGlobalTier(xp: number): GlobalTier {
  const safeXp = Math.max(0, xp || 0);
  const found = GLOBAL_TIERS.find(([, , min, max]) => safeXp >= min && safeXp < max)
    ?? GLOBAL_TIERS[GLOBAL_TIERS.length - 1];
  const [tier, tierLevel, min, max] = found;
  const icon = GLOBAL_TIER_ICONS[tier];

  if (tier === "GOAT") {
    return { tier, tierLevel, subRank: 0, label: "GOAT", min, max, icon };
  }

  const span = max - min;
  const third = span / 3;
  const into = safeXp - min;
  const subRank = Math.min(3, Math.floor(into / third) + 1);

  return {
    tier, tierLevel, subRank,
    label: `${tier} ${["I", "II", "III"][subRank - 1]}`,
    min, max, icon,
  };
}


// Progress (0-100) toward the *next* sub-rank (or next tier if at III / GOAT boundary).
export function getGlobalTierProgress(xp: number): number {
  const safeXp = Math.max(0, xp || 0);
  const t = getGlobalTier(safeXp);
  if (t.tier === "GOAT") return 100;
  const span = t.max - t.min;
  const third = span / 3;
  const subFloor = t.min + (t.subRank - 1) * third;
  const pct = ((safeXp - subFloor) / third) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// ─────────────────────────────────────────────────────────────────────────
// 2. FEATURE MASTERY LADDERS (§2, §12)
// ─────────────────────────────────────────────────────────────────────────

export type FeatureKey =
  | "post" | "debate" | "prediction" | "trivia" | "fanBattle"
  | "community" | "shares" | "comments" | "media";

export const FEATURE_LABELS: Record<FeatureKey, string[]> = {
  post:        ["Rookie Writer", "Story Teller", "Headliner", "Trend Maker", "News Breaker"],
  debate:      ["Challenger", "Debater", "Analyst", "Strategist", "Debate Master"],
  prediction:  ["Predictor", "Forecaster", "Oracle", "Visionary", "Prediction Legend"],
  trivia:      ["Rookie Quizzer", "Brainiac", "Sports Scholar", "Quiz Master", "Hall of Fame"],
  fanBattle:   ["Contender", "Fighter", "Champion", "Gladiator", "Arena Legend"],
  community:   ["Appreciated", "Popular", "Fan Favorite", "Crowd Hero", "Community Icon"],
  shares:      ["Messenger", "Amplifier", "Influencer", "Viral Voice", "Global Fan"],
  comments:    ["Participant", "Conversationalist", "Voice", "Community Leader", "People's Champion"],
  media:       ["Photographer", "Story Creator", "Highlight Artist", "Content Pro", "Media Legend"],
};

// One icon per LEVEL (L1..L5) within each feature ladder. These are paths
// under /public — Next.js serves anything in /public at the site root, so
// a file at public/images/badges/post-l1.png is referenced here as
// "/images/badges/post-l1.png" (no "public" in the path).
//
// Rename these to match whatever you actually dropped in /public — the
// exact filenames below are placeholders showing the expected pattern:
// {feature}-l{level}.png
export const FEATURE_ICONS: Record<FeatureKey, [string, string, string, string, string]> = {
  post:       ["/images/badges/postl1.png", "/images/badges/postl2.png", "/images/badges/postl3.png", "/images/badges/postl4.png", "/images/badges/postl5.png"],
  debate:     ["/images/badges/debatel1.png", "/images/badges/debatel2.png", "/images/badges/debatel3.png", "/images/badges/debatel4.png", "/images/badges/debatel5.png"],
  prediction: ["/images/badges/predictionl1.png", "/images/badges/predictionl2.png", "/images/badges/predictionl3.png", "/images/badges/predictionl4.png", "/images/badges/predictionl5.png"],
  trivia:     ["/images/badges/trivial1.png", "/images/badges/trivial2.png", "/images/badges/trivial3.png", "/images/badges/trivial4.png", "/images/badges/trivial5.png"],
  fanBattle:  ["/images/badges/fanBattlel1.png", "/images/badges/fanBattlel2.png", "/images/badges/fanBattlel3.png", "/images/badges/fanBattlel4.png", "/images/badges/fanBattlel5.png"],
  community:  ["/images/badges/communityl1.png", "/images/badges/communityl2.png", "/images/badges/communityl3.png", "/images/badges/communityl4.png", "/images/badges/communityl5.png"],
  shares:     ["/images/badges/sharesl1.png", "/images/badges/sharesl2.png", "/images/badges/sharesl3.png", "/images/badges/sharesl4.png", "/images/badges/sharesl5.png"],
  comments:   ["/images/badges/commentsl1.png", "/images/badges/commentsl2.png", "/images/badges/commentsl3.png", "/images/badges/commentsl4.png", "/images/badges/commentsl5.png"],
  media:      ["/images/badges/medial1.png", "/images/badges/medial2.png", "/images/badges/medial3.png", "/images/badges/medial4.png", "/images/badges/medial5.png"],
};

// PLACEHOLDER THRESHOLDS — the doc names each level but doesn't give exact
// action-count cutoffs. These are scaled so L5 in the "grindiest" ladders
// (comments, shares) takes roughly the same real-world effort as L5 in the
// "heavier" ladders (posts, fan battles), based on the point values in §3.
// Tune freely; nothing else in the app depends on the specific numbers.
const FEATURE_THRESHOLDS: Record<FeatureKey, [number, number, number, number, number]> = {
  post:       [1, 5, 15, 40, 100],
  debate:     [1, 5, 15, 40, 100],
  prediction: [1, 10, 30, 75, 150],
  trivia:     [1, 10, 30, 75, 150],
  fanBattle:  [1, 5, 15, 35, 80],
  community:  [10, 50, 150, 400, 1000],   // likes/reactions received
  shares:     [5, 25, 75, 200, 500],
  comments:   [10, 50, 150, 400, 1000],
  media:      [3, 10, 30, 75, 150],
};

export interface FeatureBadgeState {
  feature: FeatureKey;
  icon: string;
  count: number;
  level: number;      // 0 = not yet unlocked L1
  label: string;       // current level's name, or next level's name if level 0
  nextThreshold: number | null;
  progress: number;    // 0-100 toward next level
}

export function getFeatureBadgeState(feature: FeatureKey, count: number): FeatureBadgeState {
  const safeCount = Math.max(0, count || 0);
  const thresholds = FEATURE_THRESHOLDS[feature];
  const labels = FEATURE_LABELS[feature];

  let level = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (safeCount >= thresholds[i]) { level = i + 1; break; }
  }

  const nextThreshold = level < 5 ? thresholds[level] : null;
  const prevThreshold = level > 0 ? thresholds[level - 1] : 0;
  const progress = nextThreshold
    ? Math.max(0, Math.min(100, Math.round(((safeCount - prevThreshold) / (nextThreshold - prevThreshold)) * 100)))
    : 100;

  // Locked (level 0) badges show the L1 icon dimmed/greyscaled in the UI
  // (handled by Profile.tsx's `filter: grayscale` on fb.level === 0), so we
  // still return the L1 icon as a preview of "what you're working toward" —
  // index by `level - 1`, clamped to 0 when not yet unlocked.
  const iconIndex = Math.max(0, level - 1);

  return {
    feature,
    icon: FEATURE_ICONS[feature][iconIndex],
    count: safeCount,
    level,
    label: level > 0 ? labels[level - 1] : labels[0],
    nextThreshold,
    progress,
  };
}

export function getAllFeatureBadges(counts: Partial<Record<FeatureKey, number>>): FeatureBadgeState[] {
  return (Object.keys(FEATURE_LABELS) as FeatureKey[]).map((f) =>
    getFeatureBadgeState(f, counts[f] ?? 0)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 3. SPECIAL / ACHIEVEMENT BADGES (§4, §5, §7, §12)
// ─────────────────────────────────────────────────────────────────────────

export interface SpecialBadgeState {
  id: string;
  name: string;
  unlocked: boolean;
  description: string;
}

export interface SpecialBadgeInputs {
  longestStreak?: number;          // days
  completionistCount?: number;     // number of features at L5 (derived below, but can be passed in)
  hasSeasonTop100?: boolean;
  hasSeasonTop3?: boolean;
  hasViralPost?: boolean;          // 1,000+ shares on a single post
}

export function getSpecialBadges(inputs: SpecialBadgeInputs, featureBadges: FeatureBadgeState[]): SpecialBadgeState[] {
  const l5Count = featureBadges.filter((f) => f.level === 5).length;
  const streak = inputs.longestStreak ?? 0;

  return [
    { id: "ON_FIRE", name: "On Fire", unlocked: streak >= 7, description: "Reach a 7-day streak." },
    { id: "FLAME_ICON", name: "Flame Icon", unlocked: streak >= 30, description: "Reach a 30-day streak." },
    { id: "EXCLUSIVE_FRAME", name: "Exclusive Frame", unlocked: streak >= 100, description: "Reach a 100-day streak." },
    { id: "UNSTOPPABLE", name: "Unstoppable", unlocked: streak >= 365, description: "Reach a 365-day streak." },
    { id: "VIRAL_VOICE_POST", name: "Viral Voice (Post)", unlocked: !!inputs.hasViralPost, description: "A post crosses 1,000+ shares." },
    { id: "COMPLETIONIST", name: "Completionist", unlocked: l5Count >= 3, description: "Hit L5 in 3+ different feature ladders." },
    { id: "SEASON_BADGE", name: "Season Badge", unlocked: !!inputs.hasSeasonTop100, description: "Finish Top 100 in any season." },
    { id: "HALL_OF_FAME_SEASON", name: "Hall of Fame (Season)", unlocked: !!inputs.hasSeasonTop3, description: "Finish Top 3 in any season." },
  ];
}