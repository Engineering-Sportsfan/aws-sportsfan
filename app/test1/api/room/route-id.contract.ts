export type RoomDocLike = {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

export function extractRoomIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/");
  return parts[parts.length - 1] || null;
}

export function validateRoomId(id: string | null) {
  if (!id) {
    return { ok: false as const, status: 400, error: "Room ID is required" };
  }
  return { ok: true as const };
}

export function mapSingleRoomDoc(doc: RoomDocLike) {
  if (!doc.exists) {
    return { ok: false as const, status: 404, error: "Room not found" };
  }

  return {
    ok: true as const,
    room: {
      id: doc.id,
      ...(doc.data() || {}),
    },
  };
}

export function sanitizeUpdateBody(body: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined)
  );

  if (sanitized.title) {
    sanitized.titleLower = String(sanitized.title).trim().toLowerCase();
  }

  return sanitized;
}

export function buildRoomUpdatePatch(
  body: Record<string, unknown>,
  now: number
): Record<string, unknown> & { updatedAt: number } {
  return {
    ...sanitizeUpdateBody(body),
    updatedAt: now,
  };
}

export function updateRoomResult(exists: boolean) {
  if (!exists) {
    return { success: false as const, status: 404, error: "Room not found" };
  }

  return { success: true as const, message: "Room updated" };
}

export function deleteRoomResult(exists: boolean) {
  if (!exists) {
    return { success: false as const, status: 404, error: "Room not found" };
  }

  return { success: true as const, message: "Room deleted" };
}

export function toApiSuccess<T>(data: T) {
  return { success: true, ...data };
}

export function toApiError(error: string, status = 500) {
  return { success: false, status, error };
}
