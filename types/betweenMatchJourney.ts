// types/betweenMatchJourney.ts — Pure AWS DynamoDB schemas for Between-Match Fan Journey Microservices

export type JourneyStage =
  | "DAY_0"
  | "DAY_1"
  | "DAY_2"
  | "DAY_3"
  | "DAY_4"
  | "DAY_5"
  | "MATCH_LIVE"
  | "POST_MATCH";

export const JOURNEY_STAGE_ORDER: JourneyStage[] = [
  "DAY_0",
  "DAY_1",
  "DAY_2",
  "DAY_3",
  "DAY_4",
  "DAY_5",
  "MATCH_LIVE",
  "POST_MATCH",
];

export type FanArchetype =
  | "ANALYTICAL"
  | "SOCIAL"
  | "TACTICAL"
  | "CREATOR"
  | "COMMUNITY"
  | "DEVOTED";

// ─── 1. Series Journey State (TABLES.SportsData) ───────────────────────────────
// PK: entityId = "SERIES#<seriesId>" | SK: sk = "JOURNEY#STATE"
// GSI1: GSI1PK = "SERIES_JOURNEY#ALL" | GSI1SK = "<updatedAt>#<seriesId>"
export interface SeriesJourneyState {
  entityId?: string;
  sk?: string;
  GSI1PK?: string;
  GSI1SK?: string;
  seriesId: string;
  seriesName: string;
  currentStage: JourneyStage;
  currentMatchId: string;
  nextMatchId: string;
  matchIds?: string[];
  match1CompletedAt: number;
  match2ScheduledAt: number;
  venue: {
    stadium: string;
    city: string;
  };
  rivalryTally: {
    teamAId: string;
    teamAFans: number;
    teamBId: string;
    teamBFans: number;
  };
  autoAdvanceEnabled: boolean;
  createdAt?: number;
  updatedAt: number;
}

// ─── 2. Personalized Match Recap (TABLES.GamificationAndWallet) ────────────────
// PK: userId = "USER#<userId>" | SK: sk = "RECAP#<matchId>"
export interface UserMatchRecap {
  sk?: string;
  userId: string;
  matchId: string;
  seriesId: string;
  fanArchetype: FanArchetype;
  stats: {
    totalInteractions: number;
    predictionsCorrect: number;
    predictionsTotal: number;
    sxpEarned: number;
    participations?: number;
    impressions?: number;
    actionLikes?: number;
    actionComments?: number;
    actionShares?: number;
    socialLikes?: number;
    socialComments?: number;
    socialImpressions?: number;
  };
  topMomentReacted: {
    momentId: string;
    title: string;
    reactionsCount: number;
    mediaUrl: string;
  };
  seriesProgress: {
    cumulativeInteractions: number;
    cumulativePredictionsCorrect: number;
    cumulativePredictionsTotal: number;
    totalSeriesSxp: number;
    leaderboardPercentile: number;
  };
  generatedAt: number;
}

// ─── 7. User Match Intent Checklist (TABLES.GamificationAndWallet) ─────────────
// PK: userId = "USER#<userId>" | SK: sk = "INTENT#<matchId>"
// Aggregates PK: userId = "MATCH#<matchId>" | SK: sk = "INTENT#AGGREGATE"
export interface UserMatchWatchingIntent {
  sk?: string;
  userId: string;
  matchId: string;
  selectedMoments: string[];
  availableOptions: string[];
  updatedAt: number;
}

export interface MatchIntentAggregates {
  matchId: string;
  totalRespondents: number;
  optionCounts: Record<string, number>;
  trackingPercentages: Record<string, number>;
  updatedAt: number;
}

// ─── 8. User Series Progress & Leaderboard Snapshot (TABLES.GamificationAndWallet) ──
// PK: userId = "USER#<userId>" | SK: sk = "SERIES_PROGRESS#<seriesId>"
// GSI (leaderboardType-points-index): leaderboardType = "SERIES_PROGRESS#<seriesId>" | points = totalSeriesSxp
export type LeaderboardBadgeTier = "GOLD" | "SILVER" | "BRONZE";

export interface UserSeriesProgress {
  sk?: string;
  userId: string;
  seriesId: string;
  userName: string;
  userAvatar: string;
  fanArchetype: FanArchetype;
  favoritePlayers: string[];
  favoriteClub: string;
  stats: {
    cumulativeInteractions: number;
    cumulativePredictionsCorrect: number;
    cumulativePredictionsTotal: number;
    accuracyPercent: number;
    totalSeriesSxp: number;
  };
  leaderboard: {
    rank: number;
    totalParticipants: number;
    percentile: number;
    badgeTier: LeaderboardBadgeTier;
  };
  leaderboardType?: string;
  points?: number;
  updatedAt: number;
}

export interface SeriesLeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar: string;
  fanArchetype: FanArchetype;
  totalSeriesSxp: number;
  cumulativeInteractions: number;
  accuracyPercent: number;
  badgeTier: LeaderboardBadgeTier;
  updatedAt: number;
}

// ─── 9. Community Awards (TABLES.GamificationAndWallet) ────────────────────────
// PK: userId = "SERIES#<seriesId>" | SK: sk = "AWARD#<matchId>#<awardType>"
export type CommunityAwardType = "fan_of_the_match" | "prediction_oracle" | "top_analyst";

export interface CommunityAward {
  sk?: string;
  awardId: string;
  seriesId: string;
  matchId: string;
  engagementId?: string;
  awardType: CommunityAwardType;
  awardTitle: string;
  winner: {
    userId: string;
    userName: string;
    userAvatar: string;
    citation: string;
    statsHighlight: string;
  };
  badgeAwardedUrl: string;
  sxpBonusAwarded: number;
  sxpCredited?: boolean;
  awardedAt: number;
}

