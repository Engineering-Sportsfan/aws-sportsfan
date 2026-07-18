// lib/validations/cricket.ts

import { z } from "zod";

// Inning Stats Schema
const InningStatsSchema = z.object({
  runs: z.number().int().min(0).max(500),
  wickets: z.number().int().min(0).max(10),
  powerplay: z.number().int().min(0).max(150),
  middle: z.number().int().min(0).max(250),
  death: z.number().int().min(0).max(150),
  dots: z.number().int().min(0).max(150),
  fours: z.number().int().min(0).max(50),
  sixes: z.number().int().min(0).max(40),
  extras: z.number().int().min(0).max(50),
  highestOver: z.number().int().min(0).max(36).optional(),
}).refine(
  (data) => Math.abs(data.runs - (data.powerplay + data.middle + data.death)) <= 5,
  { message: "Runs sum doesn't match phase totals" }
);

// Main Match Schema
export const MatchSchema = z.object({
  matchId: z.number().int().positive(),
  date: z.coerce.date(),
  season: z.string().regex(/^\d{4}(\/\d{2})?$/),
  team1: z.string().min(1),
  team2: z.string().min(1),
  venue: z.string().min(1),
  city: z.string().min(1),
  winner: z.string().nullable(),
  tossWinner: z.string().min(1),
  tossDecision: z.enum(["bat", "field"]),
  playerOfMatch: z.string().nullable(),
  inning1: InningStatsSchema,
  inning2: InningStatsSchema,
  inning3: InningStatsSchema.optional(),
  inning4: InningStatsSchema.optional(),
  inning5: InningStatsSchema.optional(),
  inning6: InningStatsSchema.optional(),
  target: z.number().int().min(0),
  chaseSuccess: z.boolean(),
  isNoResult: z.boolean().default(false),
});

// Create Schema (without id and timestamps)
export const MatchCreateSchema = MatchSchema.omit({ 
  isNoResult: true 
}).extend({
  isNoResult: z.boolean().default(false),
});

// Update Schema (partial)
export const MatchUpdateSchema = MatchCreateSchema.partial();

// Validation Result Type
export type ValidationResult<T> = {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
};

// Validation Functions
export function validateMatch(data: unknown): ValidationResult<z.infer<typeof MatchSchema>> {
  const result = MatchSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    })),
  };
}

export function validateMatchCreate(data: unknown): ValidationResult<z.infer<typeof MatchCreateSchema>> {
  const result = MatchCreateSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    })),
  };
}