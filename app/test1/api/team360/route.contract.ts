export type Team360CreateBody = {
  teamName?: unknown;
  title?: unknown;
  category?: unknown;
  likes?: unknown;
  comments?: unknown;
  live?: unknown;
  shares?: unknown;
  image?: unknown;
  logo?: unknown;
  catlogo?: unknown;
  hasVideo?: unknown;
};

export type Team360UpdateBody = Partial<Team360CreateBody>;

export type Team360Record = {
  id: string;
  teamName: string;
  title: string;
  category: unknown[];
  likes: number;
  comments: number;
  live: number;
  shares: number;
  image: string;
  logo: string;
  catlogo: unknown[];
  hasVideo: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LoadingState = "idle" | "submitting" | "success" | "error";

export type Team360CreateResult =
  | { ok: true; status: 201; post: Record<string, unknown> }
  | { ok: false; status: 400; error: string };

export function extractTeam360Id(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

export function buildTeam360CreateResult(
  body: Team360CreateBody,
  id: string,
  now: number = Date.now()
): Team360CreateResult {
  const { teamName, title, category, likes, comments, live, shares, image, logo, catlogo, hasVideo } = body;

  if (!teamName || !title || !image || !logo) {
    return {
      ok: false,
      status: 400,
      error: "teamName, title, image and logo are required",
    };
  }

  return {
    ok: true,
    status: 201,
    post: {
      id,
      teamName,
      title,
      category: category ?? [],
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      live: Number(live) || 0,
      shares: Number(shares) || 0,
      image,
      logo,
      catlogo: catlogo ?? [],
      hasVideo: hasVideo ?? false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function buildTeam360UpdatePatch(body: Team360UpdateBody) {
  const updates: Record<string, unknown> = {
    updatedAt: Date.now(),
  };

  if (body.teamName !== undefined) updates.teamName = body.teamName;
  if (body.title !== undefined) updates.title = body.title;
  if (body.likes !== undefined) updates.likes = Number(body.likes) || 0;
  if (body.comments !== undefined) updates.comments = Number(body.comments) || 0;
  if (body.live !== undefined) updates.live = Number(body.live) || 0;
  if (body.shares !== undefined) updates.shares = Number(body.shares) || 0;
  if (body.image !== undefined) updates.image = body.image;
  if (body.logo !== undefined) updates.logo = body.logo;
  if (body.category !== undefined) updates.category = body.category ?? [];
  if (body.catlogo !== undefined) updates.catlogo = body.catlogo ?? [];
  if (body.hasVideo !== undefined) updates.hasVideo = body.hasVideo;

  return updates;
}

export function isAuthenticated(authHeader?: string) {
  return Boolean(authHeader && authHeader.startsWith("Bearer "));
}

export function buildListQuery(pageRaw: string | null, limitRaw: string | null, teamRaw: string | null) {
  const page = Math.max(1, Number.parseInt(pageRaw || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw || "20", 10) || 20));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    team: teamRaw || null,
    sortBy: "createdAt",
    sortOrder: "desc" as const,
  };
}

export function applyFiltersAndSorting(rows: Team360Record[], team?: string | null) {
  const filtered = team ? rows.filter((row) => row.teamName.toLowerCase() === team.toLowerCase()) : rows;
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

export function canDeleteRecord(exists: boolean) {
  return exists
    ? { success: true as const }
    : { success: false as const, status: 404, error: "Post not found" };
}

export function toApiSuccess<T>(data: T) {
  return { success: true, ...data };
}

export function toApiError(message: string, status = 500) {
  return { success: false, status, error: message };
}

export function buildAdminApiRequest(input: Team360CreateBody) {
  return {
    teamName: String(input.teamName || ""),
    title: String(input.title || ""),
    category: Array.isArray(input.category) ? input.category : [],
    likes: Number(input.likes) || 0,
    comments: Number(input.comments) || 0,
    live: Number(input.live) || 0,
    shares: Number(input.shares) || 0,
    image: String(input.image || ""),
    logo: String(input.logo || ""),
    catlogo: Array.isArray(input.catlogo) ? input.catlogo : [],
    hasVideo: Boolean(input.hasVideo),
  };
}

export function validateAdminForm(input: Team360CreateBody) {
  const errors: string[] = [];
  if (!String(input.teamName || "").trim()) errors.push("Team Name is required");
  if (!String(input.title || "").trim()) errors.push("Title is required");
  if (!String(input.image || "").trim()) errors.push("Image is required");
  if (!String(input.logo || "").trim()) errors.push("Logo is required");
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
