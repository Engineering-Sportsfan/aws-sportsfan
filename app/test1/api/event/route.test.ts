import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventCreateResult,
  buildEventsGetQuery,
  buildNormalPagination,
  buildSearchPagination,
  mapEventDocs,
  shouldApplyStartAfter,
  toApiError,
  toApiSuccess,
  type EventRecord,
} from "./route.contract";

const seedRows: EventRecord[] = [
  {
    id: "1",
    name: "India vs Australia",
    sport: "cricket",
    scheduledAt: "2026-04-20T10:00:00.000Z",
    status: "upcoming",
    thumbnail: null,
  },
  {
    id: "2",
    name: "Mumbai Derby",
    sport: "football",
    scheduledAt: "2026-04-21T18:00:00.000Z",
    status: "live",
    thumbnail: "thumb.jpg",
  },
];

test("GET query parsing normalizes search and reads filters", () => {
  const query = buildEventsGetQuery(
    "https://example.com/api/events?search=%20InDia%20&sport=cricket&status=live&limit=15&lastDocId=abc"
  );

  assert.deepEqual(query, {
    search: "india",
    sport: "cricket",
    status: "live",
    limit: 15,
    lastDocId: "abc",
  });
});

test("GET query parsing defaults and limit cap", () => {
  const defaults = buildEventsGetQuery("https://example.com/api/events");
  assert.equal(defaults.search, "");
  assert.equal(defaults.limit, 20);

  const capped = buildEventsGetQuery("https://example.com/api/events?limit=999");
  assert.equal(capped.limit, 50);
});

test("GET maps docs to selector fields with thumbnail fallback", () => {
  const mapped = mapEventDocs([
    {
      id: "1",
      data: () => ({
        name: "Event A",
        sport: "cricket",
        scheduledAt: "2026-04-10",
        status: "upcoming",
      }),
    },
    {
      id: "2",
      data: () => ({
        name: "Event B",
        sport: "football",
        scheduledAt: "2026-04-11",
        status: "live",
        thumbnail: "b.jpg",
      }),
    },
  ]);

  assert.deepEqual(mapped, [
    {
      id: "1",
      name: "Event A",
      sport: "cricket",
      scheduledAt: "2026-04-10",
      status: "upcoming",
      thumbnail: null,
    },
    {
      id: "2",
      name: "Event B",
      sport: "football",
      scheduledAt: "2026-04-11",
      status: "live",
      thumbnail: "b.jpg",
    },
  ]);
});

test("GET search path pagination contract", () => {
  const pagination = buildSearchPagination(20);
  assert.deepEqual(pagination, { limit: 20, hasMore: false, nextCursor: null });
});

test("GET normal path pagination contract", () => {
  const fullPage = buildNormalPagination(20, 20, "last-1");
  assert.equal(fullPage.hasMore, true);
  assert.equal(fullPage.nextCursor, "last-1");

  const partial = buildNormalPagination(2, 20, "last-2");
  assert.equal(partial.hasMore, false);
  assert.equal(partial.nextCursor, null);
});

test("GET startAfter applies only when cursor exists and doc found", () => {
  assert.equal(shouldApplyStartAfter("doc-1", true), true);
  assert.equal(shouldApplyStartAfter("doc-1", false), false);
  assert.equal(shouldApplyStartAfter(null, true), false);
});

test("POST create validation requires name sport scheduledAt", () => {
  const result = buildEventCreateResult(
    { name: "", sport: "cricket", scheduledAt: "2026-04-20" },
    "e1"
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "name, sport, and scheduledAt are required");
  }
});

test("POST create mapping normalizes event payload", () => {
  const result = buildEventCreateResult(
    {
      name: "  Big Final  ",
      sport: "cricket",
      scheduledAt: "2026-04-20T10:00:00.000Z",
      status: "live",
      thumbnail: "final.jpg",
    },
    "e2",
    1700000000000
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 201);
    assert.deepEqual(result.event, {
      id: "e2",
      name: "Big Final",
      nameLower: "big final",
      sport: "cricket",
      scheduledAt: "2026-04-20T10:00:00.000Z",
      status: "live",
      thumbnail: "final.jpg",
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
  }
});

test("POST create defaults status and thumbnail", () => {
  const result = buildEventCreateResult(
    {
      name: "Qualifier",
      sport: "football",
      scheduledAt: "2026-05-01T10:00:00.000Z",
    },
    "e3",
    100
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.event.status, "upcoming");
    assert.equal(result.event.thumbnail, null);
  }
});

test("API success and error helper contracts", () => {
  const success = toApiSuccess({ events: seedRows });
  assert.equal(success.success, true);
  assert.equal(success.events.length, 2);

  const error = toApiError("Unexpected error", 500);
  assert.equal(error.success, false);
  assert.equal(error.status, 500);
  assert.equal(error.error, "Unexpected error");
});
