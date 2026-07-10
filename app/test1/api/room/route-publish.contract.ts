export type PublishRoomData = {
  eventId?: unknown;
  roomType?: unknown;
  title?: unknown;
  price?: unknown;
  status?: unknown;
};

export function extractRoomIdFromPublishPath(pathname: string): string | null {
  const parts = pathname.split("/");
  const publishIdx = parts.indexOf("publish");
  return publishIdx > 0 ? parts[publishIdx - 1] : null;
}

export function validatePublishRoomId(id: string | null) {
  if (!id) {
    return { ok: false as const, status: 400, error: "Room ID is required" };
  }
  return { ok: true as const };
}

export function publishNotFoundResult(exists: boolean) {
  if (!exists) {
    return { ok: false as const, status: 404, error: "Room not found" };
  }
  return { ok: true as const };
}

export function validateAlreadyPublishedStatus(status: unknown) {
  if (status === "published" || status === "live") {
    return {
      ok: false as const,
      status: 409,
      error: `Room is already ${String(status)}`,
    };
  }

  return { ok: true as const };
}

export function validatePublishRequirements(data: PublishRoomData) {
  const missing: string[] = [];

  if (!data.eventId) missing.push("eventId");
  if (!data.roomType) missing.push("roomType");
  if (!data.title) missing.push("title");

  if (
    (data.roomType === "inner" || data.roomType === "moment") &&
    data.price === null
  ) {
    missing.push("price (required for premium rooms)");
  }

  if (missing.length > 0) {
    return {
      ok: false as const,
      status: 422,
      error: "Cannot publish — missing required fields",
      missing,
    };
  }

  return { ok: true as const, missing };
}

export function buildPublishUpdates(
  body: Record<string, unknown>,
  now: number
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    status: "published",
    publishedAt: now,
    updatedAt: now,
  };

  if (body.price !== undefined) {
    updates.price = Number(body.price);
  }

  return updates;
}

export function mapPublishedRoomResponse(
  id: string,
  data: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  return {
    success: true,
    message: "Room published successfully",
    room: {
      id,
      ...data,
      ...updates,
    },
  };
}

export function toApiError(error: string, status = 500) {
  return { success: false, status, error };
}
