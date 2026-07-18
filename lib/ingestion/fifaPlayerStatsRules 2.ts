// lib/ingestion/fifaPlayerStatsRules.ts

export interface FifaPlayerStatsInjectionRule {
  name: string;
  validate: (record: FifaPlayerStatsRecord) => boolean;
  errorMessage: string;
  severity: "error" | "warning";
}

export interface FifaPlayerStatsDQCheck {
  name: string;
  check: (collection: FifaPlayerStatsRecord[]) => FifaPlayerStatsDQResult;
}

export interface FifaPlayerStatsDQResult {
  passed: boolean;
  message: string;
  details?: unknown;
}

export type FifaPlayerStatsRecord = {
  [key: string]: unknown;
  player_name?: string;
  team?: string;
  position?: string;
  matches_played?: number;
  minutes_played?: number;
  goals?: number;
  assists?: number;
  shots?: number;
  shots_on_target?: number;
  shot_conversion_pct?: number;
  xg?: number;
  xa?: number;
  dribbles_completed?: number;
  key_passes?: number;
  chances_created?: number;
  big_chances_created?: number;
};

const getNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value) || 0;

const getString = (value: unknown): string =>
  typeof value === "string" ? value : "";

// Data Quality Rules
export const fifaPlayerStatsDQRules: FifaPlayerStatsDQCheck[] = [
  {
    name: "No duplicate players per team",
    check: (stats: FifaPlayerStatsRecord[]) => {
      const keys = stats.map((s) => `${getString(s.player_name).toLowerCase()}|${getString(s.team).toLowerCase()}`);
      const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
      return {
        passed: duplicates.length === 0,
        message: duplicates.length > 0 ? `Duplicate player-team combinations found` : "No duplicates found",
        details: { duplicates: [...new Set(duplicates)] }
      };
    }
  },
  {
    name: "Valid shot conversion rate",
    check: (stats: FifaPlayerStatsRecord[]) => {
      const invalid = stats.filter((s) => {
        const goals = getNumber(s.goals);
        const shots = getNumber(s.shots);
        const conversion = getNumber(s.shot_conversion_pct);
        if (shots > 0) {
          const calculated = (goals / shots) * 100;
          return Math.abs(calculated - conversion) > 5;
        }
        return false;
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} players have inconsistent shot conversion rates` : "All conversion rates valid",
        details: { invalidPlayers: invalid.map(s => s.player_name) }
      };
    }
  },
  {
    name: "Valid minutes vs matches",
    check: (stats: FifaPlayerStatsRecord[]) => {
      const invalid = stats.filter((s) => {
        const matches = getNumber(s.matches_played);
        const minutes = getNumber(s.minutes_played);
        return minutes > matches * 90;
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} players have minutes exceeding possible playing time` : "All minutes valid",
        details: { invalidPlayers: invalid.map(s => s.player) }
      };
    }
  },
  {
    name: "Non-negative stats",
    check: (stats: FifaPlayerStatsRecord[]) => {
      const invalid = stats.filter((s) => {
        return getNumber(s.goals) < 0 ||
               getNumber(s.assists) < 0 ||
               getNumber(s.shots) < 0 ||
               getNumber(s.dribblesCompleted) < 0 ||
               getNumber(s.keyPasses) < 0;
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} players have negative stats` : "All stats non-negative",
        details: { invalidPlayers: invalid.map(s => s.player) }
      };
    }
  }
];

// Injection Rules
export const fifaPlayerStatsInjectionRules: FifaPlayerStatsInjectionRule[] = [
  {
    name: "Player name present",
    validate: (record: FifaPlayerStatsRecord) => {
      return getString(record.player_name).trim().length > 0;
    },
    errorMessage: "Player name is required",
    severity: "error"
  },
  {
    name: "Team name present",
    validate: (record: FifaPlayerStatsRecord) => {
      return getString(record.team).trim().length > 0;
    },
    errorMessage: "Team name is required",
    severity: "error"
  },
  {
    name: "Position present",
    validate: (record: FifaPlayerStatsRecord) => {
      const position = getString(record.position);
      return ["FW", "MF", "DF", "GK"].includes(position);
    },
    errorMessage: "Position must be FW, MF, DF, or GK",
    severity: "error"
  },
  {
    name: "Valid matches played",
    validate: (record: FifaPlayerStatsRecord) => {
      return getNumber(record.matchesPlayed) >= 0 && getNumber(record.matchesPlayed) <= 7;
    },
    errorMessage: "Matches played should be between 0 and 7",
    severity: "warning"
  }
];

// Run all DQ checks
export function runFifaPlayerStatsDQChecks(stats: FifaPlayerStatsRecord[]): { passed: boolean; results: FifaPlayerStatsDQResult[] } {
  const results = fifaPlayerStatsDQRules.map((rule) => rule.check(stats));
  const passed = results.every(r => r.passed);
  return { passed, results };
}

// Validate record against all injection rules
export function validateFifaPlayerStatsRecord(record: FifaPlayerStatsRecord): { valid: boolean; errors: FifaPlayerStatsInjectionRule[] } {
  const failedRules = fifaPlayerStatsInjectionRules.filter((rule) => !rule.validate(record));
  return { valid: failedRules.length === 0, errors: failedRules };
}