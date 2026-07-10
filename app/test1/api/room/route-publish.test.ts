import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublishUpdates,
  extractRoomIdFromPublishPath,
  mapPublishedRoomResponse,
  publishNotFoundResult,
  toApiError,
  validateAlreadyPublishedStatus,
  validatePublishRequirements,
  validatePublishRoomId,
} from "./route-publish.contract";

test("extractRoomIdFromPublishPath returns id before publish segment", () => {
  assert.equal(extractRoomIdFromPublishPath("/api/rooms/r1/publish"), "r1");
  assert.equal(extractRoomIdFromPublishPath("/api/rooms/publish"), "rooms");
  assert.equal(extractRoomIdFromPublishPath("/api/rooms/r1"), null);
});

test("validatePublishRoomId enforces required id", () => {
  const missing = validatePublishRoomId(null);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 400);
    assert.equal(missing.error, "Room ID is required");
  }

  const ok = validatePublishRoomId("room-1");
  assert.equal(ok.ok, true);
});

test("publishNotFoundResult handles room existence", () => {
  const missing = publishNotFoundResult(false);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 404);
    assert.equal(missing.error, "Room not found");
  }

  const ok = publishNotFoundResult(true);
  assert.equal(ok.ok, true);
});

test("validateAlreadyPublishedStatus blocks published and live", () => {
  const published = validateAlreadyPublishedStatus("published");
  assert.equal(published.ok, false);
  if (!published.ok) {
    assert.equal(published.status, 409);
    assert.equal(published.error, "Room is already published");
  }

  const live = validateAlreadyPublishedStatus("live");
  assert.equal(live.ok, false);
  if (!live.ok) {
    assert.equal(live.status, 409);
    assert.equal(live.error, "Room is already live");
  }

  const draft = validateAlreadyPublishedStatus("draft");
  assert.equal(draft.ok, true);
});

test("validatePublishRequirements requires eventId roomType and title", () => {
  const result = validatePublishRequirements({
    eventId: "",
    roomType: undefined,
    title: null,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 422);
    assert.equal(result.error, "Cannot publish — missing required fields");
    assert.deepEqual(result.missing, ["eventId", "roomType", "title"]);
  }
});

test("validatePublishRequirements enforces premium room price rule", () => {
  const innerMissingPrice = validatePublishRequirements({
    eventId: "e1",
    roomType: "inner",
    title: "Premium Room",
    price: null,
  });

  assert.equal(innerMissingPrice.ok, false);
  if (!innerMissingPrice.ok) {
    assert.equal(innerMissingPrice.status, 422);
    assert.equal(
      innerMissingPrice.missing.includes("price (required for premium rooms)"),
      true
    );
  }

  const openNoPrice = validatePublishRequirements({
    eventId: "e1",
    roomType: "open",
    title: "Open Room",
    price: null,
  });
  assert.equal(openNoPrice.ok, true);
});

test("buildPublishUpdates sets publish fields and optional price override", () => {
  const withoutPrice = buildPublishUpdates({}, 1700000000000);
  assert.deepEqual(withoutPrice, {
    status: "published",
    publishedAt: 1700000000000,
    updatedAt: 1700000000000,
  });

  const withPrice = buildPublishUpdates({ price: "199" }, 1700000000010);
  assert.deepEqual(withPrice, {
    status: "published",
    publishedAt: 1700000000010,
    updatedAt: 1700000000010,
    price: 199,
  });
});

test("mapPublishedRoomResponse merges id data and updates", () => {
  const response = mapPublishedRoomResponse(
    "room-1",
    { eventId: "e1", title: "Draft", status: "draft" },
    { status: "published", updatedAt: 1700 }
  );

  assert.equal(response.success, true);
  assert.equal(response.message, "Room published successfully");
  assert.deepEqual(response.room, {
    id: "room-1",
    eventId: "e1",
    title: "Draft",
    status: "published",
    updatedAt: 1700,
  });
});

test("API error helper contract", () => {
  const error = toApiError("Unexpected error", 500);
  assert.equal(error.success, false);
  assert.equal(error.status, 500);
  assert.equal(error.error, "Unexpected error");
});
