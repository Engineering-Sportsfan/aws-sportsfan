// models/wt20Club.ts
// Firestore collection: wt20Clubs
// Document ID = club_id (e.g. "AUS-W", "IND-W")

export type WT20ClubFormat = "international";
export type WT20ClubGender = "female";

export interface WT20Club {
  // ── Identity ────────────────────────────────────────────────────────────────
  club_id: string;            // document ID — e.g. "AUS-W"
  country: string;            // Full country name e.g. "Australia"

  // ── Rankings ────────────────────────────────────────────────────────────────
  icc_ranking: number;        // Current ICC T20I ranking
  rating_points: number;      // ICC rating points

  // ── World Cup campaign stats ────────────────────────────────────────────────
  apps: number;               // Total WT20 WC appearances
  matches: number;            // Total matches played
  won: number;
  lost: number;
  tied_so: number;            // Tied / Super Over results
  no_result: number;          // NR matches
  win_pct: number;            // Win percentage (0–1)

  // ── Form & squad ────────────────────────────────────────────────────────────
  recent_form: string | null; // e.g. "W-W-W-L-W" (last 5 results)
  current_captain: string | null;
  head_coach: string | null;
  featured_player: string | null;

  // ── Historical ──────────────────────────────────────────────────────────────
  best_tournament_finish: string | null; // e.g. "Champions (6 times)"

  // ── Classification ──────────────────────────────────────────────────────────
  tournament: "ICC Women's T20 World Cup";
  gender: WT20ClubGender;
  format: WT20ClubFormat;

  // ── Audit ────────────────────────────────────────────────────────────────────
  created_at: FirebaseFirestore.Timestamp | null;
  updated_at: FirebaseFirestore.Timestamp | null;
  source_file: string | null;
}

export type WT20ClubCreate = Omit<WT20Club, "created_at" | "updated_at">;
export type WT20ClubUpdate = Partial<Omit<WT20Club, "club_id" | "created_at">>;