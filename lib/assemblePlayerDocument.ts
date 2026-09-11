// lib/assemblePlayerDocument.ts
//
// Merges a player's/athlete's MS_Players / SportsData profile item + its
// MS_Transactions stats row(s) back into ONE comprehensive JSON, shaped like
// the expected multi-sport document (coreInfo / performance / record_highlight / analytics).
//
// Preserves all raw top-level attributes from DynamoDB so no sport-specific
// fields are lost.

interface PlayerProfileItem {
  entityId?: string;
  sk?: string;
  playerId?: string;
  athleteId?: string;
  name?: string;
  role?: string | null;
  battingStyle?: string | null;
  bowlingStyle?: string | null;
  isCaptain?: boolean;
  currentClubId?: string | null;
  sportId?: string;
  sport?: string;
  format?: string;
  testCaps?: number | null;
  dateOfBirth?: string | null;
  dob?: string | null;
  birthPlace?: string | null;
  birthplace?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  profileImage?: string | null;
  coverImage?: string | null;
  country?: string | null;
  nationality?: string | null;
  flag?: string | null;
  coachName?: string | null;
  coach?: string | null;
  bio?: string | null;
  about?: string | null;
  welcomeMessage?: string | null;
  welcomeVideoUrl?: string | null;
  debutDate?: string | null;
  jerseyNo?: number | string | null;
  firstOlympicGames?: string | null;
  coreInfo?: Record<string, any>;
  performance?: Record<string, any>;
  record_highlight?: Record<string, any>;
  recordHighlight?: Record<string, any>;
  analytics?: Record<string, any>;
  [key: string]: unknown;
}

