// types/engagements.ts — Type definitions for Fan Battles, Quizzes, Polls, Predictions, and Meme Arena
export type EngagementType = "fan_battle" | "quiz" | "poll" | "prediction" | "meme" | "question" | "debate" | "express";
export type EngagementStatus = "active" | "inactive" | "expired" | "settled" | "resolved" | "pending" | "open";

// ─── 1. Fan Battle ─────────────────────────────────────────────────────────
export interface Competitor {
  code: string; // e.g. "IN", "PK", "AUS"
  name: string; // e.g. "Virat Kohli", "Babar Azam"
  stat: string; // e.g. "Avg 58.6 in Tests"
  imageUrl?: string;
  votes: number;
}

export interface FanBattlePayload {
  leftCompetitor: Competitor;
  rightCompetitor: Competitor;
  totalVotes: number;
  startTime?: number;
  scheduledStartTime?: number;
}

// ─── 2. Quiz ───────────────────────────────────────────────────────────────
export interface QuizOption {
  id: string; // "A", "B", "C", "D"
  text: string; // e.g. "29"
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string; // "A", "B", "C", "D"
  pointsReward?: number; // e.g. 10
  explanation?: string; // e.g. "Correct: 29"
}

export interface QuizPayload {
  question?: string;
  options?: QuizOption[];
  correctOptionId?: string; // "B"
  pointsReward?: number; // e.g. 10
  explanation?: string; // e.g. "Correct: 29"
  startTime?: number;
  scheduledStartTime?: number;
  frequencyMinutes?: number; // e.g. 10 (unlocks a new question every 10 mins)
  questions?: QuizQuestion[];
  timerMinutes?: number;
  durationMinutes?: number;
  expiresAt?: number;
}

export interface QuizLeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  userEmail?: string;
  totalPoints: number;
  correctCount: number;
  incorrectCount: number;
  totalAnswered: number;
  accuracy?: string;
  lastAnsweredAt?: number;
}

// ─── 3. Poll ───────────────────────────────────────────────────────────────
export interface PollChoice {
  id: string;
  text: string; // e.g. "Jasprit Bumrah 🏏"
  votes: number;
}

export interface PollPayload {
  question: string;
  options: PollChoice[];
  totalVotes: number;
  answer?: string;
  correctAnswer?: string;
  durationMinutes?: number;
  timerMinutes?: number;
  expiresAt?: number;
  startTime?: number;
  scheduledStartTime?: number;
}

// ─── 4. Prediction ─────────────────────────────────────────────────────────
export interface PredictionChoice {
  id: string; // "left" | "right" | "1" | "2" etc.
  text: string; // e.g. "Yes, India win"
  code?: string; // e.g. "IN"
  votes: number;
}

export interface PredictionPayload {
  question: string;
  options?: PredictionChoice[];
  leftChoice?: PredictionChoice;
  rightChoice?: PredictionChoice;
  coinStake?: number; // default 10 SXP
  totalVotes: number;
  status?: "open" | "locked" | "settled";
  winningChoiceId?: string | null; // "left" | "right" once settled
  answer?: string;
  correctAnswer?: string;
  durationMinutes?: number;
  timerMinutes?: number;
  expiresAt?: number;
  startTime?: number;
  scheduledStartTime?: number;
}

// ─── 5. Meme Arena ─────────────────────────────────────────────────────────
export type MemeReactionType = "mild" | "funny" | "hot" | "fire" | "nuclear";
export type MemeRatingId = "mid" | "funny" | "hot" | "fire" | "nuclear";

export interface MemeRatingChoice {
  id: MemeRatingId;
  label: string;
  emoji: string;
  color: string;
  votes: number;
  percentage?: number;
}

export interface MemeReactions {
  mild: number;
  funny: number;
  hot: number;
  fire: number;
  nuclear: number;
}

export interface MemeOptionChoice {
  id: string; // "A" | "B"
  text?: string;
  label?: string;
  imageUrl?: string;
  votes: number;
  percentage?: number;
}

export interface MemePayload {
  memeMode?: "single" | "dual";
  memeType?: "single" | "dual" | string;
  isDual?: boolean;
  imageUrl?: string;
  imageUrlA?: string;
  imageUrlB?: string;
  labelA?: string;
  labelB?: string;
  votesA?: number;
  votesB?: number;
  memeA?: {
    imageUrl: string;
    title?: string;
    caption?: string;
    votes?: number;
  };
  memeB?: {
    imageUrl: string;
    title?: string;
    caption?: string;
    votes?: number;
  };
  options?: MemeOptionChoice[] | any[];
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  heatPercentage?: number;
  heatIndex?: number;
  totalVotes?: number;
  reactions?: MemeReactions;
  ratings?: {
    mid: number;
    funny: number;
    hot: number;
    fire: number;
    nuclear: number;
  };
  commentsCount?: number;
  sharesCount?: number;
  userReaction?: MemeReactionType | null;
  caption?: string;
  title?: string;
  description?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  createdAt?: number;
  startTime?: number;
  scheduledStartTime?: number;
  expiresAt?: number;
}

