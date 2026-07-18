// lib/ingestion/playerStatsRules.ts
// Injection validation + DQ checks for playerStats collection

import type { PlayerStatsCreateInput } from "../validations/playerStatsValidation";

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
export function validatePlayerStatsRecord(record: Record<string, unknown>): RecordValidationResult {
  const errors: RuleViolation[] = [];

  // XSS / injection guard
  const stringFields = ["player_name", "tournament", "gender", "format"];
  for (const field of stringFields) {
    const val = record[field];
    if (val !== null && val !== undefined && typeof val === "string") {
      // if (/<[^>]+>/.test(val) || /[<>"'`]/.test(val)) {
      //   errors.push({ name: field, errorMessage: `${field} contains disallowed characters` });
      // }
      if (/<[^>]+>/.test(val)) {
        errors.push({ name: field, errorMessage: `${field} contains HTML tags` });
      }
      if (val.length > 200) {
        errors.push({ name: field, errorMessage: `${field} exceeds max length` });
      }
    }
  }

  // player_name required
  if (!record.player_name || (typeof record.player_name === "string" && !record.player_name.trim())) {
    errors.push({ name: "player_name", errorMessage: "player_name is required" });
  }

  // Numeric fields must actually be numbers (WPL juniors fix strings → numbers)
  const numericFields = [
    "runs", "balls_faced", "fours", "sixes", "batting_dismissals",
    "wickets", "runs_conceded", "balls_bowled",
  ];
  for (const field of numericFields) {
    const val = record[field];
    if (val !== null && val !== undefined) {
      if (typeof val === "string") {
        errors.push({
          name: field,
          errorMessage: `${field} is a string — must be a number. Junior type-fix may not be complete.`,
        });
      } else if (typeof val === "number" && val < 0) {
        errors.push({ name: field, errorMessage: `${field} cannot be negative` });
      }
    }
  }

  // Derived field check: overs should be close to balls_bowled / 6
  const balls = Number(record.balls_bowled);
  const overs = Number(record.overs);
  if (!isNaN(balls) && !isNaN(overs) && balls > 0) {
    const expectedOvers = balls / 6;
   // AFTER
const normOvers = Math.round(overs * 10) / 10;
const normExpected = Math.round(expectedOvers * 10) / 10;
if (Math.abs(normOvers - normExpected) > 0.5) {
  errors.push({
    name: "overs",
    errorMessage: `overs (${overs}) deviates too far from balls_bowled/6 (${expectedOvers.toFixed(1)})`,
  });
}
  }

  return { valid: errors.length === 0, errors };
}

// ─── Batch DQ checks ──────────────────────────────────────────────────────────
export function runPlayerStatsDQChecks(records: PlayerStatsCreateInput[]): DQReport {
  const results: DQCheckResult[] = [];

  // DQ-PS1: No duplicate player_name within same tournament
  const seen = new Map<string, number>();
  for (const r of records) {
    const key = `${r.player_name}::${r.tournament}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, c]) => c > 1);
  results.push({
    rule: "DQ-PS1: No duplicate player+tournament in batch",
    passed: dupes.length === 0,
    message:
      dupes.length === 0
        ? "No duplicate player/tournament combos"
        : `${dupes.length} duplicate player+tournament combos: ${dupes.map(([k]) => k).join(", ")}`,
    affectedRows: dupes.length,
  });

  // DQ-PS2: strike_rate derivation check
  // const badSR = records.filter((r) => {
  //   if (r.balls_faced === 0) return false;
  //   const expected = (r.runs / r.balls_faced) * 100;
  //   return Math.abs(r.strike_rate - expected) > 5; // >5 point tolerance
  // });
  // AFTER
const badSR = records.filter((r) => {
  if (r.balls_faced === 0) return false;
  const expected = (r.runs / r.balls_faced) * 100;
  return Math.abs(r.strike_rate - expected) > 1;
});
  results.push({
    rule: "DQ-PS2: strike_rate consistent with runs/balls_faced",
    passed: badSR.length === 0,
    message:
      badSR.length === 0
        ? "All strike_rates are consistent"
        : `${badSR.length} players have strike_rate mismatch`,
    affectedRows: badSR.length,
  });

  // DQ-PS3: batting_average check
  const badBA = records.filter((r) => {
    if (r.batting_dismissals === 0) return false;
    const expected = r.runs / r.batting_dismissals;
    return Math.abs(r.batting_average - expected) > 2;
  });
  results.push({
    rule: "DQ-PS3: batting_average consistent with runs/dismissals",
    passed: badBA.length === 0,
    message:
      badBA.length === 0
        ? "All batting_averages are consistent"
        : `${badBA.length} players have batting_average mismatch`,
    affectedRows: badBA.length,
  });

  // DQ-PS4: economy check
  const badEcon = records.filter((r) => {
    if (r.overs === 0) return false;
    const expected = r.runs_conceded / r.overs;
    return Math.abs(r.economy - expected) > 1;
  });
  results.push({
    rule: "DQ-PS4: economy consistent with runs_conceded/overs",
    passed: badEcon.length === 0,
    message:
      badEcon.length === 0
        ? "All economy figures are consistent"
        : `${badEcon.length} players have economy mismatch`,
    affectedRows: badEcon.length,
  });

  // DQ-PS5: no nulls on core batting fields
  const nullCore = records.filter(
    (r) => r.runs === undefined || r.runs === null || r.balls_faced === undefined
  );
  results.push({
    rule: "DQ-PS5: Core batting fields present",
    passed: nullCore.length === 0,
    message:
      nullCore.length === 0
        ? "All core batting fields are present"
        : `${nullCore.length} records missing core batting fields`,
    affectedRows: nullCore.length,
  });


  const badBA2 = records.filter((r) => {
  if (r.wickets === 0) return false;
  const expected = r.runs_conceded / r.wickets;
  return Math.abs(r.bowling_average - expected) > 2;
});
results.push({
  rule: "DQ-PS6: bowling_average consistent with runs_conceded/wickets",
  passed: badBA2.length === 0,
  message:
    badBA2.length === 0
      ? "All bowling_averages are consistent"
      : `${badBA2.length} players have bowling_average mismatch`,
  affectedRows: badBA2.length,
});


  const warnings = results.filter((r) => !r.passed);
  return { results, passedAll: warnings.length === 0, warnings };
}