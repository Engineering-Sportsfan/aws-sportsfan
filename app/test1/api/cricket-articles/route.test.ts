import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminApiRequest,
  buildListQuery,
  buildPagination,
  canDeleteArticle,
  extractArticleId,
  filterSortArticles,
  getDisplayError,
  isAuthenticated,
  mapCreateArticlePayload,
  mapUpdateArticlePayload,
  nextLoadingState,
  paginateRows,
  toApiError,
  toApiSuccess,
  validateAdminArticleForm,
  validateCreateArticle,
  validateUpdateArticle,
  type CricketArticle,
} from "./route.contract";

const seedRows: CricketArticle[] = [
  {
    id: "1",
    badge: "NEWS",
    title: "News A",
    readTime: "3 min read",
    views: "1K views",
    image: "a.jpg",
    tags: ["tag1", "tag2"],
    createdAt: 200,
    updatedAt: 200,
  },
  {
    id: "2",
    badge: "ANALYSIS",
    title: "Analysis B",
    readTime: "6 min read",
    views: "2K views",
    image: "b.jpg",
    tags: ["tag3"],
    createdAt: 100,
    updatedAt: 100,
  },
];

test("API create success validation", () => {
  const result = validateCreateArticle({
    badge: "NEWS",
    title: "Title",
    image: "img.jpg",
    tags: ["tag1", "tag2"],
  });
  assert.equal(result.ok, true);
});

test("API success response contract", () => {
  const response = toApiSuccess({ articles: seedRows });
  assert.equal(response.success, true);
  assert.equal(response.articles.length, 2);
});

test("API error response contract", () => {
  const response = toApiError("Unexpected error", 500);
  assert.equal(response.success, false);
  assert.equal(response.status, 500);
  assert.equal(response.error, "Unexpected error");
});

test("API create error handling for required fields", () => {
  const result = validateCreateArticle({ title: "", image: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "title and image are required");
  }
});

test("API create validation for badge", () => {
  const result = validateCreateArticle({ title: "T", image: "I", badge: "BADGE" });
  assert.equal(result.ok, false);
});

test("API update validation for badge", () => {
  const bad = validateUpdateArticle({ badge: "WRONG" });
  assert.equal(bad.ok, false);

  const ok = validateUpdateArticle({ badge: "FEATURE" });
  assert.equal(ok.ok, true);
});

test("Authentication helper validates bearer token", () => {
  assert.equal(isAuthenticated(undefined), false);
  assert.equal(isAuthenticated("Token abc"), false);
  assert.equal(isAuthenticated("Bearer abc"), true);
});

test("Database create mapping defaults fields", () => {
  const created = mapCreateArticlePayload({ title: "Hello", image: "hero.jpg" }, "doc-1", 1700);
  assert.equal(created.badge, "NEWS");
  assert.equal(created.readTime, "5 min read");
  assert.equal(created.views, "0 views");
  assert.equal(created.createdAt, 1700);
});

test("Database update mapping keeps existing values", () => {
  const existing = mapCreateArticlePayload(
    { badge: "NEWS", title: "Old", image: "old.jpg", readTime: "4 min read", views: "4K views" },
    "doc-1",
    1000
  );

  const updated = mapUpdateArticlePayload(existing, { title: "New" }, 2000);
  assert.equal(updated.title, "New");
  assert.equal(updated.image, "old.jpg");
  assert.equal(updated.updatedAt, 2000);
});

test("Database query handles filters and sorting", () => {
  const filtered = filterSortArticles(seedRows, "ANALYSIS");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].badge, "ANALYSIS");

  const sorted = filterSortArticles(seedRows, null);
  assert.equal(sorted[0].createdAt > sorted[1].createdAt, true);
});

test("Database query pagination and edge cases", () => {
  const query = buildListQuery("2", "1", "NEWS");
  assert.equal(query.page, 2);
  assert.equal(query.limit, 1);
  assert.equal(query.skip, 1);
  assert.equal(query.badge, "NEWS");

  const rows = paginateRows(filterSortArticles(seedRows), 2, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "2");

  const edge = buildListQuery("-1", "999", "NOPE");
  assert.equal(edge.page, 1);
  assert.equal(edge.limit, 100);
  assert.equal(edge.badge, null);

  const meta = buildPagination(2, 2, 1);
  assert.equal(meta.totalPages, 2);
});

test("Database delete edge case", () => {
  const missing = canDeleteArticle(false);
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.equal(missing.status, 404);
  }

  const ok = canDeleteArticle(true);
  assert.equal(ok.success, true);
});

test("Admin panel form validation", () => {
  const bad = validateAdminArticleForm({ title: "", image: "" });
  assert.equal(bad.valid, false);
  assert.equal(bad.errors.includes("Title is required"), true);
  assert.equal(bad.errors.includes("Image is required"), true);

  const good = validateAdminArticleForm({ title: "Valid", image: "ok.jpg" });
  assert.equal(good.valid, true);
});

test("Admin panel API integration mapping", () => {
  const req = buildAdminApiRequest({ title: "T1", image: "i1.jpg", views: "3K views" });
  assert.deepEqual(req, {
    badge: "NEWS",
    title: "T1",
    readTime: "5 min read",
    views: "3K views",
    image: "i1.jpg",
    tags: [],
  });
});

test("Admin panel error display and loading state", () => {
  assert.equal(getDisplayError(new Error("Failed")), "Failed");
  assert.equal(getDisplayError("Network"), "Network");

  let state = nextLoadingState("idle", "submit");
  assert.equal(state, "submitting");
  state = nextLoadingState(state, "fail");
  assert.equal(state, "error");
  state = nextLoadingState(state, "reset");
  assert.equal(state, "idle");
});

test("Extract article id from route", () => {
  assert.equal(extractArticleId("/api/cricket-articles/abc"), "abc");
  assert.equal(extractArticleId("/api/cricket-articles/abc/"), "abc");
});
