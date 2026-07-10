export type ClubProfileFormInput = {
  name?: string;
  team?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  about?: string;
  statsRuns?: string;
  statsSr?: string;
  statsAvg?: string;
  overviewCaptain?: string;
  overviewCoach?: string;
  overviewOwner?: string;
  overviewVenue?: string;
};

export type ClubProfileRecord = {
  id: string;
  name: string;
  team: string;
  battingStyle: string;
  bowlingStyle: string;
  about: string;
  avatar: string;
  stats: { runs: string; sr: string; avg: string };
  overview: { captain: string; coach: string; owner: string; venue: string };
  createdAt: number;
  updatedAt: number;
};

export type LoadingState = "idle" | "submitting" | "success" | "error";

export function extractClubProfileId(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

export function validateClubProfileCreate(input: ClubProfileFormInput) {
  if (!input.name || !input.team) {
    return { ok: false as const, status: 400, message: "name and team are required" };
  }
  return { ok: true as const };
}

export function isAuthenticated(authHeader?: string) {
  return Boolean(authHeader && authHeader.startsWith("Bearer "));
}

export function mapFormToApiPayload(input: ClubProfileFormInput, avatarUrl: string, now: number): Omit<ClubProfileRecord, "id"> {
  return {
    name: input.name || "",
    team: input.team || "",
    battingStyle: input.battingStyle || "",
    bowlingStyle: input.bowlingStyle || "",
    about: input.about || "",
    avatar: avatarUrl,
    stats: {
      runs: input.statsRuns || "0",
      sr: input.statsSr || "0",
      avg: input.statsAvg || "0",
    },
    overview: {
      captain: input.overviewCaptain || "",
      coach: input.overviewCoach || "",
      owner: input.overviewOwner || "",
      venue: input.overviewVenue || "",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdateData(existing: Omit<ClubProfileRecord, "id">, input: ClubProfileFormInput, now: number, avatarUrl?: string): Omit<ClubProfileRecord, "id"> {
  return {
    name: input.name || existing.name,
    team: input.team || existing.team,
    battingStyle: input.battingStyle ?? existing.battingStyle,
    bowlingStyle: input.bowlingStyle ?? existing.bowlingStyle,
    about: input.about ?? existing.about,
    avatar: avatarUrl ?? existing.avatar,
    stats: {
      runs: input.statsRuns || existing.stats.runs || "0",
      sr: input.statsSr || existing.stats.sr || "0",
      avg: input.statsAvg || existing.stats.avg || "0",
    },
    overview: {
      captain: input.overviewCaptain || existing.overview.captain || "",
      coach: input.overviewCoach || existing.overview.coach || "",
      owner: input.overviewOwner || existing.overview.owner || "",
      venue: input.overviewVenue || existing.overview.venue || "",
    },
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

export function buildListQuery(pageRaw: string | null, limitRaw: string | null) {
  const page = Math.max(1, Number.parseInt(pageRaw || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw || "20", 10) || 20));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    sortBy: "createdAt",
    sortOrder: "desc" as const,
  };
}

export function applyFiltersAndSorting(rows: ClubProfileRecord[], team?: string) {
  const filtered = team ? rows.filter((row) => row.team.toLowerCase() === team.toLowerCase()) : rows;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function paginateRows<T>(rows: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return rows.slice(start, start + limit);
}

export function buildPagination(totalItems: number, page: number, limit: number) {
  return {
    currentPage: page,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
    itemsPerPage: limit,
  };
}

export function toApiSuccess<T>(data: T) {
  return { success: true, ...data };
}

export function toApiError(message: string, status = 500) {
  return { success: false, status, message };
}

export function canDeleteRecord(exists: boolean) {
  return exists ? { success: true } : { success: false, status: 404, message: "Profile not found" };
}

export function validateAdminForm(input: ClubProfileFormInput) {
  const errors: string[] = [];
  if (!input.name?.trim()) errors.push("Name is required");
  if (!input.team?.trim()) errors.push("Team is required");
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getDisplayError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong";
}

export function nextLoadingState(current: LoadingState, event: "submit" | "success" | "fail" | "reset"): LoadingState {
  if (event === "submit") return "submitting";
  if (event === "success") return "success";
  if (event === "fail") return "error";
  if (event === "reset") return "idle";
  return current;
}
