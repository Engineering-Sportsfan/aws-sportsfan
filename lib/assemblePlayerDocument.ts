// lib/assemblePlayerDocument.ts
//
// Merges a player's MS_Players profile item + its MS_Transactions stats
// row(s) back into ONE flat JSON, shaped like the original LLM draft
// (coreInfo / record_highlight / analytics) — this is the "recombine at
// read time" step: we store profile and stats in separate tables/items,
// but the frontend/API consumer should never have to know that.
//
// Use this from GET /api/ms_players/[id] instead of returning
// { profile, stats } as two separate blobs.

interface PlayerProfileItem {
  entityId: string;
  sk: string;
  playerId: string;
  name: string;
  role?: string | null;
  battingStyle?: string | null;
  bowlingStyle?: string | null;
  isCaptain?: boolean;
  currentClubId?: string | null;
  sportId?: string;
  format?: string;
  testCaps?: number | null;
  dateOfBirth?: string | null;
  birthPlace?: string | null;
  heightCm?: number | null;
  profileImage?: string | null;
  country?: string | null;
  flag?: string | null;
  [key: string]: unknown;
}

interface PlayerStatsItem {
  entityId: string;
  sk: string; // AFFIL#<sportId>#<levelFormatId>#<format>#STATS
  playerId: string;
  clubId?: string | null;
  sportId: string;
  levelFormatId: string;
  format: string;
  battingStats?: Record<string, unknown> | null;
  bowlingStats?: Record<string, unknown> | null;
  recordHighlight?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * Picks which MS_Transactions stats row to use when a player has more than
 * one (different levelFormatId, e.g. senior vs U19). Defaults to the first
 * one matching the profile's own sportId+format if no explicit
 * levelFormatId is given, otherwise just the first row returned.
 */
function pickStatsRow(
  statsRows: PlayerStatsItem[],
  profile: PlayerProfileItem,
  levelFormatId?: string
): PlayerStatsItem | undefined {
  if (levelFormatId) {
    return statsRows.find((r) => r.levelFormatId === levelFormatId);
  }
  return (
    statsRows.find(
      (r) => r.sportId === profile.sportId && r.format === profile.format
    ) || statsRows[0]
  );
}

export function assemblePlayerDocument(
  profile: PlayerProfileItem,
  statsRows: PlayerStatsItem[],
  opts: { levelFormatId?: string } = {}
) {
  const stats = pickStatsRow(statsRows, profile, opts.levelFormatId);

  return {
    playerId: profile.playerId,
    sportId: profile.sportId ?? "cricket",
    format: profile.format ?? "Test",
    gender: profile.gender ?? "male",
    currentClubId: profile.currentClubId ?? null,

    coreInfo: {
      playerId: profile.playerId,
      name: profile.name,
      country: profile.country ?? null,
      flag: profile.flag ?? null,
      role: profile.role ?? null,
      battingStyle: profile.battingStyle ?? null,
      bowlingStyle: profile.bowlingStyle ?? null,
      dateOfBirth: profile.dateOfBirth ?? null,
      birthPlace: profile.birthPlace ?? null,
      heightCm: profile.heightCm ?? null,
      profileImage: profile.profileImage ?? null,
      isCaptain: profile.isCaptain ?? false,
      testCaps: profile.testCaps ?? null,
      gender: profile.gender ?? "male",
    },

    // record_highlight lives on the MS_Transactions row (was stored
    // combined with analytics there, same as the team schema)
    record_highlight: stats?.recordHighlight ?? null,

    analytics: {
      battingStats: stats?.battingStats ?? null,
      bowlingStats: stats?.bowlingStats ?? null,
    },

    // Every AFFIL row this player has, in case the consumer wants to show
    // stats across multiple levelFormatIds (e.g. senior Test + U19) rather
    // than just the one picked above.
    allStints: statsRows.map((r) => ({
      levelFormatId: r.levelFormatId,
      sportId: r.sportId,
      format: r.format,
      clubId: r.clubId ?? null,
      battingStats: r.battingStats ?? null,
      bowlingStats: r.bowlingStats ?? null,
      recordHighlight: r.recordHighlight ?? null,
    })),
  };
}