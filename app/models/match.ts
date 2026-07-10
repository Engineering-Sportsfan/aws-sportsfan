// models/match.ts
// Firestore collection: matches
// Document ID = match_id (string)

export type Tournament = "mens_ipl" | "womens_ipl" | "womens_wc" | "womens_odi" | "womens_test" | "womens_t20i";
export type Gender = "male" | "female";
export type MatchFormat = "T20" | "ODI" | "Test";
export type MatchResult = "normal" | "no_result" | "tie" | "abandoned";
export type TossDecision = "bat" | "field";

// ─── Main match document ──────────────────────────────────────────────────────
export interface Match {
  match_id: string;                  // document ID — also stored as field
  date: string;                      // YYYY-MM-DD
  season: number;                    // e.g. 2024
  team1: string;
  team2: string;
  venue: string;
  city: string | null;               // 51 IPL rows are null — OK
  winner: string | null;             // null on no_result
  toss_winner: string;
  toss_decision: TossDecision;
  player_of_match: string | null;    // 9 IPL rows null — OK
  player_of_match_id: string | null; // filled after master player registry
  target: number | null;
  chase_success: boolean | null;
  match_result: MatchResult;

  // classification
  tournament: Tournament;
  gender: Gender;
  format: MatchFormat;

  // audit
  created_at: FirebaseFirestore.Timestamp | null;
  updated_at: FirebaseFirestore.Timestamp | null;
  source_file: string | null;
}

// ─── Innings subcollection ────────────────────────────────────────────────────
// Path: matches/{match_id}/innings/{innings_no}
export interface Innings {
  innings_no: 1 | 2 | 3 | 4;
  runs: number | null;
  wickets: number | null;
  powerplay: number | null;
  middle_overs: number | null;
  death_overs: number | null;
  dots: number | null;
  fours: number | null;
  sixes: number | null;
  extras: number | null;
  highest_over: number | null;
}

// ─── Create / Update DTOs 
export type MatchCreate = Omit<Match, "created_at" | "updated_at">;
export type MatchUpdate = Partial<Omit<Match, "match_id" | "created_at">>;
export type InningsCreate = Innings;