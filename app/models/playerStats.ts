// models/playerStats.ts
// Firestore collection: playerStats
// Document ID = auto-generated (player_id once master registry is built)

import type { Tournament, Gender, MatchFormat } from "./match";

export interface PlayerStats {
  // identity
  player_name: string;
  player_id: string;                 // required: filled by ingestion or registry

  // batting
  runs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  strike_rate: number;
  batting_dismissals: number;
  batting_average: number;

  // bowling
  wickets: number;
  runs_conceded: number;
  balls_bowled: number;
  overs: number;                     // derived: balls_bowled / 6
  economy: number;
  bowling_average: number;
  jersey_no?: number | null;

  // classification
  tournament: Tournament;
  gender: Gender;
  format: MatchFormat;

  // audit
  created_at: FirebaseFirestore.Timestamp | null;
  updated_at: FirebaseFirestore.Timestamp | null;
  source_file: string | null;
}

export type PlayerStatsCreate = Omit<PlayerStats, "created_at" | "updated_at">;
export type PlayerStatsUpdate = Partial<Omit<PlayerStats, "player_name" | "created_at">>;