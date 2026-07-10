import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFiltersAndSorting,
  buildAdminApiRequest,
  buildListQuery,
  buildPagination,
  buildTeam360CreateResult,
  buildTeam360UpdatePatch,
  canDeleteRecord,
  extractTeam360Id,
  getDisplayError,
  isAuthenticated,
  nextLoadingState,
  paginateRows,
  toApiError,
  toApiSuccess,
  validateAdminForm,
  type Team360Record,
} from "./route.contract";

const seedRows: Team360Record[] = [
  {
    id: "1",
    teamName: "India",
    title: "A",
    category: [],
    likes: 10,
    comments: 1,
    live: 0,
    shares: 2,
    image: "a.jpg",
    logo: "a-logo.jpg",
    catlogo: [],
    hasVideo: false,
    createdAt: 200,
    updatedAt: 200,
  },
  {
    id: "2",
    teamName: "Australia",
    title: "B",
    category: [],
    likes: 5,
    comments: 2,
    live: 1,
    shares: 3,
    image: "b.jpg",
    logo: "b-logo.jpg",
    catlogo: [],
    hasVideo: true,
    createdAt: 100,
    updatedAt: 100,
  },
];

test("extractTeam360Id returns the last path segment", () => {
  assert.equal(extractTeam360Id("/api/team360/abc123"), "abc123");
  assert.equal(extractTeam360Id("/api/team360/abc123/"), "abc123");
});

test("buildTeam360CreateResult validates required fields", () => {
  const result = buildTeam360CreateResult(
    {
      teamName: "",
      title: "Match Day",
      image: "/img.jpg",
      logo: "/logo.png",
    },
    "doc-1",
    123
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "teamName, title, image and logo are required");
  }
});

test("buildTeam360CreateResult normalizes create payload", () => {
  const result = buildTeam360CreateResult(
    {
      teamName: "Team A",
      title: "Big Match",
      category: [{ title: "Top" }],
      likes: "12",
      comments: undefined,
      live: "1",
      shares: 0,
      image: "/img.jpg",
      logo: "/logo.png",
      catlogo: [{ label: "Stat" }],
      hasVideo: true,
    },
    "doc-123",
    1700000000000
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 201);
    assert.deepEqual(result.post, {
      id: "doc-123",
      teamName: "Team A",
      title: "Big Match",
      category: [{ title: "Top" }],
      likes: 12,
      comments: 0,
      live: 1,
      shares: 0,
      image: "/img.jpg",
      logo: "/logo.png",
      catlogo: [{ label: "Stat" }],
      hasVideo: true,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
  }
});

test("API success response contract", () => {
  const response = toApiSuccess({ posts: seedRows });
  assert.equal(response.success, true);
  assert.equal(response.posts.length, 2);
});

test("API error response contract", () => {
  const response = toApiError("Unexpected error", 500);
  assert.equal(response.success, false);
  assert.equal(response.status, 500);
  assert.equal(response.error, "Unexpected error");
});

test("buildTeam360UpdatePatch only includes provided fields", () => {
  const patch = buildTeam360UpdatePatch({
    teamName: "Updated Team",
    likes: "9",
    category: [],
    hasVideo: false,
  });

  assert.equal(typeof patch.updatedAt, "number");
  assert.equal(patch.teamName, "Updated Team");
  assert.equal(patch.likes, 9);
  assert.deepEqual(patch.category, []);
  assert.equal(patch.hasVideo, false);
  assert.equal(Object.hasOwn(patch, "title"), false);
  assert.equal(Object.hasOwn(patch, "logo"), false);
});

test("authentication helper validates bearer token", () => {
  assert.equal(isAuthenticated(undefined), false);
  assert.equal(isAuthenticated("Token abc"), false);
  assert.equal(isAuthenticated("Bearer abc"), true);
});

test("database list query supports filtering and sorting", () => {
  const filtered = applyFiltersAndSorting(seedRows, "India");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].teamName, "India");

  const sorted = applyFiltersAndSorting(seedRows, null);
  assert.equal(sorted[0].createdAt > sorted[1].createdAt, true);
});

test("database list query pagination and edge cases", () => {
  const query = buildListQuery("2", "1", "India");
  assert.equal(query.page, 2);
  assert.equal(query.limit, 1);
  assert.equal(query.offset, 1);
  assert.equal(query.team, "India");

  const rows = paginateRows(applyFiltersAndSorting(seedRows), 2, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "2");

  const edge = buildListQuery("-1", "999", null);
  assert.equal(edge.page, 1);
  assert.equal(edge.limit, 100);

  const meta = buildPagination(2, 2, 1);
  assert.equal(meta.totalPages, 2);
});

test("database delete edge case", () => {
  const missing = canDeleteRecord(false);
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.status, 404);
  }

  const ok = canDeleteRecord(true);
  assert.equal(ok.success, true);
});

test("admin panel form validation", () => {
  const bad = validateAdminForm({ teamName: "", title: "", image: "", logo: "" });
  assert.equal(bad.valid, false);
  assert.equal(bad.errors.includes("Team Name is required"), true);
  assert.equal(bad.errors.includes("Title is required"), true);
  assert.equal(bad.errors.includes("Image is required"), true);
  assert.equal(bad.errors.includes("Logo is required"), true);

  const good = validateAdminForm({
    teamName: "India",
    title: "Big Match",
    image: "img.jpg",
    logo: "logo.jpg",
  });
  assert.equal(good.valid, true);
});

test("admin panel API integration mapping", () => {
  const req = buildAdminApiRequest({
    teamName: "India",
    title: "Big Match",
    likes: "12",
    image: "img.jpg",
    logo: "logo.jpg",
    hasVideo: true,
  });

  assert.deepEqual(req, {
    teamName: "India",
    title: "Big Match",
    category: [],
    likes: 12,
    comments: 0,
    live: 0,
    shares: 0,
    image: "img.jpg",
    logo: "logo.jpg",
    catlogo: [],
    hasVideo: true,
  });
});

test("admin panel error display and loading states", () => {
  assert.equal(getDisplayError(new Error("Server failed")), "Server failed");
  assert.equal(getDisplayError("Network"), "Network");
  assert.equal(getDisplayError({}), "Something went wrong");

  let state = nextLoadingState("idle", "submit");
  assert.equal(state, "submitting");
  state = nextLoadingState(state, "success");
  assert.equal(state, "success");
  state = nextLoadingState(state, "reset");
  assert.equal(state, "idle");
});
