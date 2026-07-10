//app\test1\api\global-search//route.contract.ts

export type SearchResult = {
  type: "player" | "team";
  id: string;
  playerProfilesId?: string;
  name: string;
  image?: string | null;
  logo?: string | null;
  jerseyNumber?: string | null;
  team?: string | null;
  category?: string[];
  stats?: {
    runs?: string;
    sr?: string;
    avg?: string;
  };
};

export function normalizeSearchQuery(q: string | null | undefined): string | null {
  const normalized = q?.toLowerCase().trim() || "";
  return normalized.length ? normalized : null;
}

export function isJerseyNumberQuery(query: string): boolean {
  return !Number.isNaN(Number.parseInt(query, 10));
}

export function dedupePlayersByProfileId(players: SearchResult[]): SearchResult[] {
  const map = new Map<string, SearchResult>();

  for (const player of players) {
    const key = player.playerProfilesId || player.id;
    if (!map.has(key)) {
      map.set(key, { ...player });
      continue;
    }

    const existing = map.get(key)!;
    map.set(key, {
      ...existing,
      ...player,
      jerseyNumber: player.jerseyNumber ?? existing.jerseyNumber ?? null,
      image: player.image ?? existing.image ?? null,
      team: player.team ?? existing.team ?? null,
      stats: player.stats ?? existing.stats,
    });
  }

  return Array.from(map.values());
}

export function filterTeamsByContains(teams: SearchResult[], query: string): SearchResult[] {
  return teams.filter((team) => team.name.toLowerCase().includes(query));
}

export function combineResults(players: SearchResult[], teams: SearchResult[]): SearchResult[] {
  return [...players.slice(0, 10), ...teams.slice(0, 10)];
}

export function buildSearchInfo(query: string, playersFound: number, teamsFound: number) {
  return {
    query,
    isJerseyNumber: isJerseyNumberQuery(query),
    playersFound,
    teamsFound,
  };
}

export function toApiSuccess(results: SearchResult[], query: string) {
  return {
    success: true,
    results,
    totalCount: results.length,
    searchInfo: buildSearchInfo(
      query,
      results.filter((r) => r.type === "player").length,
      results.filter((r) => r.type === "team").length
    ),
  };
}

export function toApiError(message: string) {
  return {
    success: false,
    error: message,
    results: [] as SearchResult[],
  };
}