// ─── 6. Debate ─────────────────────────────────────────────────────────────
export interface DebateOption {
  id: string; // e.g. "1", "2"
  text: string; // e.g. "Fair Call", "Unfair Call"
  votes: number;
}

export interface DebatePayload {
  question?: string;
  topic?: string;
  options: DebateOption[];
  totalVotes: number;
  status?: "open" | "locked" | "settled";
  winningChoiceId?: string | null;
  verdict?: string;
  durationMinutes?: number;
  timerMinutes?: number;
  expiresAt?: number;
  startTime?: number;
  scheduledStartTime?: number;
}

// ─── 7. Express ────────────────────────────────────────────────────────────
export interface ExpressOption {
  id: string;
  text: string;
  emoji?: string;
  votes: number;
}

export interface ExpressPayload {
  question?: string;
  prompt?: string;
  options?: ExpressOption[];
  totalVotes: number;
  durationMinutes?: number;
  timerMinutes?: number;
  expiresAt?: number;
  startTime?: number;
  scheduledStartTime?: number;
}

// ─── 8. Question ───────────────────────────────────────────────────────────
export interface QuestionPayload {
  question: string;
  options?: Array<{ id: string; text: string; votes?: number }>;
  correctOptionId?: string;
  explanation?: string;
  pointsReward?: number;
  durationMinutes?: number;
  timerMinutes?: number;
  expiresAt?: number;
  startTime?: number;
  scheduledStartTime?: number;
}

// ─── Universal Engagement Entity ──────────────────────────────────────────
export interface EngagementItem {
  id: string;
  type: EngagementType;
  title: string; // Display title / banner
  subtitle?: string;
  tags?: string[]; // e.g. ["FAN BATTLE", "TRENDING"] or ["QUIZ", "50 PTS"]
  sport?: string; // "cricket" | "football" | "athletics" | "general"
  status: EngagementStatus;
  creatorId?: string;
  creatorEmail?: string;
  creatorName?: string;
  creatorAvatar?: string;

  // Specific data payloads
  fanBattleData?: FanBattlePayload;
  quizData?: QuizPayload;
  pollData?: PollPayload;
  predictionData?: PredictionPayload;
  memeData?: MemePayload;
  debateData?: DebatePayload;
  expressData?: ExpressPayload;
  questionData?: QuestionPayload;
  memeType?: "single" | "dual" | string;
  options?: any[];
  imageUrlA?: string;
  imageUrlB?: string;
  labelA?: string;
  labelB?: string;

  // Outcome resolution fields (for Prediction, Debate, Quiz)
  winningChoiceId?: string | null;
  outcomeWinningChoiceId?: string | null;
  outcomeNotes?: string | null;
  resolvedAt?: number | null;
  resolvedBy?: string | null;
  timerMinutes?: number;
  durationMinutes?: number;
  category?: string;
  source?: string;
  isMatchMoment?: boolean;

  // Match Moment Linkage fields
  matchId?: string; // e.g. "NZ-IND-2026-T20-4TH-T20I"
  momentId?: string; // e.g. "NZ-01", "NZ-06", "IND-09"
  loopId?: string; // alias for momentId
  matchPhase?: string; // e.g. "NZ 1st innings", "India chase"
  anchorTrigger?: string; // e.g. "NZ innings — over 6 end"
  scoreState?: string; // e.g. "65/1", "80/2"
  sportsMoment?: string; // e.g. "Powerplay checkpoint"
  overNumber?: string | number; // e.g. "6", "7.4"
  innings?: number; // 1 or 2

  // Social / Engagement counters
  likes: number;
  likeCount?: number;
  shares: number;
  totalEngaged: number;
  commentsCount?: number;

  // Hydrated user interaction fields
  userLiked?: boolean;
  userVoted?: boolean;
  userVote?: string | null;

  createdAt: number;
  updatedAt: number;
  expiresAt?: number | null;
  startTime?: number | null;
  scheduledStartTime?: number | null;
}

// ─── User Vote / Answer Record ─────────────────────────────────────────────
export interface UserEngagementRecord {
  userId: string;
  engagementId: string;
  type: EngagementType;
  selectedOptionId: string; // e.g. "left", "right", "A", "B", choice ID
  isCorrect?: boolean; // For Quiz
  pointsAwarded?: number;
  coinsStaked?: number;
  timestamp: number;
}

export interface EngagementComment {
  id: string;
  commentId: string;
  engagementId: string;
  parentId?: string | null;
  authorUid: string;
  authorUsername: string;
  authorAvatarUrl?: string | null;
  authorBadge?: string | null;
  text: string;
  createdAt: number;
  likesCount: number;
  isLiked?: boolean;
  replies?: EngagementComment[];
}
