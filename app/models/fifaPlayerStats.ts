// models/fifaPlayerStats.ts
// Firestore collection: fifaPlayerStats
// Document ID = auto-generated

import type { FifaTournament, Gender, FifaFormat } from "./fifaMatch";

export interface FifaPlayerStats {
  // identity
  player_name: string;
  team: string;
  position: "GK" | "DF" | "MF" | "FW";
  player_id: string;            // fill after master player registry

  // appearance
  matches_played: number;
  minutes_played: number;

  // attacking
  goals: number;
  assists: number;
  shots: number;
  shots_on_target: number;
  shot_conversion_pct: number;         // rounded to 2dp

  // advanced
  xg: number;                          // expected goals
  xa: number;                          // expected assists

  // creativity
  dribbles_completed: number;
  key_passes: number;
  chances_created: number;
  big_chances_created: number;

  // classification
  tournament: FifaTournament;
  gender: Gender;
  format: FifaFormat;
  season: number;

  // audit
  created_at: FirebaseFirestore.Timestamp | null;
  updated_at: FirebaseFirestore.Timestamp | null;
  source_file: string | null;
}

export type FifaPlayerStatsCreate = Omit<FifaPlayerStats, "created_at" | "updated_at">;
export type FifaPlayerStatsUpdate = Partial<Omit<FifaPlayerStats, "player_name" | "created_at">>;