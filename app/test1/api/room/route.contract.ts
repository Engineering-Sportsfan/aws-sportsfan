export type RoomStatus = "draft" | "published" | "live" | "ended";
export type RoomType = "open" | "inner" | "moment" | "reflection";

export type RoomsGetQuery = {
  hostId: string | null;
  status: string | null;
  roomType: string | null;
  eventId: string | null;
  limit: number;
  lastDocId: string | null;
};

export type RoomCreateInput = {
  hostId?: unknown;
  eventId?: unknown;
  roomType?: unknown;
  title?: unknown;
  description?: unknown;
  thumbnail?: unknown;
  capacity?: unknown;
  language?: unknown;
  tags?: unknown;
  scheduledAt?: unknown;
  moderators?: unknown;
  mediaAssets?: unknown;
  price?: unknown;
  status?: unknown;
};

export type RoomRecord = {
  id: string;
  hostId: string;
  eventId: string;
  roomType: string;
  title: string;
  titleLower: string;
  description: string;
  thumbnail: unknown;
  capacity: unknown;
  language: unknown;
  tags: unknown[];
  scheduledAt: unknown;
  moderators: unknown[];
  mediaAssets: unknown[];
  price: number | null;
  status: string;
  createdAt: number;
  updatedAt: number;
};

export function buildRoomsGetQuery(url: string): RoomsGetQuery {
  const { searchParams } = new URL(url);
  return {
    hostId: searchParams.get("hostId"),
    status: searchParams.get("status"),
    roomType: searchParams.get("roomType"),
    eventId: searchParams.get("eventId"),
    limit: Math.min(Number.parseInt(searchParams.get("limit") || "20", 10), 50),
    lastDocId: searchParams.get("lastDocId"),
  };
}

export function buildRoomsPagination(roomsLength: number, limit: number, lastId: string | null) {
  const hasMore = roomsLength === limit;
  return {
    limit,
    hasMore,
    nextCursor: hasMore ? lastId : null,
  };
}

export function mapRoomDocs<T extends { id: string; data: () => Record<string, unknown> }>(docs: T[]) {
  return docs.map((d) => ({ id: d.id, ...d.data() }));
}

export type RoomCreateResult =
  | { ok: true; status: 201; room: RoomRecord }
  | { ok: false; status: 400; error: string };

export function buildRoomCreateResult(
  body: RoomCreateInput,
  id: string,
  now: number = Date.now()
): RoomCreateResult {
  const {
    hostId,
    eventId,
    roomType,
    title,
    description,
    thumbnail,
    capacity,
    language,
    tags,
    scheduledAt,
    moderators,
    mediaAssets,
    price,
    status = "draft",
  } = body;

  if (!hostId || !eventId || !roomType) {
    return {
      ok: false,
      status: 400,
      error: "hostId, eventId, and roomType are required",
    };
  }

  return {
    ok: true,
    status: 201,
    room: {
      id,
      hostId: String(hostId),
      eventId: String(eventId),
      roomType: String(roomType),
      title: String(title ?? "").trim(),
      titleLower: String(title ?? "").trim().toLowerCase(),
      description: String(description ?? "").trim(),
      thumbnail: thumbnail ?? null,
      capacity: capacity ?? null,
      language: language ?? null,
      tags: Array.isArray(tags) ? tags : [],
      scheduledAt: scheduledAt ?? null,
      moderators: Array.isArray(moderators) ? moderators : [],
      mediaAssets: Array.isArray(mediaAssets) ? mediaAssets : [],
      price: price !== undefined ? Number(price) : null,
      status: String(status),
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
