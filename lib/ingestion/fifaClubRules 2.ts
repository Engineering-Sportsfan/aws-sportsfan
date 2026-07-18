// lib/ingestion/fifaClubRules.ts

import type { FifaClubCreateInput } from "../validations/fifaClubValidation";

export interface RuleViolation { name: string; errorMessage: string; }
export interface RecordValidationResult { valid: boolean; errors: RuleViolation[]; }
export interface DQCheckResult { rule: string; passed: boolean; message: string; affectedRows?: number; }
export interface DQReport { results: DQCheckResult[]; passedAll: boolean; warnings: DQCheckResult[]; }

// ─── Per-record injection / field rules ───────────────────────────────────────
export function validateFifaClubRecord(record: Record<string, unknown>): RecordValidationResult {
  const errors: RuleViolation[] = [];

  // XSS / injection guard on all string fields
  const stringFields = [
    "club_id", "country", "head_coach_2026", "captain_2026",
    "all_time_best_finish", "tournament", "gender", "format", "source_file",
  ];
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
  const required = ["club_id", "country", "fifa_rank", "world_cup_apps",
    "matches_played", "wins", "draws", "losses",
    "goals_for", "goals_against", "goal_difference",
    "tournament", "gender", "format"];
  for (const field of required) {
    if (record[field] === null || record[field] === undefined || record[field] === "") {
      errors.push({ name: field, errorMessage: `${field} is required` });
    }
  }

  // club_id must be 2–3 chars
  if (record.club_id && typeof record.club_id === "string") {
    if (record.club_id.length < 2 || record.club_id.length > 3) {
      errors.push({ name: "club_id", errorMessage: "club_id must be 2–3 characters" });
    }
  }

  // Non-negative integer fields
  const nonNegInt = ["world_cup_apps", "matches_played", "wins", "draws", "losses", "goals_for", "goals_against", "fifa_rank"];
  for (const field of nonNegInt) {
    if (record[field] !== null && record[field] !== undefined) {
      const v = Number(record[field]);
      if (isNaN(v) || v < 0 || !Number.isInteger(v)) {
        errors.push({ name: field, errorMessage: `${field} must be a non-negative integer` });
      }
    }
  }

  // goal_difference must be an integer (can be negative)
  if (record.goal_difference !== null && record.goal_difference !== undefined) {
    const gd = Number(record.goal_difference);
    if (isNaN(gd) || !Number.isInteger(gd)) {
      errors.push({ name: "goal_difference", errorMessage: "goal_difference must be an integer" });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Batch DQ checks ──────────────────────────────────────────────────────────
export function runFifaClubDQChecks(clubs: FifaClubCreateInput[]): DQReport {
  const results: DQCheckResult[] = [];

  // DQ-1: goal_difference must equal goals_for - goals_against
  const badGD = clubs.filter(
    (c) => c.goal_difference !== c.goals_for - c.goals_against
  );
  results.push({
    rule: "DQ-FC1: goal_difference = goals_for - goals_against",
    passed: badGD.length === 0,
    message: badGD.length === 0
      ? "All goal differences are consistent"
      : `${badGD.length} clubs have inconsistent goal_difference`,
    affectedRows: badGD.length,
  });

  // DQ-2: matches_played must equal wins + draws + losses
  const badRecord = clubs.filter(
    (c) => c.matches_played !== c.wins + c.draws + c.losses
  );
  results.push({
    rule: "DQ-FC2: matches_played = wins + draws + losses",
    passed: badRecord.length === 0,
    message: badRecord.length === 0
      ? "All match records are consistent"
      : `${badRecord.length} clubs have inconsistent match record totals`,
    affectedRows: badRecord.length,
  });

  // DQ-3: no duplicate club_ids in batch
  const ids = clubs.map((c) => c.club_id);
  const uniqueIds = new Set(ids);
  results.push({
    rule: "DQ-FC3: no duplicate club_ids in batch",
    passed: ids.length === uniqueIds.size,
    message: ids.length === uniqueIds.size
      ? "All club_ids are unique"
      : `${ids.length - uniqueIds.size} duplicate club_ids in batch`,
    affectedRows: ids.length - uniqueIds.size,
  });

  // DQ-4: fifa_rank must be unique within batch
  const ranks = clubs.map((c) => c.fifa_rank);
  const uniqueRanks = new Set(ranks);
  results.push({
    rule: "DQ-FC4: fifa_rank values are unique in batch",
    passed: ranks.length === uniqueRanks.size,
    message: ranks.length === uniqueRanks.size
      ? "All FIFA ranks are unique"
      : `${ranks.length - uniqueRanks.size} duplicate fifa_rank values in batch`,
    affectedRows: ranks.length - uniqueRanks.size,
  });

  // DQ-5: world_cup_apps > 0 for clubs with any matches_played
  const badApps = clubs.filter(
    (c) => c.matches_played > 0 && c.world_cup_apps === 0
  );
  results.push({
    rule: "DQ-FC5: clubs with matches must have world_cup_apps > 0",
    passed: badApps.length === 0,
    message: badApps.length === 0
      ? "All clubs with matches have World Cup appearances"
      : `${badApps.length} clubs have matches but zero World Cup appearances`,
    affectedRows: badApps.length,
  });

  // DQ-6: head_coach and captain present for active clubs (world_cup_apps > 0)
  const missingStaff = clubs.filter(
    (c) => c.world_cup_apps > 0 && (!c.head_coach_2026 || !c.captain_2026)
  );
  results.push({
    rule: "DQ-FC6: active clubs have 2026 head_coach and captain",
    passed: missingStaff.length === 0,
    message: missingStaff.length === 0
      ? "All active clubs have 2026 staff set"
      : `${missingStaff.length} active clubs missing head_coach_2026 or captain_2026`,
    affectedRows: missingStaff.length,
  });

  const warnings = results.filter((r) => !r.passed);
  return { results, passedAll: warnings.length === 0, warnings };
}