// // lib/validations/fifaMatchValidation.ts
// import { z } from "zod";

// // ─── Enums ────────────────────────────────────────────────────────────────────
// export const FifaTournamentEnum = z.enum([
//  "FIFA World Cup",
//   "FIFA Women's World Cup",
// ]);

// export const FifaGenderEnum = z.enum(["male", "female"]);
// export const FifaFormatEnum = z.enum(["international"]);

// export const FifaMatchResultEnum = z.enum([
//   "normal",
//   "extra_time",
//   "penalties",
//   "no_result",
//   "abandoned",
// ]);

// export const FifaStageEnum = z.enum([
//   "Group Stage",
//   "First group stage",
//   "Second group stage",
//   "First round",
//   "Second round",
//   "Final stage",
//   "Round of 16",
//   "Quarter-finals",
//   "Semi-finals",
//   "Third-place match",
//   "Final",
// ]);

// // ─── Match create schema ──────────────────────────────────────────────────────
// export const FifaMatchCreateSchema = z.object({
//   match_id: z.string().min(1, "match_id is required"),
//   date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
//   season: z.number().int().min(2000).max(2100),

//   stage: FifaStageEnum,
//   group: z.string().nullable().default(null),
//   match_day: z.string().nullable().default(null),

//   team1: z.string().min(1),
//   team2: z.string().min(1),
//   team1_code: z.string().length(3, "team1_code must be 3 characters"),
//   team2_code: z.string().length(3, "team2_code must be 3 characters"),

//   venue: z.string().min(1),
//   city: z.string().nullable().default(null),

//   winner: z.string().nullable().default(null),
//   winner_code: z.string().nullable().default(null),
//   goals_team1: z.number().int().min(0),
//   goals_team2: z.number().int().min(0),
//   goals_team1_pens: z.number().int().min(0).nullable().default(null),
//   goals_team2_pens: z.number().int().min(0).nullable().default(null),
//   match_result: FifaMatchResultEnum.default("normal"),

//   player_of_match: z.string().nullable().default(null),
//   player_of_match_id: z.string().nullable().default(null),

//   referee: z.string().nullable().default(null),

//   tournament: FifaTournamentEnum,
//   gender: FifaGenderEnum,
//   format: FifaFormatEnum,

//   source_file: z.string().nullable().default(null),
// });

// export const FifaMatchUpdateSchema = FifaMatchCreateSchema.partial().omit({
//   match_id: true,
// });

// export const BulkFifaMatchUploadSchema = z.object({
//   matches: z.array(FifaMatchCreateSchema).min(1),
//   source_file: z.string().optional(),
//   dry_run: z.boolean().default(false),
//   upsert: z.boolean().default(false),           // update if match_id already exists
// });

// // ─── Types ────────────────────────────────────────────────────────────────────
// export type FifaMatchCreateInput = z.infer<typeof FifaMatchCreateSchema>;
// export type FifaMatchUpdateInput = z.infer<typeof FifaMatchUpdateSchema>;
// export type BulkFifaMatchUploadInput = z.infer<typeof BulkFifaMatchUploadSchema>;

// // ─── Helpers ──────────────────────────────────────────────────────────────────
// export function validateFifaMatchCreate(data: unknown) {
//   const result = FifaMatchCreateSchema.safeParse(data);
//   if (result.success) return { success: true, data: result.data };
//   return {
//     success: false,
//     errors: result.error.issues.map((i) => ({
//       field: i.path.join("."),
//       message: i.message,
//     })),
//   };
// }

// export function validateFifaMatchUpdate(data: unknown) {
//   const result = FifaMatchUpdateSchema.safeParse(data);
//   if (result.success) return { success: true, data: result.data };
//   return {
//     success: false,
//     errors: result.error.issues.map((i) => ({
//       field: i.path.join("."),
//       message: i.message,
//     })),
//   };
// }






// lib/validations/fifaMatchValidation.ts
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const FifaTournamentEnum = z.enum([
  "FIFA World Cup",
  "FIFA Women's World Cup",
]);

export const FifaGenderEnum = z.enum(["male", "female"]);
export const FifaFormatEnum = z.enum(["international"]);

export const FifaMatchResultEnum = z.enum([
  "Home Win",
  "Away Win",
  "Draw",
  "Home Win (Pens)",
  "Away Win (Pens)",
]);

export const FifaStageEnum = z.enum([
  "Group Stage",
  "First group stage",
  "Second group stage",
  "First round",
  "Second round",
  "Final stage",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "Third-place match",
  "Final",
]);

// ─── Match create schema ──────────────────────────────────────────────────────
export const FifaMatchCreateSchema = z.object({
  match_id: z.string().min(1, "match_id is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  season: z.number().int().min(1930).max(2100),

  stage: FifaStageEnum,
  group: z.string().nullable().default(null),
  match_day: z.string().nullable().default(null),

  team1: z.string().min(1),
  team2: z.string().min(1),
  // team1_code: z.string().length(3, "team1_code must be 3 characters"),
  // team2_code: z.string().length(3, "team2_code must be 3 characters"),
team1_code: z.string().min(2, "team1_code must be 2-3 characters").max(3, "team1_code must be 2-3 characters"),
team2_code: z.string().min(2, "team2_code must be 2-3 characters").max(3, "team2_code must be 2-3 characters"),
  venue: z.string().min(1),
  city: z.string().nullable().default(null),

  winner: z.string().nullable().default(null),
  winner_code: z.string().nullable().default(null),
  goals_team1: z.number().int().min(0),
  goals_team2: z.number().int().min(0),
  goals_team1_pens: z.number().int().min(0).nullable().default(null),
  goals_team2_pens: z.number().int().min(0).nullable().default(null),
  match_result: FifaMatchResultEnum.default("Home Win"),

  player_of_match: z.string().nullable().default(null),
  player_of_match_id: z.string().nullable().default(null),

  referee: z.string().nullable().default(null),

  tournament: FifaTournamentEnum,
  gender: FifaGenderEnum,
  format: FifaFormatEnum,

  source_file: z.string().nullable().default(null),
});

export const FifaMatchUpdateSchema = FifaMatchCreateSchema.partial().omit({
  match_id: true,
});

export const BulkFifaMatchUploadSchema = z.object({
  matches: z.array(FifaMatchCreateSchema).min(1),
  source_file: z.string().optional(),
  dry_run: z.boolean().default(false),
  upsert: z.boolean().default(false),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type FifaMatchCreateInput = z.infer<typeof FifaMatchCreateSchema>;
export type FifaMatchUpdateInput = z.infer<typeof FifaMatchUpdateSchema>;
export type BulkFifaMatchUploadInput = z.infer<typeof BulkFifaMatchUploadSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function validateFifaMatchCreate(data: unknown) {
  const result = FifaMatchCreateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}

export function validateFifaMatchUpdate(data: unknown) {
  const result = FifaMatchUpdateSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    })),
  };
}