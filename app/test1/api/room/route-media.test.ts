import test from "node:test";
import assert from "node:assert/strict";
import {
  appendMediaAsset,
  buildMediaUpdatePatch,
  buildNewMediaAsset,
  extractRoomIdFromMediaPath,
  mapMediaAssetsFromRoomData,
  removeMediaAssetByUrl,
  toApiError,
  toApiSuccess,
  validateCreateMediaInput,
  validateDeleteMediaInput,
  validateRoomId,
} from "./route-media.contract";

test("extractRoomIdFromMediaPath returns id before media segment", () => {
  assert.equal(extractRoomIdFromMediaPath("/api/rooms/r1/media"), "r1");
  assert.equal(extractRoomIdFromMediaPath("/api/rooms/media"), "rooms");
  assert.equal(extractRoomIdFromMediaPath("/api/rooms/r1"), null);
});

test("validateRoomId enforces required room id", () => {
  const missing = validateRoomId(null);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 400);
    assert.equal(missing.error, "Room ID is required");
  }

  const ok = validateRoomId("room-1");
  assert.equal(ok.ok, true);
});

test("GET media list maps mediaAssets array and defaults empty", () => {
  const mapped = mapMediaAssetsFromRoomData({
    mediaAssets: [{ url: "a.jpg", type: "image" }],
  });
  assert.deepEqual(mapped, [{ url: "a.jpg", type: "image" }]);

  const fallback = mapMediaAssetsFromRoomData({ mediaAssets: "invalid" });
  assert.deepEqual(fallback, []);
});

test("POST create validates required url and type", () => {
  const bad = validateCreateMediaInput({ url: "", type: "image" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.status, 400);
    assert.equal(bad.error, "url and type are required");
  }

  const good = validateCreateMediaInput({ url: "https://x/a.jpg", type: "image" });
  assert.equal(good.ok, true);
});

test("POST buildNewMediaAsset keeps explicit name and size", () => {
  const asset = buildNewMediaAsset(
    {
      url: "https://cdn.example.com/files/cover.jpg",
      type: "image",
      name: "cover",
      sizeBytes: 1200,
    },
    1700000000000
  );

  assert.deepEqual(asset, {
    url: "https://cdn.example.com/files/cover.jpg",
    type: "image",
    name: "cover",
    sizeBytes: 1200,
    addedAt: 1700000000000,
  });
});

test("POST buildNewMediaAsset derives fallback name from url", () => {
  const asset = buildNewMediaAsset(
    {
      url: "https://cdn.example.com/media/demo-video.mp4",
      type: "video",
    },
    123
  );

  assert.equal(asset.name, "demo-video.mp4");
  assert.equal(asset.sizeBytes, null);
  assert.equal(asset.addedAt, 123);
});

test("POST appendMediaAsset appends new asset preserving existing order", () => {
  const existing = [{ url: "a.jpg", type: "image" }];
  const next = appendMediaAsset(existing, {
    url: "b.jpg",
    type: "image",
    name: "b.jpg",
    sizeBytes: null,
    addedAt: 10,
  });

  assert.equal(next.length, 2);
  assert.deepEqual(next[0], { url: "a.jpg", type: "image" });
  assert.deepEqual(next[1], {
    url: "b.jpg",
    type: "image",
    name: "b.jpg",
    sizeBytes: null,
    addedAt: 10,
  });
});

test("DELETE validates required asset url", () => {
  const bad = validateDeleteMediaInput({ url: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.status, 400);
    assert.equal(bad.error, "Asset url is required");
  }

  const ok = validateDeleteMediaInput({ url: "https://x/a.jpg" });
  assert.equal(ok.ok, true);
});

test("DELETE removeMediaAssetByUrl removes only matching url", () => {
  const filtered = removeMediaAssetByUrl(
    [
      { url: "a.jpg" },
      { url: "b.jpg" },
      { url: "a.jpg" },
    ],
    "a.jpg"
  );

  assert.deepEqual(filtered, [{ url: "b.jpg" }]);
});

test("buildMediaUpdatePatch includes updatedAt", () => {
  const patch = buildMediaUpdatePatch([{ url: "a.jpg" }], 1700000000000);
  assert.deepEqual(patch, {
    mediaAssets: [{ url: "a.jpg" }],
    updatedAt: 1700000000000,
  });
});

test("API success and error helper contracts", () => {
  const success = toApiSuccess({ mediaAssets: [{ url: "x" }] });
  assert.equal(success.success, true);
  assert.deepEqual(success.mediaAssets, [{ url: "x" }]);

  const error = toApiError("Unexpected error", 500);
  assert.equal(error.success, false);
  assert.equal(error.status, 500);
  assert.equal(error.error, "Unexpected error");
});
