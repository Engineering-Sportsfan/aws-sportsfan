// lib/ingestion/matchRules.ts
// Injection validation + DQ checks for the matches collection

import type { MatchCreateInput, InningsCreateInput } from "../validations/matchValidation";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RuleViolation {
  name: string;
  errorMessage: string;
}

export interface RecordValidationResult {
  valid: boolean;
  errors: RuleViolation[];
}

export interface DQCheckResult {
  rule: string;
  passed: boolean;
  message: string;
  affectedRows?: number;
}

export interface DQReport {
  results: DQCheckResult[];
  passedAll: boolean;
  warnings: DQCheckResult[];
}

// ─── Per-record injection rules ───────────────────────────────────────────────
// These run BEFORE Zod — fast guards against obviously bad data
export function validateMatchRecord(record: Record<string, unknown>): RecordValidationResult {
  const errors: RuleViolation[] = [];

  // Injection / XSS guard on string fields
  const stringFields = ["match_id", "team1", "team2", "venue", "city", "winner",
    "toss_winner", "player_of_match", "tournament", "gender", "format"];
  for (const field of stringFields) {
    const val = record[field];
    if (val !== null && val !== undefined && typeof val === "string") {
      // if (/<[^>]+>/.test(val) || /[<>"'`]/.test(val)) {
      //   errors.push({ name: field, errorMessage: `${field} contains disallowed characters` });
      // }
      // Replace the existing regex with this:
      if (/<[^>]*script/i.test(val) || /javascript:/i.test(val) || /on\w+\s*=/i.test(val)) {
        errors.push({ name: field, errorMessage: `${field} contains suspicious content` });
      }
      if (val.length > 200) {
        errors.push({ name: field, errorMessage: `${field} exceeds max length of 200` });
      }
    }
  }

  // Required fields must be present
  const required = ["match_id", "date", "team1", "team2", "tournament", "gender", "format"];
  for (const field of required) {
    if (!record[field] && record[field] !== 0) {
      errors.push({ name: field, errorMessage: `${field} is required` });
    }
  }

  // Date format guard
  if (record.date && typeof record.date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      errors.push({ name: "date", errorMessage: "date must be YYYY-MM-DD format" });
    }
  }

  // teams cannot be identical
  if (record.team1 && record.team2 && record.team1 === record.team2) {
    errors.push({ name: "team1/team2", errorMessage: "team1 and team2 must be different" });
  }

  // target must be positive if present
  if (record.target !== null && record.target !== undefined) {
    const t = Number(record.target);
    if (isNaN(t) || t < 0) {
      errors.push({ name: "target", errorMessage: "target must be a non-negative number" });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Per-record innings rules ─────────────────────────────────────────────────
export function validateInningsRecord(innings: Record<string, unknown>): RecordValidationResult {
  const errors: RuleViolation[] = [];

  if (innings.wickets !== null && innings.wickets !== undefined) {
    const w = Number(innings.wickets);
    if (w < 0 || w > 10) {
      errors.push({ name: "wickets", errorMessage: "wickets must be 0–10" });
    }
  }

  if (innings.runs !== null && innings.runs !== undefined) {
    const r = Number(innings.runs);
    if (r < 0) {
      errors.push({ name: "runs", errorMessage: "runs must be non-negative" });
    }
  }

  if (innings.innings_no !== undefined) {
    const n = Number(innings.innings_no);
    if (![1, 2, 3, 4].includes(n)) {
      errors.push({ name: "innings_no", errorMessage: "innings_no must be 1, 2, 3, or 4" });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Batch DQ checks (run after successful writes on the batch) ───────────────
export function runMatchDQChecks(
  matches: MatchCreateInput[],
  innings: InningsCreateInput[]
): DQReport {
  const results: DQCheckResult[] = [];

  // DQ-1: Every match should have at least 1 innings record
  const matchesWithInnings = new Set(innings.map((i) => (i as Record<string, unknown>).match_id));
  const matchesWithoutInnings = matches.filter((m) => !matchesWithInnings.has(m.match_id));
  results.push({
    rule: "DQ-M1: Every match has innings",
    passed: matchesWithoutInnings.length === 0,
    message:
      matchesWithoutInnings.length === 0
        ? "All matches have at least one innings record"
        : `${matchesWithoutInnings.length} matches missing innings data`,
    affectedRows: matchesWithoutInnings.length,
  });

  // DQ-2: no_result matches should have null winner
  const badNoResult = matches.filter(
    (m) => m.match_result === "no_result" && m.winner !== null
  );
  results.push({
    rule: "DQ-M2: no_result matches have null winner",
    passed: badNoResult.length === 0,
    message:
      badNoResult.length === 0
        ? "All no_result matches have null winner"
        : `${badNoResult.length} no_result matches incorrectly have a winner set`,
    affectedRows: badNoResult.length,
  });

  // DQ-3: season should be consistent with date year (within ±1 for early-year matches)
  const badSeason = matches.filter((m) => {
    const dateYear = parseInt(m.date.slice(0, 4), 10);
    return Math.abs(m.season - dateYear) > 1;
  });
  results.push({
    rule: "DQ-M3: season consistent with date",
    passed: badSeason.length === 0,
    message:
      badSeason.length === 0
        ? "All seasons are consistent with dates"
        : `${badSeason.length} matches have season/date mismatch`,
    affectedRows: badSeason.length,
  });

  // DQ-4: No duplicate match_ids in batch
  const ids = matches.map((m) => m.match_id);
  const uniqueIds = new Set(ids);
  results.push({
    rule: "DQ-M4: No duplicate match_ids in batch",
    passed: ids.length === uniqueIds.size,
    message:
      ids.length === uniqueIds.size
        ? "All match_ids are unique"
        : `${ids.length - uniqueIds.size} duplicate match_ids found in batch`,
    affectedRows: ids.length - uniqueIds.size,
  });

  // DQ-5: All innings runs > 0 for completed matches
  const zeroRunInnings = innings.filter((i) => i.runs !== null && i.runs === 0);
  results.push({
    rule: "DQ-M5: Innings runs > 0 (warning only)",
    passed: true, // warning, not hard fail
    message:
      zeroRunInnings.length > 0
        ? `${zeroRunInnings.length} innings have 0 runs — verify if intentional`
        : "No zero-run innings",
    affectedRows: zeroRunInnings.length,
  });

  const warnings = results.filter((r) => !r.passed);
  return { results, passedAll: warnings.length === 0, warnings };
}