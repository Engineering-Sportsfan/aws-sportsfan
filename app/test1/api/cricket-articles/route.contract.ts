export type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

export type CricketArticleInput = {
  badge?: string;
  title?: string;
  readTime?: string;
  views?: string;
  image?: string;
  tags?: string[];
};

export type CricketArticle = {
  id: string;
  badge: BadgeType;
  title: string;
  readTime: string;
  views: string;
  image: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

const VALID_BADGES: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];

export type LoadingState = "idle" | "submitting" | "success" | "error";

export function extractArticleId(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

export function validateCreateArticle(input: CricketArticleInput) {
  if (!input.title || !input.image) {
    return { ok: false as const, status: 400, error: "title and image are required" };
  }

  if (input.badge && !VALID_BADGES.includes(input.badge as BadgeType)) {
    return {
      ok: false as const,
      status: 400,
      error: "Invalid badge type. Must be FEATURE, ANALYSIS, OPINION, or NEWS",
    };
  }

  return { ok: true as const };
}

export function validateUpdateArticle(input: CricketArticleInput) {
  if (input.badge && !VALID_BADGES.includes(input.badge as BadgeType)) {
    return { ok: false as const, status: 400, error: "Invalid badge type" };
  }
  return { ok: true as const };
}

export function isAuthenticated(authHeader?: string) {
  return Boolean(authHeader && authHeader.startsWith("Bearer "));
}

export function mapCreateArticlePayload(input: CricketArticleInput, id: string, now: number): CricketArticle {
  return {
    id,
    badge: (input.badge as BadgeType) || "NEWS",
    title: input.title || "",
    readTime: input.readTime || "5 min read",
    views: input.views || "0 views",
    image: input.image || "",
    tags: Array.isArray(input.tags) ? input.tags : [],
    createdAt: now,
    updatedAt: now,
  };
}

export function mapUpdateArticlePayload(existing: CricketArticle, input: CricketArticleInput, now: number): CricketArticle {
  return {
    ...existing,
    badge: (input.badge as BadgeType) || existing.badge,
    title: input.title ?? existing.title,
    readTime: input.readTime ?? existing.readTime,
    views: input.views ?? existing.views,
    image: input.image ?? existing.image,
    tags: Array.isArray(input.tags) ? input.tags : existing.tags,
    updatedAt: now,
  };
}

export function buildListQuery(pageRaw: string | null, limitRaw: string | null, badgeRaw: string | null) {
  const page = Math.max(1, Number.parseInt(pageRaw || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw || "10", 10) || 10));
  const skip = (page - 1) * limit;
  const badge = badgeRaw && VALID_BADGES.includes(badgeRaw as BadgeType) ? (badgeRaw as BadgeType) : null;

  return {
    page,
    limit,
    skip,
    badge,
    sortBy: "createdAt",
    sortOrder: "desc" as const,
  };
}

export function filterSortArticles(rows: CricketArticle[], badge?: BadgeType | null) {
  const filtered = badge ? rows.filter((row) => row.badge === badge) : rows;
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

export function canDeleteArticle(exists: boolean) {
  return exists
    ? { success: true as const }
    : { success: false as const, status: 404, error: "Article not found" };
}

export function toApiSuccess<T>(data: T) {
  return { success: true, ...data };
}

export function toApiError(message: string, status = 500) {
  return { success: false, status, error: message };
}

export function buildAdminApiRequest(input: CricketArticleInput) {
  return {
    badge: input.badge || "NEWS",
    title: input.title || "",
    readTime: input.readTime || "5 min read",
    views: input.views || "0 views",
    image: input.image || "",
    tags: Array.isArray(input.tags) ? input.tags : [],
  };
}

export function validateAdminArticleForm(input: CricketArticleInput) {
  const errors: string[] = [];
  if (!input.title?.trim()) errors.push("Title is required");
  if (!input.image?.trim()) errors.push("Image is required");
  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    errors.push("Tags must be an array of strings");
  }
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
