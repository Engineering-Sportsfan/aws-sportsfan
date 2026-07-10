import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFiltersAndSorting,
  buildListQuery,
  buildPagination,
  buildUpdateData,
  canDeleteRecord,
  extractClubProfileId,
  getDisplayError,
  isAuthenticated,
  mapFormToApiPayload,
  nextLoadingState,
  paginateRows,
  toApiError,
  toApiSuccess,
  validateAdminForm,
  validateClubProfileCreate,
  type ClubProfileRecord,
} from "./route.contract";

const seedRows: ClubProfileRecord[] = [
  {
    id: "1",
    name: "A",
    team: "India",
    battingStyle: "R",
    bowlingStyle: "RF",
    about: "A",
    avatar: "",
    stats: { runs: "100", sr: "120", avg: "45" },
    overview: { captain: "X", coach: "Y", owner: "Z", venue: "V" },
    createdAt: 200,
    updatedAt: 200,
  },
  {
    id: "2",
    name: "B",
    team: "Australia",
    battingStyle: "L",
    bowlingStyle: "LF",
    about: "B",
    avatar: "",
    stats: { runs: "90", sr: "130", avg: "40" },
    overview: { captain: "X2", coach: "Y2", owner: "Z2", venue: "V2" },
    createdAt: 100,
    updatedAt: 100,
  },
];

test("API endpoint success response helper", () => {
  const result = toApiSuccess({ profile: { id: "abc" } });
  assert.equal(result.success, true);
  assert.deepEqual(result.profile, { id: "abc" });
});

test("API endpoint error response helper", () => {
  const result = toApiError("Fetch failed", 500);
  assert.equal(result.success, false);
  assert.equal(result.status, 500);
  assert.equal(result.message, "Fetch failed");
});

test("API validation requires name and team", () => {
  const bad = validateClubProfileCreate({ name: "", team: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.status, 400);
  }

  const good = validateClubProfileCreate({ name: "Virat", team: "India" });
  assert.equal(good.ok, true);
});

test("Authentication helper validates bearer token", () => {
  assert.equal(isAuthenticated(undefined), false);
  assert.equal(isAuthenticated("Token xyz"), false);
  assert.equal(isAuthenticated("Bearer xyz"), true);
});

test("Database create payload mapping works", () => {
  const now = 1700000000000;
  const payload = mapFormToApiPayload(
    {
      name: "Virat",
      team: "India",
      statsRuns: "1000",
      overviewCaptain: "Rohit",
    },
    "https://img",
    now
  );

  assert.equal(payload.name, "Virat");
  assert.equal(payload.team, "India");
  assert.equal(payload.stats.runs, "1000");
  assert.equal(payload.overview.captain, "Rohit");
  assert.equal(payload.createdAt, now);
  assert.equal(payload.updatedAt, now);
});

test("Database update patch keeps existing values", () => {
  const existing = mapFormToApiPayload(
    { name: "Old", team: "India", statsRuns: "12", overviewCoach: "Coach A" },
    "avatar-old",
    10
  );

  const patch = buildUpdateData(
    existing,
    { team: "India A", statsRuns: "44" },
    20,
    undefined
  );

  assert.equal(patch.name, "Old");
  assert.equal(patch.team, "India A");
  assert.equal(patch.stats.runs, "44");
  assert.equal(patch.avatar, "avatar-old");
  assert.equal(patch.createdAt, 10);
  assert.equal(patch.updatedAt, 20);
});

test("Database query supports sorting and filtering", () => {
  const rows = applyFiltersAndSorting(seedRows, "India");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].team, "India");

  const sorted = applyFiltersAndSorting(seedRows);
  assert.equal(sorted[0].createdAt > sorted[1].createdAt, true);
});

test("Database pagination and offsets", () => {
  const query = buildListQuery("2", "1");
  assert.equal(query.page, 2);
  assert.equal(query.limit, 1);
  assert.equal(query.offset, 1);
  assert.equal(query.sortBy, "createdAt");

  const pageRows = paginateRows(applyFiltersAndSorting(seedRows), 2, 1);
  assert.equal(pageRows.length, 1);
  assert.equal(pageRows[0].id, "2");

  const pageMeta = buildPagination(2, 2, 1);
  assert.equal(pageMeta.totalPages, 2);
});

test("Database edge cases clamp invalid page and limit", () => {
  const query = buildListQuery("-5", "1000");
  assert.equal(query.page, 1);
  assert.equal(query.limit, 100);
});

test("Delete operation handles record-not-found edge case", () => {
  const missing = canDeleteRecord(false);
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.status, 404);
  }

  const ok = canDeleteRecord(true);
  assert.equal(ok.success, true);
});

test("Admin panel form validation", () => {
  const bad = validateAdminForm({ name: "", team: "" });
  assert.equal(bad.valid, false);
  assert.equal(bad.errors.includes("Name is required"), true);
  assert.equal(bad.errors.includes("Team is required"), true);

  const good = validateAdminForm({ name: "Valid", team: "RCB" });
  assert.equal(good.valid, true);
});

test("Admin panel error display helper", () => {
  assert.equal(getDisplayError(new Error("Server failed")), "Server failed");
  assert.equal(getDisplayError("Network down"), "Network down");
  assert.equal(getDisplayError({}), "Something went wrong");
});

test("Admin panel loading state transitions", () => {
  let state = nextLoadingState("idle", "submit");
  assert.equal(state, "submitting");
  state = nextLoadingState(state, "success");
  assert.equal(state, "success");
  state = nextLoadingState(state, "reset");
  assert.equal(state, "idle");
});

test("Extract club profile id from route", () => {
  assert.equal(extractClubProfileId("/api/club-profile/abc"), "abc");
  assert.equal(extractClubProfileId("/api/club-profile/abc/"), "abc");
});
