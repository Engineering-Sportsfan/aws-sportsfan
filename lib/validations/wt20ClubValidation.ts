// lib/validations/wt20ClubValidation.ts
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const WT20TournamentEnum = z.enum(["ICC Women's T20 World Cup"]);
export const WT20GenderEnum = z.enum(["female"]);
export const WT20FormatEnum = z.enum(["international"]);

// ─── Club create schema ───────────────────────────────────────────────────────
export const WT20ClubCreateSchema = z.object({
  // Identity
  club_id: z
    .string()
    .min(2, "club_id must be 2–3 characters (e.g. AUS)")
    .max(3, "club_id must be 2–3 characters (e.g. AUS)")
    .toUpperCase(),
  country: z.string().min(1, "country is required"),

  // Rankings
  icc_ranking: z.number().int().min(1, "icc_ranking must be ≥ 1"),
  rating_points: z.number().int().min(0, "rating_points must be ≥ 0"),

  // Campaign stats
  apps: z.number().int().min(0),
  matches: z.number().int().min(0),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  tied_so: z.number().int().min(0),
  no_result: z.number().int().min(0),
  win_pct: z.number().min(0).max(1, "win_pct must be between 0 and 1"),

  // Form & squad
  recent_form: z.string().nullable().default(null),
  current_captain: z.string().nullable().default(null),
  head_coach: z.string().nullable().default(null),
  featured_player: z.string().nullable().default(null),

  // Historical
  best_tournament_finish: z.string().nullable().default(null),

  // Classification
  tournament: WT20TournamentEnum,
  gender: WT20GenderEnum,
  format: WT20FormatEnum,

  // Audit
  source_file: z.string().nullable().default(null),
});

// Daily patch: only mutable stat fields can be updated
export const WT20ClubUpdateSchema = z.object({
  icc_ranking: z.number().int().min(1).optional(),
  rating_points: z.number().int().min(0).optional(),
  matches: z.number().int().min(0).optional(),
  won: z.number().int().min(0).optional(),
  lost: z.number().int().min(0).optional(),
  tied_so: z.number().int().min(0).optional(),
  no_result: z.number().int().min(0).optional(),
  win_pct: z.number().min(0).max(1).optional(),
  recent_form: z.string().nullable().optional(),
  current_captain: z.string().nullable().optional(),
  head_coach: z.string().nullable().optional(),
  featured_player: z.string().nullable().optional(),
  best_tournament_finish: z.string().nullable().optional(),
  source_file: z.string().nullable().optional(),
});

// Types
export type WT20ClubCreateInput = z.infer<typeof WT20ClubCreateSchema>;
export type WT20ClubUpdateInput = z.infer<typeof WT20ClubUpdateSchema>;

// Helpers
export function validateWT20ClubCreate(data: unknown) {
  const result = WT20ClubCreateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}

export function validateWT20ClubUpdate(data: unknown) {
  const result = WT20ClubUpdateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}