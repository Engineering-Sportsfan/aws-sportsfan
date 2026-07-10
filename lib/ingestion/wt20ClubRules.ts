// lib/ingestion/wt20ClubRules.ts

import type { WT20ClubCreateInput } from "../validations/wt20ClubValidation";

export interface RuleViolation { name: string; errorMessage: string; }
export interface RecordValidationResult { valid: boolean; errors: RuleViolation[]; }
export interface DQCheckResult { rule: string; passed: boolean; message: string; affectedRows?: number; }
export interface DQReport { results: DQCheckResult[]; passedAll: boolean; warnings: DQCheckResult[]; }

// ─── Per-record injection / field rules ───────────────────────────────────────
export function validateWT20ClubRecord(record: Record<string, unknown>): RecordValidationResult {
  const errors: RuleViolation[] = [];

  // XSS / injection guard on all string fields
  const stringFields = [
    "club_id", "country", "recent_form", "current_captain",
    "head_coach", "featured_player", "best_tournament_finish",
    "tournament", "gender", "format", "source_file",
  ];
  for (const field of stringFields) {
    const val = record[field];
    // if (val !== null && val !== undefined && typeof val === "string") {
    //   if (/<[^>]+>/.test(val) || /[<>"'`]/.test(val)) {
    //     errors.push({ name: field, errorMessage: `${field} contains disallowed characters` });
    //   }
    //   if (val.length > 300) {
    //     errors.push({ name: field, errorMessage: `${field} exceeds max length of 300` });
    //   }
    // }
    if (val !== null && val !== undefined && typeof val === "string") {
  // Only block HTML tags and backticks, allow quotes, apostrophes, and hyphens
  if (/<[^>]+>/.test(val) || /[<>`]/.test(val)) {
    errors.push({ name: field, errorMessage: `${field} contains disallowed characters` });
  }
  if (val.length > 300) {
    errors.push({ name: field, errorMessage: `${field} exceeds max length of 300` });
  }
}
  }

  // Required fields
  const required = [
    "club_id", "country", "icc_ranking", "rating_points",
    "apps", "matches", "won", "lost", "tied_so", "no_result",
    "win_pct", "tournament", "gender", "format",
  ];
  for (const field of required) {
    if (record[field] === null || record[field] === undefined || record[field] === "") {
      errors.push({ name: field, errorMessage: `${field} is required` });
    }
  }

  // club_id must be 2–3 chars and match pattern like AUS
  if (record.club_id && typeof record.club_id === "string") {
    if (record.club_id.length < 2 || record.club_id.length > 3) {
      errors.push({ name: "club_id", errorMessage: "club_id must be 2–3 characters (e.g. AUS)" });
    }
    if (!/^[A-Z]{2,3}$/.test(record.club_id)) {
      errors.push({ name: "club_id", errorMessage: "club_id must match pattern like AUS, IND" });
    }
  }

  // Non-negative integer fields
  const nonNegInt = ["apps", "matches", "won", "lost", "tied_so", "no_result", "icc_ranking", "rating_points"];
  for (const field of nonNegInt) {
    if (record[field] !== null && record[field] !== undefined) {
      const v = Number(record[field]);
      if (isNaN(v) || v < 0 || !Number.isInteger(v)) {
        errors.push({ name: field, errorMessage: `${field} must be a non-negative integer` });
      }
    }
  }

  // win_pct must be 0–1
  if (record.win_pct !== null && record.win_pct !== undefined) {
    const wp = Number(record.win_pct);
    if (isNaN(wp) || wp < 0 || wp > 1) {
      errors.push({ name: "win_pct", errorMessage: "win_pct must be between 0 and 1" });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Batch DQ checks ──────────────────────────────────────────────────────────
export function runWT20ClubDQChecks(clubs: WT20ClubCreateInput[]): DQReport {
  const results: DQCheckResult[] = [];

  // DQ-1: matches must equal won + lost + tied_so + no_result
  const badRecord = clubs.filter(
    (c) => c.matches !== c.won + c.lost + c.tied_so + c.no_result
  );
  results.push({
    rule: "DQ-WT1: matches = won + lost + tied_so + no_result",
    passed: badRecord.length === 0,
    message: badRecord.length === 0
      ? "All match records are consistent"
      : `${badRecord.length} clubs have inconsistent match record totals (${badRecord.map(c => c.club_id).join(", ")})`,
    affectedRows: badRecord.length,
  });

  // DQ-2: win_pct must be consistent with outcomes
  // win_pct = won / (matches - no_result), skipping clubs with 0 countable matches
  const badWinPct = clubs.filter((c) => {
    const countable = c.matches - c.no_result;
    if (countable === 0) return false;
    const expected = parseFloat((c.won / countable).toFixed(4));
    return Math.abs(c.win_pct - expected) > 0.005; // allow 0.5% rounding tolerance
  });
  results.push({
    rule: "DQ-WT2: win_pct ≈ won / (matches - no_result)",
    passed: badWinPct.length === 0,
    message: badWinPct.length === 0
      ? "All win percentages are consistent"
      : `${badWinPct.length} clubs have inconsistent win_pct (${badWinPct.map(c => c.club_id).join(", ")})`,
    affectedRows: badWinPct.length,
  });

  // DQ-3: no duplicate club_ids in batch
  const ids = clubs.map((c) => c.club_id);
  const uniqueIds = new Set(ids);
  results.push({
    rule: "DQ-WT3: no duplicate club_ids in batch",
    passed: ids.length === uniqueIds.size,
    message: ids.length === uniqueIds.size
      ? "All club_ids are unique"
      : `${ids.length - uniqueIds.size} duplicate club_ids in batch`,
    affectedRows: ids.length - uniqueIds.size,
  });

  // DQ-4: icc_ranking must be unique within batch
  const ranks = clubs.map((c) => c.icc_ranking);
  const uniqueRanks = new Set(ranks);
  results.push({
    rule: "DQ-WT4: icc_ranking values are unique in batch",
    passed: ranks.length === uniqueRanks.size,
    message: ranks.length === uniqueRanks.size
      ? "All ICC rankings are unique"
      : `${ranks.length - uniqueRanks.size} duplicate icc_ranking values in batch`,
    affectedRows: ranks.length - uniqueRanks.size,
  });

  // DQ-5: apps > 0 for clubs with any matches
  const badApps = clubs.filter((c) => c.matches > 0 && c.apps === 0);
  results.push({
    rule: "DQ-WT5: clubs with matches must have apps > 0",
    passed: badApps.length === 0,
    message: badApps.length === 0
      ? "All clubs with matches have tournament appearances"
      : `${badApps.length} clubs have matches but zero appearances (${badApps.map(c => c.club_id).join(", ")})`,
    affectedRows: badApps.length,
  });

  // DQ-6: captain and coach present for active clubs
  const missingStaff = clubs.filter(
    (c) => c.apps > 0 && (!c.current_captain || !c.head_coach)
  );
  results.push({
    rule: "DQ-WT6: active clubs have current_captain and head_coach",
    passed: missingStaff.length === 0,
    message: missingStaff.length === 0
      ? "All active clubs have captain and coach set"
      : `${missingStaff.length} active clubs missing current_captain or head_coach (${missingStaff.map(c => c.club_id).join(", ")})`,
    affectedRows: missingStaff.length,
  });

  // DQ-7: recent_form only contains valid characters (W, L, T, N, -, space)
  const badForm = clubs.filter(
    (c) => c.recent_form && !/^[WLTN-](-[WLTN])*$/.test(c.recent_form)
  );
  results.push({
    rule: "DQ-WT7: recent_form format is valid (W/L/T/N separated by -)",
    passed: badForm.length === 0,
    message: badForm.length === 0
      ? "All recent_form values are valid"
      : `${badForm.length} clubs have malformed recent_form (${badForm.map(c => `${c.club_id}:${c.recent_form}`).join(", ")})`,
    affectedRows: badForm.length,
  });

  const warnings = results.filter((r) => !r.passed);
  return { results, passedAll: warnings.length === 0, warnings };
}

// ─── Daily incremental DQ checks ─────────────────────────────────────────────
// Validates a 2-club daily update sheet before writing
export interface DailyClubPatch {
  club_id: string;
  matches: number;
  won: number;
  lost: number;
  tied_so: number;
  no_result: number;
  win_pct: number;
  recent_form?: string | null;
  match_day: number;
}

export function runDailyDQChecks(
  patches: DailyClubPatch[],
  existingMap: Map<string, { matches: number; won: number; lost: number; tied_so: number; no_result: number }>
): DQReport {
  const results: DQCheckResult[] = [];

  // DDQ-1: exactly 2 clubs in a daily patch (one match = 2 teams)
  results.push({
    rule: "DDQ-1: daily patch must have exactly 2 clubs",
    passed: patches.length === 2,
    message: patches.length === 2
      ? "Correct — 2 clubs in this patch"
      : `Expected 2 clubs, got ${patches.length}`,
    affectedRows: Math.abs(patches.length - 2),
  });

  // DDQ-2: each club's new totals must be exactly +1 match vs Firestore
  const badDelta = patches.filter((p) => {
    const existing = existingMap.get(p.club_id);
    if (!existing) return false; // new club; skip delta check
    return p.matches !== existing.matches + 1;
  });
  results.push({
    rule: "DDQ-2: matches increments by exactly 1 per club",
    passed: badDelta.length === 0,
    message: badDelta.length === 0
      ? "Both clubs show +1 match increment"
      : `${badDelta.length} clubs have unexpected match count delta (${badDelta.map(c => c.club_id).join(", ")})`,
    affectedRows: badDelta.length,
  });

  // DDQ-3: one club's won must increment, the other's lost/tied must increment (no both won)
  if (patches.length === 2) {
    const [a, b] = patches;
    const aExist = existingMap.get(a.club_id);
    const bExist = existingMap.get(b.club_id);
    if (aExist && bExist) {
      const aWonDelta = a.won - aExist.won;
      const bWonDelta = b.won - bExist.won;
      const bothWon = aWonDelta === 1 && bWonDelta === 1;
      const neitherWon = aWonDelta === 0 && bWonDelta === 0;
      results.push({
        rule: "DDQ-3: match outcome is valid (one win, one loss/tie — or both tie)",
        passed: !bothWon && !neitherWon,
        message: bothWon
          ? "Both clubs show +1 win — impossible for a single match"
          : neitherWon
            ? "Neither club shows a win/tie increment — check outcomes"
            : "Match outcome delta is valid",
        affectedRows: bothWon || neitherWon ? 2 : 0,
      });
    }
  }

  // DDQ-4: win_pct consistency on patched records
  const badWinPct = patches.filter((p) => {
    const countable = p.matches - p.no_result;
    if (countable === 0) return false;
    const expected = parseFloat((p.won / countable).toFixed(4));
    return Math.abs(p.win_pct - expected) > 0.005;
  });
  results.push({
    rule: "DDQ-4: win_pct ≈ won / (matches - no_result) after patch",
    passed: badWinPct.length === 0,
    message: badWinPct.length === 0
      ? "win_pct is consistent for both clubs"
      : `${badWinPct.length} clubs have inconsistent win_pct after patch`,
    affectedRows: badWinPct.length,
  });

  const warnings = results.filter((r) => !r.passed);
  return { results, passedAll: warnings.length === 0, warnings };
}