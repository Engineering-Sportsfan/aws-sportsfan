// lib/validations/matchValidation.ts
import { z } from "zod";

// ─── Shared enums ─────────────────────────────────────────────────────────────
const TournamentEnum = z.enum([
  "mens_ipl",
  "womens_ipl",
  "womens_wc",
  "womens_odi",
  "womens_test",
  "womens_t20i",
]);

const GenderEnum = z.enum(["male", "female"]);
const FormatEnum = z.enum(["T20", "ODI", "Test"]);
const MatchResultEnum = z.enum(["normal", "no_result", "tie", "abandoned"]);
const TossDecisionEnum = z.enum(["bat", "field"]);

// ─── Match schema ─────────────────────────────────────────────────────────────
export const MatchCreateSchema = z.object({
  match_id: z.string().min(1, "match_id is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  season: z.number().int().min(2000).max(2100),
  team1: z.string().min(1),
  team2: z.string().min(1),
  venue: z.string().min(1),
  city: z.string().nullable().default(null),
  winner: z.string().nullable().default(null),
  toss_winner: z.string().min(1),
  toss_decision: TossDecisionEnum,
  player_of_match: z.string().nullable().default(null),
  player_of_match_id: z.string().nullable().default(null),
  target: z.number().nullable().default(null),
  chase_success: z.boolean().nullable().default(null),
  match_result: MatchResultEnum.default("normal"),
  tournament: TournamentEnum,
  gender: GenderEnum,
  format: FormatEnum,
  source_file: z.string().nullable().default(null),
});

export const MatchUpdateSchema = MatchCreateSchema.partial().omit({
  match_id: true,
});

// ─── Innings schema ───────────────────────────────────────────────────────────
export const InningsCreateSchema = z.object({
  innings_no: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  runs: z.number().nullable().default(null),
  wickets: z.number().int().min(0).max(10).nullable().default(null),
  powerplay: z.number().nullable().default(null),
  middle_overs: z.number().nullable().default(null),
  death_overs: z.number().nullable().default(null),
  dots: z.number().int().nullable().default(null),
  fours: z.number().int().nullable().default(null),
  sixes: z.number().int().nullable().default(null),
  extras: z.number().int().nullable().default(null),
  highest_over: z.number().nullable().default(null),
});

// ─── Bulk upload payload ──────────────────────────────────────────────────────
export const BulkMatchUploadSchema = z.object({
  matches: z.array(MatchCreateSchema).min(1, "At least 1 match required"),
  source_file: z.string().optional(),
  tournament: TournamentEnum.optional(),
  dry_run: z.boolean().default(false),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type MatchCreateInput = z.infer<typeof MatchCreateSchema>;
export type MatchUpdateInput = z.infer<typeof MatchUpdateSchema>;
export type InningsCreateInput = z.infer<typeof InningsCreateSchema>;
export type BulkMatchUploadInput = z.infer<typeof BulkMatchUploadSchema>;

// ─── Validation helpers ───────────────────────────────────────────────────────
export function validateMatchCreate(data: unknown): {
  success: boolean;
  data?: MatchCreateInput;
  errors?: { field: string; message: string }[];
} {
  const result = MatchCreateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}

export function validateMatchUpdate(data: unknown) {
  const result = MatchUpdateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}