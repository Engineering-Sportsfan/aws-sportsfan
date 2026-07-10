import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomCreateResult,
  buildRoomsGetQuery,
  buildRoomsPagination,
  mapRoomDocs,
  toApiError,
  toApiSuccess,
} from "./route.contract";

test("GET query parsing reads filters and cursor", () => {
  const query = buildRoomsGetQuery(
    "https://example.com/api/rooms?hostId=h1&status=published&roomType=open&eventId=e1&limit=15&lastDocId=doc-9"
  );

  assert.deepEqual(query, {
    hostId: "h1",
    status: "published",
    roomType: "open",
    eventId: "e1",
    limit: 15,
    lastDocId: "doc-9",
  });
});

test("GET query parsing defaults and caps limit", () => {
  const defaults = buildRoomsGetQuery("https://example.com/api/rooms");
  assert.equal(defaults.limit, 20);
  assert.equal(defaults.hostId, null);

  const capped = buildRoomsGetQuery("https://example.com/api/rooms?limit=999");
  assert.equal(capped.limit, 50);
});

test("GET pagination contract sets hasMore and nextCursor", () => {
  const fullPage = buildRoomsPagination(20, 20, "doc-20");
  assert.equal(fullPage.hasMore, true);
  assert.equal(fullPage.nextCursor, "doc-20");

  const partial = buildRoomsPagination(12, 20, "doc-12");
  assert.equal(partial.hasMore, false);
  assert.equal(partial.nextCursor, null);
});

test("GET snapshot mapping includes id and data", () => {
  const rows = mapRoomDocs([
    { id: "a", data: () => ({ title: "Room A", status: "draft" }) },
    { id: "b", data: () => ({ title: "Room B", status: "published" }) },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { id: "a", title: "Room A", status: "draft" });
  assert.deepEqual(rows[1], { id: "b", title: "Room B", status: "published" });
});

test("POST create validation requires hostId, eventId and roomType", () => {
  const result = buildRoomCreateResult({
    hostId: "h1",
    eventId: "",
    roomType: "open",
  }, "room-1");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "hostId, eventId, and roomType are required");
  }
});

test("POST create mapping normalizes fields and defaults", () => {
  const result = buildRoomCreateResult(
    {
      hostId: "host-1",
      eventId: "event-1",
      roomType: "inner",
      title: "  Big Match Room  ",
      description: "  Deep analysis  ",
      tags: ["ipl", "preview"],
      moderators: ["m1"],
      mediaAssets: [{ url: "a.jpg", type: "image" }],
      price: "99",
      status: "published",
    },
    "room-2",
    1700000000000
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 201);
    assert.equal(result.room.id, "room-2");
    assert.equal(result.room.title, "Big Match Room");
    assert.equal(result.room.titleLower, "big match room");
    assert.equal(result.room.description, "Deep analysis");
    assert.deepEqual(result.room.tags, ["ipl", "preview"]);
    assert.deepEqual(result.room.moderators, ["m1"]);
    assert.equal(result.room.price, 99);
    assert.equal(result.room.createdAt, 1700000000000);
    assert.equal(result.room.updatedAt, 1700000000000);
  }
});

test("POST create mapping handles optional arrays and price defaults", () => {
  const result = buildRoomCreateResult(
    {
      hostId: "host-2",
      eventId: "event-2",
      roomType: "moment",
      tags: "not-array",
      moderators: undefined,
      mediaAssets: null,
    },
    "room-3",
    123
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.room.tags, []);
    assert.deepEqual(result.room.moderators, []);
    assert.deepEqual(result.room.mediaAssets, []);
    assert.equal(result.room.price, null);
    assert.equal(result.room.status, "draft");
  }
});

test("API success and error response helpers", () => {
  const success = toApiSuccess({ rooms: [{ id: "1" }] });
  assert.equal(success.success, true);
  assert.deepEqual(success.rooms, [{ id: "1" }]);

  const error = toApiError("Unexpected error", 500);
  assert.equal(error.success, false);
  assert.equal(error.status, 500);
  assert.equal(error.error, "Unexpected error");
});
