// lib/validations/playerStatsValidation.ts
import { z } from "zod";

const TournamentEnum = z.enum([
   "mens_ipl",
  "womens_ipl",
  "womens_wc",
  "womens_odi",
  "womens_test",
  "womens_t20i",
  "mens_t20i",
]);
const GenderEnum = z.enum(["male", "female"]);
const FormatEnum = z.enum(["T20", "ODI", "Test"]);

// ─── Single player stats schema ───────────────────────────────────────────────
export const PlayerStatsCreateSchema = z.object({
  player_name: z.string().min(1, "player_name is required"),
  player_id: z.string().min(1, "player_id is required"),

  // batting — all must be real numbers 
  runs: z.number().int().min(0),
  balls_faced: z.number().int().min(0),
  fours: z.number().int().min(0),
  sixes: z.number().int().min(0),
  strike_rate: z.number().min(0),
  batting_dismissals: z.number().int().min(0),
  batting_average: z.number().min(0),

  // bowling
  wickets: z.number().int().min(0),
  runs_conceded: z.number().int().min(0),
  balls_bowled: z.number().int().min(0),
  overs: z.number().min(0),           // derived or explicit
  economy: z.number().min(0),
  bowling_average: z.number().min(0),
  jersey_no: z.number().int().min(0).nullable().optional(),
  // classification
  tournament: TournamentEnum,
  gender: GenderEnum,
  format: FormatEnum,

  source_file: z.string().nullable().default(null),
});

export const PlayerStatsUpdateSchema = PlayerStatsCreateSchema.partial().omit({
  player_name: true,
});

// ─── Bulk upload ──────────────────────────────────────────────────────────────
export const BulkPlayerStatsUploadSchema = z.object({
  stats: z.array(PlayerStatsCreateSchema).min(1),
  source_file: z.string().optional(),
  tournament: TournamentEnum.optional(),
  dry_run: z.boolean().default(false),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type PlayerStatsCreateInput = z.infer<typeof PlayerStatsCreateSchema>;
export type PlayerStatsUpdateInput = z.infer<typeof PlayerStatsUpdateSchema>;
export type BulkPlayerStatsUploadInput = z.infer<typeof BulkPlayerStatsUploadSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function validatePlayerStatsCreate(data: unknown) {
  const result = PlayerStatsCreateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}

export function validatePlayerStatsUpdate(data: unknown) {
  const result = PlayerStatsUpdateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}