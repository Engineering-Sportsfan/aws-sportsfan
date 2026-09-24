// types/engagements.ts — Type definitions for Fan Battles, Quizzes, Polls, Predictions, and Meme Arena
export type EngagementType = "fan_battle" | "quiz" | "poll" | "prediction" | "meme";
export type EngagementStatus = "active" | "inactive" | "expired" | "settled";

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
  pointsReward?: number; // e.g. 50
  explanation?: string; // e.g. "Correct: 29"
}

export interface QuizPayload {
  question?: string;
  options?: QuizOption[];
  correctOptionId?: string; // "B"
  pointsReward?: number; // e.g. 50
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
  id: string; // "left" | "right"
  text: string; // e.g. "Yes, India win"
  code?: string; // e.g. "IN"
  votes: number;
}

export interface PredictionPayload {
  question: string;
  leftChoice: PredictionChoice;
  rightChoice: PredictionChoice;
  coinStake: number; // e.g. 25
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

export interface MemePayload {
  imageUrl: string;
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
  options?: any[];
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

  // Specific data payloads
  fanBattleData?: FanBattlePayload;
  quizData?: QuizPayload;
  pollData?: PollPayload;
  predictionData?: PredictionPayload;
  memeData?: MemePayload;

  // Social / Engagement counters
  likes: number;
  likeCount?: number;
  shares: number;
  totalEngaged: number;

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
