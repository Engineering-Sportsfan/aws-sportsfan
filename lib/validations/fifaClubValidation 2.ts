// lib/validations/fifaClubValidation.ts
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const FifaClubTournamentEnum = z.enum([
  "FIFA World Cup",
  "FIFA Women's World Cup",
]);

export const FifaClubGenderEnum = z.enum(["male", "female"]);
export const FifaClubFormatEnum = z.enum(["international"]);

// ─── Club create schema ───────────────────────────────────────────────────────
export const FifaClubCreateSchema = z.object({
  // Identity
  club_id: z
    .string()
    .min(2, "club_id must be 2–3 characters")
    .max(3, "club_id must be 2–3 characters")
    .toUpperCase(),
  country: z.string().min(1, "country is required"),

  // Rankings
  fifa_rank: z.number().int().min(1, "fifa_rank must be ≥ 1"),

  // Campaign stats
  world_cup_apps: z.number().int().min(0),
  matches_played: z.number().int().min(0),
  wins: z.number().int().min(0),
  draws: z.number().int().min(0),
  losses: z.number().int().min(0),
  goals_for: z.number().int().min(0),
  goals_against: z.number().int().min(0),
  goal_difference: z.number().int(), // can be negative

  // 2026 squad
  head_coach_2026: z.string().nullable().default(null),
  captain_2026: z.string().nullable().default(null),

  // Historical
  all_time_best_finish: z.string().nullable().default(null),

  // Classification
  tournament: FifaClubTournamentEnum,
  gender: FifaClubGenderEnum,
  format: FifaClubFormatEnum,

  // Audit
  source_file: z.string().nullable().default(null),
});

export const FifaClubUpdateSchema = FifaClubCreateSchema.partial().omit({
  club_id: true,
});

export const BulkFifaClubUploadSchema = z.object({
  clubs: z.array(FifaClubCreateSchema).min(1),
  source_file: z.string().optional(),
  dry_run: z.boolean().default(false),
  upsert: z.boolean().default(false),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type FifaClubCreateInput = z.infer<typeof FifaClubCreateSchema>;
export type FifaClubUpdateInput = z.infer<typeof FifaClubUpdateSchema>;
export type BulkFifaClubUploadInput = z.infer<typeof BulkFifaClubUploadSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function validateFifaClubCreate(data: unknown) {
  const result = FifaClubCreateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}

export function validateFifaClubUpdate(data: unknown) {
  const result = FifaClubUpdateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}