import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomUpdatePatch,
  deleteRoomResult,
  extractRoomIdFromPath,
  mapSingleRoomDoc,
  sanitizeUpdateBody,
  toApiError,
  toApiSuccess,
  updateRoomResult,
  validateRoomId,
} from "./route-id.contract";

test("extractRoomIdFromPath returns last path segment", () => {
  assert.equal(extractRoomIdFromPath("/api/rooms/abc123"), "abc123");
  assert.equal(extractRoomIdFromPath("/api/rooms/"), null);
});

test("validateRoomId enforces required id", () => {
  const bad = validateRoomId(null);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.status, 400);
    assert.equal(bad.error, "Room ID is required");
  }

  const good = validateRoomId("room-1");
  assert.equal(good.ok, true);
});

test("GET mapSingleRoomDoc handles not found and found", () => {
  const missing = mapSingleRoomDoc({ id: "r-1", exists: false, data: () => undefined });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 404);
    assert.equal(missing.error, "Room not found");
  }

  const found = mapSingleRoomDoc({
    id: "r-2",
    exists: true,
    data: () => ({ title: "Room 2", status: "draft" }),
  });
  assert.equal(found.ok, true);
  if (found.ok) {
    assert.deepEqual(found.room, { id: "r-2", title: "Room 2", status: "draft" });
  }
});

test("PUT sanitizeUpdateBody removes undefined keys", () => {
  const sanitized = sanitizeUpdateBody({
    title: "New Title",
    description: undefined,
    capacity: 200,
  });

  assert.deepEqual(sanitized, {
    title: "New Title",
    titleLower: "new title",
    capacity: 200,
  });
  assert.equal(Object.hasOwn(sanitized, "description"), false);
});

test("PUT sanitizeUpdateBody keeps titleLower logic aligned with route", () => {
  const withWhitespaceTitle = sanitizeUpdateBody({ title: "  BIG ROOM  " });
  assert.equal(withWhitespaceTitle.titleLower, "big room");

  const withoutTitle = sanitizeUpdateBody({ language: "en" });
  assert.equal(Object.hasOwn(withoutTitle, "titleLower"), false);
});

test("PUT buildRoomUpdatePatch appends updatedAt", () => {
  const patch = buildRoomUpdatePatch({ title: "Final" }, 1700000000000);
  assert.equal((patch as Record<string, unknown>)["title"], "Final");
  assert.equal((patch as Record<string, unknown>)["titleLower"], "final");
  assert.equal(patch.updatedAt, 1700000000000);
});

test("PUT result contract handles missing and success", () => {
  const missing = updateRoomResult(false);
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.status, 404);
    assert.equal(missing.error, "Room not found");
  }

  const ok = updateRoomResult(true);
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.message, "Room updated");
  }
});

test("DELETE result contract handles missing and success", () => {
  const missing = deleteRoomResult(false);
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.status, 404);
    assert.equal(missing.error, "Room not found");
  }

  const ok = deleteRoomResult(true);
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.message, "Room deleted");
  }
});

test("API success and error helper contracts", () => {
  const success = toApiSuccess({ room: { id: "x" } });
  assert.equal(success.success, true);
  assert.deepEqual(success.room, { id: "x" });

  const error = toApiError("Unexpected error", 500);
  assert.equal(error.success, false);
  assert.equal(error.status, 500);
  assert.equal(error.error, "Unexpected error");
});
