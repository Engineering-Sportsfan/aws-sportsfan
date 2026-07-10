// lib/ingestion/fifaExcelParser.ts
// Parses FIFA match and player stats Excel/CSV files

import * as XLSX from "xlsx";

export interface ParseResult<T> {
  rows: T[];
  rowCount: number;
  warnings: string[];
}

// ─── Core parser ──────────────────────────────────────────────────────────────
export function parseFifaExcelBuffer(buffer: Buffer, filename: string): ParseResult<Record<string, unknown>> {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

  const isPlayerFile = filename.toLowerCase().includes("player") || filename.toLowerCase().includes("stats");

  const rows = raw.map((row) => {
    const cleaned = normaliseRow(row);

    // Auto-inject classification fields if not already present
    if (!cleaned.tournament) cleaned.tournament = "mens_fifa_wc_2022";
    if (!cleaned.gender) cleaned.gender = "male";
    if (!cleaned.format) cleaned.format = "international";
    if (!cleaned.season) cleaned.season = 2022;

    // Coerce numeric fields
    const numericFields = isPlayerFile
      ? ["matches_played", "minutes_played", "goals", "assists", "shots",
        "shots_on_target", "shot_conversion_pct", "xg", "xa",
        "dribbles_completed", "key_passes", "chances_created", "big_chances_created", "season"]
      : ["season", "match_day", "goals_team1", "goals_team2",
        "goals_team1_pens", "goals_team2_pens"];

    for (const field of numericFields) {
      if (cleaned[field] !== null && cleaned[field] !== undefined) {
        const n = Number(cleaned[field]);
        if (!isNaN(n)) cleaned[field] = n;
      }
    }

    // Round shot_conversion_pct to 2dp
    if (cleaned.shot_conversion_pct !== null && cleaned.shot_conversion_pct !== undefined) {
      cleaned.shot_conversion_pct = parseFloat(Number(cleaned.shot_conversion_pct).toFixed(2));
    }

    if (row.winner === "Draw") {
      row.winner = null;
      row.winner_code = null;
    }

    const isPenMatch = row.match_result === "Home Win (Pens)" || row.match_result === "Away Win (Pens)";
    if (!isPenMatch) {
      row.goals_team1_pens = null;
      row.goals_team2_pens = null;
    }

    // xg and xa to 1dp
    for (const field of ["xg", "xa"]) {
      if (cleaned[field] !== null && cleaned[field] !== undefined) {
        cleaned[field] = parseFloat(Number(cleaned[field]).toFixed(1));
      }
    }

    return cleaned;
  });

  return { rows, rowCount: rows.length, warnings };
}

// ─── Row normaliser ───────────────────────────────────────────────────────────
function normaliseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    // snake_case, strip % symbol from column names
    const normKey = key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_")
      .replace(/%/g, "pct")
      .replace(/[^a-z0-9_]/g, "");

    // Known renames from raw file headers
    const renames: Record<string, string> = {
      player: "player_name",
      shot_conversion_pct: "shot_conversion_pct",
      xg: "xg",
      xa: "xa",
      matches_played: "matches_played",
      minutes_played: "minutes_played",
      dribbles_completed: "dribbles_completed",
      key_passes: "key_passes",
      chances_created: "chances_created",
      big_chances_created: "big_chances_created",
    };

    const finalKey = renames[normKey] ?? normKey;
    out[finalKey] = val === "" || val === "null" || val === "NULL" ? null : val;
  }
  return out;
}