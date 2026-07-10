export type RoomMediaAsset = {
  url: string;
  type: string;
  name: string;
  sizeBytes: number | null;
  addedAt: number;
};

export function extractRoomIdFromMediaPath(pathname: string): string | null {
  const parts = pathname.split("/");
  const mediaIdx = parts.indexOf("media");
  return mediaIdx > 0 ? parts[mediaIdx - 1] : null;
}

export function validateRoomId(id: string | null) {
  if (!id) {
    return { ok: false as const, status: 400, error: "Room ID is required" };
  }
  return { ok: true as const };
}

export function mapMediaAssetsFromRoomData(data: Record<string, unknown> | undefined) {
  const mediaAssets = data?.mediaAssets;
  return Array.isArray(mediaAssets) ? mediaAssets : [];
}

export function validateCreateMediaInput(input: { url?: unknown; type?: unknown }) {
  if (!input.url || !input.type) {
    return { ok: false as const, status: 400, error: "url and type are required" };
  }
  return { ok: true as const };
}

export function validateDeleteMediaInput(input: { url?: unknown }) {
  if (!input.url) {
    return { ok: false as const, status: 400, error: "Asset url is required" };
  }
  return { ok: true as const };
}

export function buildNewMediaAsset(
  input: { url: string; type: string; name?: string; sizeBytes?: number },
  now: number
): RoomMediaAsset {
  return {
    url: input.url,
    type: input.type,
    name: input.name || input.url.split("/").pop() || "asset",
    sizeBytes: input.sizeBytes || null,
    addedAt: now,
  };
}

export function appendMediaAsset(existing: unknown[], asset: RoomMediaAsset) {
  return [...existing, asset];
}

export function removeMediaAssetByUrl(existing: Array<{ url: string }>, url: string) {
  return existing.filter((a) => a.url !== url);
}

export function buildMediaUpdatePatch(mediaAssets: unknown[], now: number) {
  return {
    mediaAssets,
    updatedAt: now,
  };
}

export function toApiSuccess<T>(data: T) {
  return { success: true, ...data };
}

export function toApiError(error: string, status = 500) {
  return { success: false, status, error };
}
