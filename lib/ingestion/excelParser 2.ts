// lib/ingestion/excelParser.ts
// Parses uploaded Excel / CSV files → normalised JS objects ready for validation
// Handles all 4 tournament files as described in Junior prep tasks

import * as XLSX from "xlsx";
import type { Tournament, Gender, MatchFormat } from "../../app/models/match";

export interface ParsedMatch {
  [key: string]: unknown;
}

export interface ParsedPlayerStats {
  [key: string]: unknown;
}

export interface ParseResult<T> {
  rows: T[];
  sheetName: string;
  rowCount: number;
  warnings: string[];
}

// ─── Tournament file configs ──────────────────────────────────────────────────
export const FILE_CONFIGS: Record<
  string,
  { tournament: Tournament; gender: Gender; format: MatchFormat; collection: "matches" | "playerStats" }
> = {
  ipl_processed: {
    tournament: "mens_ipl",
    gender: "male",
    format: "T20",
    collection: "matches",
  },
  women_worldcup_processed: {
    tournament: "womens_wc",
    gender: "female",
    format: "T20",
    collection: "matches",
  },
  wpl_player_stats: {
    tournament: "womens_ipl",
    gender: "female",
    format: "T20",
    collection: "playerStats",
  },
  Womens_T20I_Player_Stats: {
    tournament: "womens_t20i",
    gender: "female",
    format: "T20",
    collection: "playerStats",
  },
};

// ─── Detect file config from filename ────────────────────────────────────────
export function detectFileConfig(filename: string) {
  for (const [key, config] of Object.entries(FILE_CONFIGS)) {
    if (filename.includes(key)) return config;
  }
  return null;
}

// ─── Core parser ─────────────────────────────────────────────────────────────
export function parseExcelBuffer(
  buffer: Buffer,
  filename: string,
  sheetName?: string
): ParseResult<ParsedMatch | ParsedPlayerStats> {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const targetSheet = sheetName ?? wb.SheetNames[0];
  if (!wb.SheetNames.includes(targetSheet)) {
    throw new Error(`Sheet "${targetSheet}" not found. Available: ${wb.SheetNames.join(", ")}`);
  }

  const ws = wb.Sheets[targetSheet];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
    defval: null,
    raw: false, // parse numbers as JS numbers
  });

  // Detect config from filename
  const config = detectFileConfig(filename);

  const rows = raw.map((row, idx) => {
    const cleaned = normaliseRow(row, idx, warnings);

    // Inject tournament / gender / format if not already present (junior may have added them)
    if (config) {
      if (!cleaned.tournament) cleaned.tournament = config.tournament;
      if (!cleaned.gender) cleaned.gender = config.gender;
      if (!cleaned.format) cleaned.format = config.format;
    }

    // Derive overs if missing (T20I file)
    if (cleaned.balls_bowled != null && cleaned.overs == null) {
      const balls = Number(cleaned.balls_bowled);
      if (!isNaN(balls)) cleaned.overs = parseFloat((balls / 6).toFixed(1));
    }

    // Derive season from date if missing
    if (cleaned.date && !cleaned.season) {
      const year = parseInt(String(cleaned.date).slice(0, 4), 10);
      if (!isNaN(year)) cleaned.season = year;
    }

    // Coerce numeric strings that juniors may have missed
    const numericFields = [
      "runs", "balls_faced", "fours", "sixes", "batting_dismissals",
      "wickets", "runs_conceded", "balls_bowled", "overs",
      "strike_rate", "batting_average", "economy", "bowling_average",
      "target", "season",
    ];
    for (const field of numericFields) {
      if (cleaned[field] !== null && cleaned[field] !== undefined) {
        const n = Number(cleaned[field]);
        if (!isNaN(n)) cleaned[field] = n;
      }
    }

    return cleaned;
  });

  return { rows, sheetName: targetSheet, rowCount: rows.length, warnings };
}


// ─── Parse innings sheet ──────────────────────────────────────────────────────
export function parseInningsSheet(buffer: Buffer): ParseResult<Record<string, unknown>> {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer" });

  const sheetName = wb.SheetNames.includes("innings") ? "innings" : wb.SheetNames[1];
  if (!sheetName) throw new Error("No innings sheet found");

  const ws = wb.Sheets[sheetName];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

  const rows = raw.map((row, idx) => {
    const cleaned = normaliseRow(row, idx, warnings);
    // Ensure innings_no is a number
    if (cleaned.innings_no != null) cleaned.innings_no = Number(cleaned.innings_no);
    const numericFields = ["runs", "wickets", "powerplay", "middle_overs", "death_overs",
      "dots", "fours", "sixes", "extras", "highest_over"];
    for (const f of numericFields) {
      if (cleaned[f] != null) {
        const n = Number(cleaned[f]);
        cleaned[f] = isNaN(n) ? null : n;
      }
    }
    return cleaned;
  });

  return { rows, sheetName, rowCount: rows.length, warnings };
}

// ─── Row normaliser ───────────────────────────────────────────────────────────
function normaliseRow(
  row: Record<string, unknown>,
  _idx: number,
  _warnings: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    // snake_case the key
    const normKey = key.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
    // Treat empty string and "null" string as null
    if (val === "" || val === "null" || val === "NULL") {
      out[normKey] = null;
    } else {
      out[normKey] = val;
    }
  }
  return out;
}

// ─── CSV parser (for wpl_player_stats.csv) ───────────────────────────────────
export function parseCSVBuffer(buffer: Buffer, filename: string): ParseResult<ParsedPlayerStats> {
  // XLSX can parse CSV too
  const wb = XLSX.read(buffer, { type: "buffer" });
  return parseExcelBuffer(buffer, filename, wb.SheetNames[0]);
}