// models/fifaClub.ts
// Firestore collection: fifaClubs
// Document ID = club_id (FIFA 3-letter code, e.g. "BRA")

export type FifaClubFormat = "international";
export type FifaClubGender = "male" | "female";

export interface FifaClub {
  // ── Identity ────────────────────────────────────────────────────────────────
  club_id: string;          // document ID — FIFA 3-letter code e.g. "BRA"
  country: string;          // Full country name e.g. "Brazil"

  // ── Rankings ────────────────────────────────────────────────────────────────
  fifa_rank: number;        // Current FIFA world ranking

  // ── World Cup campaign stats ────────────────────────────────────────────────
  world_cup_apps: number;   // Total World Cup appearances
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;        // GF — total goals scored
  goals_against: number;    // GA — total goals conceded
  goal_difference: number;  // GD = GF - GA

  // ── 2026 Squad ──────────────────────────────────────────────────────────────
  head_coach_2026: string | null;
  captain_2026: string | null;

  // ── Historical ──────────────────────────────────────────────────────────────
  all_time_best_finish: string | null; // e.g. "5 Titles", "Runners-up (1974, 1978, 2010)"

  // ── Classification ──────────────────────────────────────────────────────────
  tournament: "FIFA World Cup" | "FIFA Women's World Cup";
  gender: FifaClubGender;
  format: FifaClubFormat;

  // ── Audit ────────────────────────────────────────────────────────────────────
  created_at: FirebaseFirestore.Timestamp | null;
  updated_at: FirebaseFirestore.Timestamp | null;
  source_file: string | null;
}

export type FifaClubCreate = Omit<FifaClub, "created_at" | "updated_at">;
export type FifaClubUpdate = Partial<Omit<FifaClub, "club_id" | "created_at">>;