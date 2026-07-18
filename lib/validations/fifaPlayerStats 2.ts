// lib/validations/fifaPlayerStats.ts

import { z } from "zod";

export const FifaPlayerStatsSchema = z.object({
  player: z.string().min(1, "Player name is required"),
  team: z.string().min(1, "Team name is required"),
  position: z.string().min(1, "Position is required"),
  matchesPlayed: z.number().int().min(0).max(10),
  minutesPlayed: z.number().int().min(0).max(900),
  goals: z.number().int().min(0).max(20),
  assists: z.number().int().min(0).max(10),
  shots: z.number().int().min(0).max(50),
  shotsOnTarget: z.number().int().min(0).max(30),
  shotConversionPercent: z.number().min(0).max(100),
  expectedGoals: z.number().min(0).max(20),
  expectedAssists: z.number().min(0).max(10),
  dribblesCompleted: z.number().int().min(0).max(50),
  keyPasses: z.number().int().min(0).max(50),
  chancesCreated: z.number().int().min(0).max(50),
  bigChancesCreated: z.number().int().min(0).max(20),
}).refine(
  (data) => {
    // Shots on target cannot exceed total shots
    return data.shotsOnTarget <= data.shots;
  },
  { message: "Shots on target cannot exceed total shots" }
).refine(
  (data) => {
    // Goals cannot exceed shots on target
    return data.goals <= data.shotsOnTarget;
  },
  { message: "Goals cannot exceed shots on target" }
).refine(
  (data) => {
    // Assists cannot exceed chances created
    return data.assists <= data.chancesCreated;
  },
  { message: "Assists cannot exceed chances created" }
);

export const FifaPlayerStatsCreateSchema = FifaPlayerStatsSchema.omit({});
export const FifaPlayerStatsUpdateSchema = FifaPlayerStatsCreateSchema.partial();

export type FifaPlayerStatsValidationResult<T> = {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
};

export function validateFifaPlayerStats(data: unknown): FifaPlayerStatsValidationResult<z.infer<typeof FifaPlayerStatsSchema>> {
  const result = FifaPlayerStatsSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((err:unknown) => ({
      field: (err as { path: (string | number)[] }).path.join("."),
      message: (err as { message: string }).message,
    })),
  };
}

export function validateFifaPlayerStatsCreate(data: unknown): FifaPlayerStatsValidationResult<z.infer<typeof FifaPlayerStatsCreateSchema>> {
  const result = FifaPlayerStatsCreateSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((err:unknown) => ({
      field: (err as { path: (string | number)[] }).path.join("."),
      message: (err as { message: string }).message,
    })),
  };
}