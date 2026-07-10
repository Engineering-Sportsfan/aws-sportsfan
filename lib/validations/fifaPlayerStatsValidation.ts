// lib/validations/fifaPlayerStatsValidation.ts
import { z } from "zod";
import { FifaTournamentEnum, FifaGenderEnum, FifaFormatEnum } from "./fifaMatchValidation";

// ─── Player stats schema ──────────────────────────────────────────────────────
export const FifaPlayerStatsCreateSchema = z.object({
  player_name: z.string().min(1, "player_name is required"),
  team: z.string().min(1, "team is required"),
  position: z.enum(["GK", "DF", "MF", "FW"]),
  player_id: z.string().min(1, "player_id is required"),

  matches_played: z.number().int().min(0),
  minutes_played: z.number().int().min(0),

  goals: z.number().int().min(0),
  assists: z.number().int().min(0),
  shots: z.number().int().min(0),
  shots_on_target: z.number().int().min(0),
  shot_conversion_pct: z.number().min(0).max(100),

  xg: z.number().min(0),
  xa: z.number().min(0),

  dribbles_completed: z.number().int().min(0),
  key_passes: z.number().int().min(0),
  chances_created: z.number().int().min(0),
  big_chances_created: z.number().int().min(0),

  tournament: FifaTournamentEnum,
  gender: FifaGenderEnum,
  format: FifaFormatEnum,
  season: z.number().int().min(2000).max(2100),

  source_file: z.string().nullable().default(null),
});

export const FifaPlayerStatsUpdateSchema = FifaPlayerStatsCreateSchema.partial().omit({
  player_name: true,
});

export const BulkFifaPlayerStatsUploadSchema = z.object({
  stats: z.array(FifaPlayerStatsCreateSchema).min(1),
  source_file: z.string().optional(),
  dry_run: z.boolean().default(false),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type FifaPlayerStatsCreateInput = z.infer<typeof FifaPlayerStatsCreateSchema>;
export type FifaPlayerStatsUpdateInput = z.infer<typeof FifaPlayerStatsUpdateSchema>;
export type BulkFifaPlayerStatsUploadInput = z.infer<typeof BulkFifaPlayerStatsUploadSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function validateFifaPlayerStatsCreate(data: unknown) {
  const result = FifaPlayerStatsCreateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}

export function validateFifaPlayerStatsUpdate(data: unknown) {
  const result = FifaPlayerStatsUpdateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}