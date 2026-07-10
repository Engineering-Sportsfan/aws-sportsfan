export type EventRecord = {
  id: string;
  name: string;
  sport: string;
  scheduledAt: string;
  status: string;
  thumbnail: string | null;
};

export type EventsGetQuery = {
  search: string;
  sport: string | null;
  status: string | null;
  limit: number;
  lastDocId: string | null;
};

export type EventCreateInput = {
  name?: unknown;
  sport?: unknown;
  scheduledAt?: unknown;
  status?: unknown;
  thumbnail?: unknown;
};

export function buildEventsGetQuery(url: string): EventsGetQuery {
  const { searchParams } = new URL(url);
  return {
    search: searchParams.get("search")?.trim().toLowerCase() || "",
    sport: searchParams.get("sport"),
    status: searchParams.get("status"),
    limit: Math.min(Number.parseInt(searchParams.get("limit") || "20", 10), 50),
    lastDocId: searchParams.get("lastDocId"),
  };
}

export function mapEventDoc(doc: { id: string; data: () => Record<string, unknown> }): EventRecord {
  const data = doc.data();
  return {
    id: doc.id,
    name: String(data.name || ""),
    sport: String(data.sport || ""),
    scheduledAt: String(data.scheduledAt || ""),
    status: String(data.status || ""),
    thumbnail: (data.thumbnail as string | null | undefined) ?? null,
  };
}

export function mapEventDocs(docs: Array<{ id: string; data: () => Record<string, unknown> }>): EventRecord[] {
  return docs.map(mapEventDoc);
}

export function buildSearchPagination(limit: number) {
  return { limit, hasMore: false, nextCursor: null };
}

export function buildNormalPagination(eventsLength: number, limit: number, lastId: string | null) {
  const hasMore = eventsLength === limit;
  return {
    limit,
    hasMore,
    nextCursor: hasMore ? lastId : null,
  };
}

export function shouldApplyStartAfter(lastDocId: string | null, lastDocExists: boolean) {
  return Boolean(lastDocId && lastDocExists);
}

export type EventCreateResult =
  | { ok: true; status: 201; event: Record<string, unknown> }
  | { ok: false; status: 400; error: string };

export function buildEventCreateResult(
  body: EventCreateInput,
  id: string,
  now: number = Date.now()
): EventCreateResult {
  const { name, sport, scheduledAt, status = "upcoming", thumbnail } = body;

  if (!name || !sport || !scheduledAt) {
    return {
      ok: false,
      status: 400,
      error: "name, sport, and scheduledAt are required",
    };
  }

  const trimmedName = String(name).trim();

  return {
    ok: true,
    status: 201,
    event: {
      id,
      name: trimmedName,
      nameLower: trimmedName.toLowerCase(),
      sport,
      scheduledAt,
      status,
      thumbnail: thumbnail || null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function toApiSuccess<T>(data: T) {
  return { success: true, ...data };
}

export function toApiError(error: string, status = 500) {
  return { success: false, status, error };
}