interface PlayerStatsItem {
  entityId: string;
  sk: string; // AFFIL#<sportId>#<levelFormatId>#<format>#STATS
  playerId?: string;
  athleteId?: string;
  clubId?: string | null;
  sportId?: string;
  levelFormatId?: string;
  format?: string;
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
  if (!statsRows || statsRows.length === 0) return undefined;
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
  statsRows: PlayerStatsItem[] = [],
  opts: { levelFormatId?: string } = {}
) {
  const stats = pickStatsRow(statsRows, profile, opts.levelFormatId);

  const rawEntityId = profile.entityId || "";
  const cleanId =
    profile.playerId ||
    profile.athleteId ||
    rawEntityId.replace(/^(PLAYER|ATHLETE)#/, "") ||
    "";

  const resolvedSportId = (profile.sportId || profile.sport || "cricket").toLowerCase();
  const existingCore = (profile.coreInfo as Record<string, any>) || {};
  const existingPerf = (profile.performance as Record<string, any>) || {};
  const existingAnalytics = (profile.analytics as Record<string, any>) || {};

  const name = profile.name || existingCore.name || cleanId;
  const country = profile.country || profile.nationality || existingCore.country || null;
  const nationality = profile.nationality || profile.country || existingCore.nationality || null;
  const flag = profile.flag || existingCore.flag || null;
  const dateOfBirth = profile.dateOfBirth || profile.dob || existingCore.dateOfBirth || existingCore.dob || null;
  const birthPlace = profile.birthPlace || profile.birthplace || existingCore.birthPlace || existingCore.birthplace || null;
  const heightCm = profile.heightCm ?? existingCore.heightCm ?? null;
  const weightKg = profile.weightKg ?? existingCore.weightKg ?? null;
  const coachName = profile.coachName || profile.coach || existingCore.coachName || existingCore.coach || null;
  const bio = profile.bio || profile.about || existingCore.bio || existingCore.about || null;
  const welcomeVideoUrl = profile.welcomeVideoUrl || (profile as any).videoUrl || existingCore.welcomeVideoUrl || null;
  const profileImage = profile.profileImage || (profile as any).image || existingCore.profileImage || null;
  const coverImage = profile.coverImage || existingCore.coverImage || null;

  const mergedCoreInfo = {
    ...existingCore,
    playerId: cleanId,
    athleteId: cleanId,
    name,
    country,
    nationality,
    flag,
    role: profile.role ?? existingCore.role ?? null,
    sportId: resolvedSportId,
    sport: profile.sport || profile.sportId || existingCore.sport || resolvedSportId,
    battingStyle: profile.battingStyle ?? existingCore.battingStyle ?? null,
    bowlingStyle: profile.bowlingStyle ?? existingCore.bowlingStyle ?? null,
    dateOfBirth,
    dob: dateOfBirth,
    birthPlace,
    birthplace: birthPlace,
    heightCm,
    height: heightCm ? `${heightCm} cm` : (existingCore.height ?? null),
    weightKg,
    weight: weightKg ? `${weightKg} kg` : (existingCore.weight ?? null),
    profileImage,
    coverImage,
    isCaptain: Boolean(profile.isCaptain ?? existingCore.isCaptain ?? false),
    testCaps: profile.testCaps ?? existingCore.testCaps ?? null,
    gender: profile.gender ?? existingCore.gender ?? "male",
    coachName,
    coach: coachName,
    debutDate: profile.debutDate ?? existingCore.debutDate ?? null,
    jerseyNo: profile.jerseyNo ?? existingCore.jerseyNo ?? null,
    firstOlympicGames: profile.firstOlympicGames ?? existingCore.firstOlympicGames ?? null,
    bio,
    welcomeVideoUrl,
    format: profile.format ?? existingCore.format ?? "Test",
    currentClubId: profile.currentClubId ?? existingCore.currentClubId ?? null,
  };

  const safeJson = (val: any, fallback: any = null) => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return fallback !== null ? fallback : val;
      }
    }
    return val;
  };

  const rawConsistency = safeJson((profile as any).consistencyData ?? existingAnalytics.consistencyData, []);
  const parsedMedalData = safeJson(
    (profile as any).medalData ??
    existingAnalytics.medalData ??
    (profile as any).analytics?.medalData ??
    (rawConsistency && !Array.isArray(rawConsistency) ? (rawConsistency as any).medalData : null) ??
    (existingAnalytics.consistencyData && !Array.isArray(existingAnalytics.consistencyData) ? (existingAnalytics.consistencyData as any).medalData : null),
    []
  );
  const parsedStats = safeJson((profile as any).stats ?? existingAnalytics.stats ?? existingPerf.stats, {});
  const parsedSeasonalData = safeJson((profile as any).seasonalData ?? (profile as any).performanceTrend ?? existingAnalytics.seasonalData, []);
  const parsedConsistencyData = Array.isArray(rawConsistency) ? rawConsistency : (rawConsistency?.ranges ?? rawConsistency?.data ?? []);
  const parsedCurrentSeason = safeJson((profile as any).currentSeason ?? (profile as any).season ?? existingPerf.currentSeason, null);
  const parsedMedalCabinet = safeJson((profile as any).medalCabinet ?? (profile as any).medals ?? existingPerf.medalCabinet, []);
  const parsedRadarData = safeJson((profile as any).radarData ?? existingAnalytics.radarData, null);
  const parsedCoachImpactData = safeJson((profile as any).coachImpactData ?? existingAnalytics.coachImpactData, null);

  const mergedRecordHighlight =
    stats?.recordHighlight ??
    safeJson(profile.record_highlight ?? profile.recordHighlight, null);

  const mergedAnalytics = {
    ...existingAnalytics,
    sport: profile.sport || profile.sportId || existingAnalytics.sport || resolvedSportId,
    battingStats: stats?.battingStats ?? existingAnalytics.battingStats ?? (profile as any).battingStats ?? null,
    bowlingStats: stats?.bowlingStats ?? existingAnalytics.bowlingStats ?? (profile as any).bowlingStats ?? null,
    stats: parsedStats,
    seasonalData: parsedSeasonalData,
    medalData: parsedMedalData,
    consistencyData: parsedConsistencyData,
    consistencyNote: (profile as any).consistencyNote ?? existingAnalytics.consistencyNote ?? null,
    peakZoneLabel: (profile as any).peakZoneLabel ?? existingAnalytics.peakZoneLabel ?? null,
    consistencyBarLabel: (profile as any).consistencyBarLabel ?? existingAnalytics.consistencyBarLabel ?? null,
    coachImpactData: parsedCoachImpactData,
    radarData: parsedRadarData,
  };

  const mergedPerformance = {
    ...existingPerf,
    primaryEvent: profile.primaryEvent || (profile as any).discipline || existingPerf.primaryEvent || profile.sport || resolvedSportId,
    category: profile.category || existingPerf.category || null,
    stats: parsedStats,
    medalCabinet: parsedMedalCabinet,
    currentSeason: parsedCurrentSeason,
  };

  return {
    ...profile,
    entityId: profile.entityId || `PLAYER#${cleanId}`,
    sk: profile.sk || "PROFILE#META",
    playerId: cleanId,
    athleteId: cleanId,
    name,
    country,
    nationality,
    flag,
    sportId: resolvedSportId,
    sport: profile.sport || profile.sportId || resolvedSportId,
    format: profile.format || "Test",
    gender: profile.gender || "male",
    currentClubId: profile.currentClubId ?? null,
    profileImage,
    coverImage,
    bio,
    welcomeVideoUrl,
    welcomeMessage: profile.welcomeMessage || bio || `Welcome to the official profile of ${name}!`,

    coreInfo: mergedCoreInfo,
    performance: mergedPerformance,
    record_highlight: mergedRecordHighlight,
    analytics: mergedAnalytics,

    // Every AFFIL row this player has, in case the consumer wants to show
    // stats across multiple levelFormatIds (e.g. senior Test + U19) rather
    // than just the one picked above.
    allStints: (statsRows || []).map((r) => ({
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