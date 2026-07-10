// lib/types.ts

export type PollType = "poll" | "quiz";

export interface PollOption {
  id: string;       // e.g. "opt_1"
  label: string;    // e.g. "Royal Challengers Bangalore"
  votes: number;
  isCorrect?: boolean; // only relevant for quiz type
}

export interface Poll {
  id: string;
  title: string;           // "Who are you supporting today?"
  type: PollType;
  options: PollOption[];
  endsAt: string;          // ISO date string
  active: boolean;
  createdAt: string;       // ISO date string
}

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface CreatePollBody {
  title: string;
  type: PollType;
  options: Array<{ label: string; isCorrect?: boolean }>;
  endsAt: string; // ISO date string
}

export interface UpdatePollBody {
  title?: string;
  endsAt?: string;
  active?: boolean;
}

export interface VoteBody {
  optionId: string;
}