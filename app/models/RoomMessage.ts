// app/models/RoomMessage.ts


export type MessageType = "chat" | "post" | "prediction" | "hottake" | "hot_take" | "debate" | "raw_reactions" | "memory" | "quiz" | "predictions_live" | "trivia" | "battle";

export interface RoomMessage {
  msgId: string;
  roomId: string;
  authorUid: string;
  authorUsername: string;
  authorEmail?: string;
  authorBadge: string;
  text: string;
  type: MessageType;
  fireCount: number;
  noChanceCount: number;
  agreeCount: number;
  disagreeCount: number;
  replyCount: number;
  createdAt: number;
  mediaUrls?: string[];
  heartCount?: number;   // ← add
  sideA?: string;        // ← add
  sideB?: string;
  questions?: { question: string; options: { label: string; emoji: string }[] }[];
  matchTitle?: string;
  predictionOptions?: string[];
  predictionOptionCounts?: Record<string, number>;
  closesAt?: number;
  closedAt?: number;
  resolvedAt?: number;
  correctVote?: string;
  accuracyAwarded?: boolean;
  memGifUrl?: string;
  memTag?: string;
  triviaQuestions?: TriviaQuestion[];
  battleQuestions?: BattleQuestion[];
  triviaParticipants?: Record<number, number>; // questionIndex -> count
  battleVoteCounts?: Record<number, { playerA: number; playerB: number }>;

}



export interface TriviaOption {
  label: string;   // "A" | "B" | "C" | "D"
  text: string;
  isCorrect?: boolean; // only ever sent to client for THIS user's answered/expired question
}

export interface TriviaQuestion {
  question: string;
  options: TriviaOption[];
  timerSeconds?: number;
}

export interface BattlePlayer {
  name: string;
  team?: string;
  image?: string;
}

export interface BattleQuestion {
  question?: string; // optional headline, e.g. "Player of the Match"
  playerA: BattlePlayer;
  playerB: BattlePlayer;
}
