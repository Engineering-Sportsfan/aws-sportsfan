// // lib/ingestion/fifaMatchRules.ts

// import type { FifaMatchCreateInput } from "../validations/fifaMatchValidation";

// export interface RuleViolation { name: string; errorMessage: string; }
// export interface RecordValidationResult { valid: boolean; errors: RuleViolation[]; }
// export interface DQCheckResult { rule: string; passed: boolean; message: string; affectedRows?: number; }
// export interface DQReport { results: DQCheckResult[]; passedAll: boolean; warnings: DQCheckResult[]; }

// // ─── Per-record injection rules ───────────────────────────────────────────────
// export function validateFifaMatchRecord(record: Record<string, unknown>): RecordValidationResult {
//   const errors: RuleViolation[] = [];

//   // XSS / injection guard
//   const stringFields = ["match_id", "team1", "team2", "team1_code", "team2_code",
//     "venue", "city", "winner", "winner_code", "player_of_match", "referee",
//     "tournament", "gender", "format", "stage", "group"];
//   for (const field of stringFields) {
//     const val = record[field];
//     if (val !== null && val !== undefined && typeof val === "string") {
//       if (/<[^>]+>/.test(val) || /[<>"'`]/.test(val)) {
//         errors.push({ name: field, errorMessage: `${field} contains disallowed characters` });
//       }
//       if (val.length > 200) {
//         errors.push({ name: field, errorMessage: `${field} exceeds max length of 200` });
//       }
//     }
//   }

//   // Required fields
//   const required = ["match_id", "date", "team1", "team2", "team1_code", "team2_code",
//     "stage", "tournament", "gender", "format"];
//   for (const field of required) {
//     if (!record[field] && record[field] !== 0) {
//       errors.push({ name: field, errorMessage: `${field} is required` });
//     }
//   }

//   // Date format
//   if (record.date && typeof record.date === "string") {
//     if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
//       errors.push({ name: "date", errorMessage: "date must be YYYY-MM-DD" });
//     }
//   }

//   // team codes must be 3 chars
//   for (const field of ["team1_code", "team2_code"]) {
//     const val = record[field];
//     if (val && typeof val === "string" && val.length !== 3) {
//       errors.push({ name: field, errorMessage: `${field} must be exactly 3 characters` });
//     }
//   }

//   // team1 !== team2
//   if (record.team1 && record.team2 && record.team1 === record.team2) {
//     errors.push({ name: "team1/team2", errorMessage: "team1 and team2 must be different" });
//   }

//   // goals must be non-negative numbers
//   for (const field of ["goals_team1", "goals_team2"]) {
//     if (record[field] !== null && record[field] !== undefined) {
//       const g = Number(record[field]);
//       if (isNaN(g) || g < 0) {
//         errors.push({ name: field, errorMessage: `${field} must be a non-negative number` });
//       }
//     }
//   }

//   // penalties only valid when match_result is "penalties"
//   // const hasPens = record.goals_team1_pens !== null && record.goals_team1_pens !== undefined;
//   // if (hasPens && record.match_result !== "penalties") {
//   //   errors.push({ name: "goals_team1_pens", errorMessage: "penalty scores set but match_result is not 'penalties'" });
//   // }
//   const hasPens = record.goals_team1_pens !== null &&
//   record.goals_team1_pens !== undefined &&
//   Number(record.goals_team1_pens) > 0;
// const isPenMatch = record.match_result === "Home Win (Pens)" || record.match_result === "Away Win (Pens)";
// if (hasPens && !isPenMatch) {
//   errors.push({ name: "goals_team1_pens", errorMessage: "penalty scores set but match_result is not a penalty result" });
// }

//   return { valid: errors.length === 0, errors };
// }

// // ─── Batch DQ checks ──────────────────────────────────────────────────────────
// export function runFifaMatchDQChecks(matches: FifaMatchCreateInput[]): DQReport {
//   const results: DQCheckResult[] = [];

