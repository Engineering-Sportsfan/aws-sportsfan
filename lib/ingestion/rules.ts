// lib/ingestion/rules.ts

export interface InjectionRule {
  name: string;
  validate: (record: MatchRecord) => boolean;
  errorMessage: string;
  severity: "error" | "warning";
}

export interface DQCheck {
  name: string;
  check: (collection: MatchRecord[]) => DQResult;
}

export interface DQResult {
  passed: boolean;
  message: string;
  details?: unknown;
}

export type MatchRecord = {
  [key: string]: unknown;
  matchId?: number;
  date?: string;
  season?: string;
  team1?: string;
  team2?: string;
  winner?: string | null;
  tossWinner?: string;
  tossDecision?: string;
  playerOfMatch?: string | null;
  inning1?: Record<string, unknown>;
  inning2?: Record<string, unknown>;
  inning3?: Record<string, unknown>;
  inning4?: Record<string, unknown>;
  inning5?: Record<string, unknown>;
  inning6?: Record<string, unknown>;
  target?: number;
  chaseSuccess?: boolean;
  isNoResult?: boolean;
};

const getNumber = (value: unknown) =>
  typeof value === "number" ? value : Number(value) || 0;

const getString = (value: unknown) =>
  typeof value === "string" ? value : "";

const getBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : value === "true" || value === "1";

const toInning = (input: unknown) => {
  if (typeof input !== "object" || input === null) return {} as Record<string, number>;
  const inning = input as Record<string, unknown>;
  return {
    runs: getNumber(inning.runs),
    wickets: getNumber(inning.wickets),
    powerplay: getNumber(inning.powerplay),
    middle: getNumber(inning.middle),
    death: getNumber(inning.death),
  };
};

// Data Quality Rules
export const dataQualityRules: DQCheck[] = [
  {
    name: "No duplicate match_ids",
    check: (matches: MatchRecord[]) => {
      const ids = matches.map((m) => getNumber(m.matchId));
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      return {
        passed: duplicates.length === 0,
        message: duplicates.length > 0 ? `Duplicate match_ids: ${[...new Set(duplicates)]}` : "No duplicates found",
        details: { duplicates: [...new Set(duplicates)] }
      };
    }
  },
  {
    name: "Valid chase_success logic",
    check: (matches: MatchRecord[]) => {
      const invalid = matches.filter((m) => {
        const chaseSuccess = getBoolean(m.chaseSuccess);
        const inning1 = toInning(m.inning1);
        const inning2 = toInning(m.inning2);
        return (
          chaseSuccess &&
          inning2.runs < inning1.runs &&
          !getBoolean(m.isNoResult)
        );
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} matches have invalid chase_success` : "All chase logic valid",
        details: { invalidMatchIds: invalid.map(m => m.matchId) }
      };
    }
  },
  {
    name: "Valid wickets count",
    check: (matches: MatchRecord[]) => {
      const invalid = matches.filter((m) => {
        const inning1 = toInning(m.inning1);
        const inning2 = toInning(m.inning2);
        return inning1.wickets > 10 || inning2.wickets > 10;
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} matches have invalid wicket counts` : "All wicket counts valid",
        details: { invalidMatchIds: invalid.map(m => m.matchId) }
      };
    }
  },
  {
    name: "Valid phase sum",
    check: (matches: MatchRecord[]) => {
      const tolerance = 5;
      const invalid = matches.filter((m) => {
        const inning1 = toInning(m.inning1);
        const inning2 = toInning(m.inning2);
        const sum1 = inning1.powerplay + inning1.middle + inning1.death;
        const sum2 = inning2.powerplay + inning2.middle + inning2.death;
        return (
          Math.abs(inning1.runs - sum1) > tolerance ||
          Math.abs(inning2.runs - sum2) > tolerance
        );
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} matches have phase sum mismatch` : "All phase sums valid",
        details: { invalidMatchIds: invalid.map(m => m.matchId) }
      };
    }
  },
  {
    name: "Season format consistency",
    check: (matches: MatchRecord[]) => {
      const seasonPattern = /^\d{4}(\/\d{2})?$/;
      const invalid = matches.filter((m) => !seasonPattern.test(getString(m.season)));
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} matches have invalid season format` : "All season formats valid",
        details: { invalidSeasons: [...new Set(invalid.map(m => m.season))] }
      };
    }
  },
  {
    name: "Date range validity",
    check: (matches: MatchRecord[]) => {
      const minDate = new Date("2007-01-01");
      const maxDate = new Date("2027-12-31");
      const invalid = matches.filter((m) => {
        const dateValue = getString(m.date);
        const date = new Date(dateValue);
        return dateValue === "" || date < minDate || date > maxDate;
      });
      return {
        passed: invalid.length === 0,
        message: invalid.length > 0 ? `${invalid.length} matches have invalid dates` : "All dates valid",
        details: { invalidDates: invalid.map(m => ({ matchId: m.matchId, date: m.date })) }
      };
    }
  }
];

// Injection Rules
export const injectionRules: InjectionRule[] = [
  {
    name: "Required fields present",
    validate: (record: MatchRecord) => {
      const required = ["matchId", "date", "season", "team1", "team2"];
      return required.every((field) => record[field] !== undefined && record[field] !== null);
    },
    errorMessage: "Missing required field",
    severity: "error"
  },
  {
    name: "Team names not empty",
    validate: (record: MatchRecord) => {
      const team1 = getString(record.team1);
      const team2 = getString(record.team2);
      return team1.trim().length > 0 && team2.trim().length > 0;
    },
    errorMessage: "Team names cannot be empty",
    severity: "error"
  },
  {
    name: "Valid toss decision",
    validate: (record: MatchRecord) => {
      return ["bat", "field"].includes(getString(record.tossDecision));
    },
    errorMessage: "Toss decision must be 'bat' or 'field'",
    severity: "error"
  },
  {
    name: "Winner consistency",
    validate: (record: MatchRecord) => {
      if (getBoolean(record.isNoResult)) {
        const winner = getString(record.winner);
        return winner === "" || winner === "No Result";
      }
      return true;
    },
    errorMessage: "No Result matches must have winner = null or 'No Result'",
    severity: "warning"
  },
  {
    name: "Target calculation",
    validate: (record: MatchRecord) => {
      if (!getBoolean(record.isNoResult) && !getBoolean(record.chaseSuccess)) {
        const target = getNumber(record.target);
        const inning1 = toInning(record.inning1);
        return target === inning1.runs + 1;
      }
      return true;
    },
    errorMessage: "Target should be innings1 runs + 1 for chases",
    severity: "warning"
  }
];

// Run all DQ checks
export function runDQChecks(matches: MatchRecord[]): { passed: boolean; results: DQResult[] } {
  const results = dataQualityRules.map((rule) => rule.check(matches));
  const passed = results.every(r => r.passed);
  return { passed, results };
}

// Validate record against all injection rules
export function validateRecord(record: MatchRecord): { valid: boolean; errors: InjectionRule[] } {
  const failedRules = injectionRules.filter((rule) => !rule.validate(record));
  return { valid: failedRules.length === 0, errors: failedRules };
}