//   // DQ-1: no_result / abandoned matches must have null winner
//   // const badNoResult = matches.filter(
//   //   (m) => ["no_result", "abandoned"].includes(m.match_result) && m.winner !== null
//   // );
//   const badDraws = matches.filter(
//   (m) => m.match_result === "Draw" && m.winner !== null
// );
// results.push({
//   rule: "DQ-FM1: Draw matches have null winner",
//   passed: badDraws.length === 0,
//   message: badDraws.length === 0
//     ? "All draw matches have null winner"
//     : `${badDraws.length} draw matches have a non-null winner`,
//   affectedRows: badDraws.length,
// });


//   results.push({
//     rule: "DQ-FM1: no_result/abandoned have null winner",
//     passed: badDraws.length === 0,
//     message: badDraws.length === 0
//       ? "All no_result/abandoned matches have null winner"
//       : `${badDraws.length} matches have a winner set despite no_result/abandoned`,
//     affectedRows: badDraws.length,
//   });

//   // DQ-2: penalties match must have penalty scores
//   // const badPens = matches.filter(
//   //   (m) => m.match_result === "penalties" &&
//   //     (m.goals_team1_pens === null || m.goals_team2_pens === null)
//   // );
//   const badPens = matches.filter(
//   (m) => (m.match_result === "Home Win (Pens)" || m.match_result === "Away Win (Pens)") &&
//     (m.goals_team1_pens === null || m.goals_team2_pens === null)
// );

//   results.push({
//     rule: "DQ-FM2: penalties matches have penalty scores",
//     passed: badPens.length === 0,
//     message: badPens.length === 0
//       ? "All penalty matches have penalty scores"
//       : `${badPens.length} penalty matches missing penalty scores`,
//     affectedRows: badPens.length,
//   });

//   // DQ-3: winner must be team1 or team2
//   const badWinner = matches.filter(
//     (m) => m.winner !== null && m.winner !== m.team1 && m.winner !== m.team2
//   );
//   results.push({
//     rule: "DQ-FM3: winner is team1 or team2",
//     passed: badWinner.length === 0,
//     message: badWinner.length === 0
//       ? "All winners are valid team names"
//       : `${badWinner.length} matches have a winner that is neither team1 nor team2`,
//     affectedRows: badWinner.length,
//   });


//   const badDrawWinner = matches.filter(
//   (m) => m.match_result === "Draw" && m.winner !== null
// );

//   // DQ-4: winner_code must match winner team code
//   const badWinnerCode = matches.filter((m) => {
//     if (!m.winner || !m.winner_code) return false;
//     if (m.winner === m.team1) return m.winner_code !== m.team1_code;
//     if (m.winner === m.team2) return m.winner_code !== m.team2_code;
//     return false;
//   });
//   results.push({
//     rule: "DQ-FM4: winner_code matches winner team",
//     passed: badWinnerCode.length === 0,
//     message: badWinnerCode.length === 0
//       ? "All winner_codes are consistent"
//       : `${badWinnerCode.length} matches have mismatched winner_code`,
//     affectedRows: badWinnerCode.length,
//   });

//   // DQ-5: season consistent with date year
//   const badSeason = matches.filter((m) => {
//     const dateYear = parseInt(m.date.slice(0, 4), 10);
//     return Math.abs(m.season - dateYear) > 1;
//   });
//   results.push({
//     rule: "DQ-FM5: season consistent with date",
//     passed: badSeason.length === 0,
//     message: badSeason.length === 0
//       ? "All seasons consistent with dates"
//       : `${badSeason.length} matches have season/date mismatch`,
//     affectedRows: badSeason.length,
//   });

//   // DQ-6: no duplicate match_ids in batch
//   const ids = matches.map((m) => m.match_id);
//   const uniqueIds = new Set(ids);
//   results.push({
//     rule: "DQ-FM6: no duplicate match_ids in batch",
//     passed: ids.length === uniqueIds.size,
//     message: ids.length === uniqueIds.size
//       ? "All match_ids are unique"
//       : `${ids.length - uniqueIds.size} duplicate match_ids in batch`,
//     affectedRows: ids.length - uniqueIds.size,
//   });

//   // DQ-7: group stage matches must have group set
//   const badGroup = matches.filter(
//     (m) => m.stage === "Group Stage" && !m.group
//   );
//   results.push({
//     rule: "DQ-FM7: Group Stage matches have group set",
//     passed: badGroup.length === 0,
//     message: badGroup.length === 0
//       ? "All group stage matches have a group"
//       : `${badGroup.length} group stage matches missing group`,
//     affectedRows: badGroup.length,
//   });

//   const warnings = results.filter((r) => !r.passed);
//   return { results, passedAll: warnings.length === 0, warnings };
// }






// lib/ingestion/fifaMatchRules.ts

import type { FifaMatchCreateInput } from "../validations/fifaMatchValidation";

export interface RuleViolation { name: string; errorMessage: string; }
export interface RecordValidationResult { valid: boolean; errors: RuleViolation[]; }
export interface DQCheckResult { rule: string; passed: boolean; message: string; affectedRows?: number; }
export interface DQReport { results: DQCheckResult[]; passedAll: boolean; warnings: DQCheckResult[]; }

// ─── Per-record injection rules ───────────────────────────────────────────────
export function validateFifaMatchRecord(record: Record<string, unknown>): RecordValidationResult {
  const errors: RuleViolation[] = [];

  // XSS / injection guard
  const stringFields = ["match_id", "team1", "team2", "team1_code", "team2_code",
    "venue", "city", "winner", "winner_code", "player_of_match", "referee",
    "tournament", "gender", "format", "stage", "group"];
  for (const field of stringFields) {
    const val = record[field];
    if (val !== null && val !== undefined && typeof val === "string") {
      if (/<[^>]+>/.test(val) || /[<>"'`]/.test(val)) {
        errors.push({ name: field, errorMessage: `${field} contains disallowed characters` });
      }
      if (val.length > 200) {
        errors.push({ name: field, errorMessage: `${field} exceeds max length of 200` });
      }
    }
  }

  // Required fields
  const required = ["match_id", "date", "team1", "team2", "team1_code", "team2_code",
    "stage", "tournament", "gender", "format"];
  for (const field of required) {
    if (!record[field] && record[field] !== 0) {
      errors.push({ name: field, errorMessage: `${field} is required` });
    }
  }

  // Date format
  if (record.date && typeof record.date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      errors.push({ name: "date", errorMessage: "date must be YYYY-MM-DD" });
    }
  }

  // team codes must be 3 chars
  for (const field of ["team1_code", "team2_code"]) {
    const val = record[field];
    if (val && typeof val === "string" && val.length !== 3) {
      errors.push({ name: field, errorMessage: `${field} must be exactly 3 characters` });
    }
  }

  // team1 !== team2
  if (record.team1 && record.team2 && record.team1 === record.team2) {
    errors.push({ name: "team1/team2", errorMessage: "team1 and team2 must be different" });
  }

  // goals must be non-negative numbers
  for (const field of ["goals_team1", "goals_team2"]) {
    if (record[field] !== null && record[field] !== undefined) {
      const g = Number(record[field]);
      if (isNaN(g) || g < 0) {
        errors.push({ name: field, errorMessage: `${field} must be a non-negative number` });
      }
    }
  }

  // penalty scores only valid when match_result is a penalty result
  const hasPens = record.goals_team1_pens !== null &&
    record.goals_team1_pens !== undefined &&
    Number(record.goals_team1_pens) > 0;
  const isPenMatch = record.match_result === "Home Win (Pens)" || record.match_result === "Away Win (Pens)";
  if (hasPens && !isPenMatch) {
    errors.push({ name: "goals_team1_pens", errorMessage: "penalty scores set but match_result is not a penalty result" });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Batch DQ checks ──────────────────────────────────────────────────────────
export function runFifaMatchDQChecks(matches: FifaMatchCreateInput[]): DQReport {
  const results: DQCheckResult[] = [];

  // DQ-1: Draw matches must have null winner
  const badDraws = matches.filter(
    (m) => m.match_result === "Draw" && m.winner !== null
  );
  results.push({
    rule: "DQ-FM1: Draw matches have null winner",
    passed: badDraws.length === 0,
    message: badDraws.length === 0
      ? "All draw matches have null winner"
      : `${badDraws.length} draw matches have a non-null winner`,
    affectedRows: badDraws.length,
  });

  // DQ-2: penalty matches must have penalty scores
  const badPens = matches.filter(
    (m) => (m.match_result === "Home Win (Pens)" || m.match_result === "Away Win (Pens)") &&
      (m.goals_team1_pens === null || m.goals_team2_pens === null)
  );
  results.push({
    rule: "DQ-FM2: penalties matches have penalty scores",
    passed: badPens.length === 0,
    message: badPens.length === 0
      ? "All penalty matches have penalty scores"
      : `${badPens.length} penalty matches missing penalty scores`,
    affectedRows: badPens.length,
  });

  // DQ-3: winner must be team1 or team2
  const badWinner = matches.filter(
    (m) => m.winner !== null && m.winner !== m.team1 && m.winner !== m.team2
  );
  results.push({
    rule: "DQ-FM3: winner is team1 or team2",
    passed: badWinner.length === 0,
    message: badWinner.length === 0
      ? "All winners are valid team names"
      : `${badWinner.length} matches have a winner that is neither team1 nor team2`,
    affectedRows: badWinner.length,
  });

  // DQ-4: winner_code must match winner team code
  const badWinnerCode = matches.filter((m) => {
    if (!m.winner || !m.winner_code) return false;
    if (m.winner === m.team1) return m.winner_code !== m.team1_code;
    if (m.winner === m.team2) return m.winner_code !== m.team2_code;
    return false;
  });
  results.push({
    rule: "DQ-FM4: winner_code matches winner team",
    passed: badWinnerCode.length === 0,
    message: badWinnerCode.length === 0
      ? "All winner_codes are consistent"
      : `${badWinnerCode.length} matches have mismatched winner_code`,
    affectedRows: badWinnerCode.length,
  });

  // DQ-5: season consistent with date year
  const badSeason = matches.filter((m) => {
    const dateYear = parseInt(m.date.slice(0, 4), 10);
    return Math.abs(m.season - dateYear) > 1;
  });
  results.push({
    rule: "DQ-FM5: season consistent with date",
    passed: badSeason.length === 0,
    message: badSeason.length === 0
      ? "All seasons consistent with dates"
      : `${badSeason.length} matches have season/date mismatch`,
    affectedRows: badSeason.length,
  });

  // DQ-6: no duplicate match_ids in batch
  const ids = matches.map((m) => m.match_id);
  const uniqueIds = new Set(ids);
  results.push({
    rule: "DQ-FM6: no duplicate match_ids in batch",
    passed: ids.length === uniqueIds.size,
    message: ids.length === uniqueIds.size
      ? "All match_ids are unique"
      : `${ids.length - uniqueIds.size} duplicate match_ids in batch`,
    affectedRows: ids.length - uniqueIds.size,
  });

  // DQ-7: group stage matches must have group set
  const badGroup = matches.filter(
    (m) => m.stage === "Group Stage" && !m.group
  );
  results.push({
    rule: "DQ-FM7: Group Stage matches have group set",
    passed: badGroup.length === 0,
    message: badGroup.length === 0
      ? "All group stage matches have a group"
      : `${badGroup.length} group stage matches missing group`,
    affectedRows: badGroup.length,
  });

  const warnings = results.filter((r) => !r.passed);
  return { results, passedAll: warnings.length === 0, warnings };
}