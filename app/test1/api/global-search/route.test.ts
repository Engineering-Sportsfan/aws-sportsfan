// app\test1\api\global-search\route.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchInfo,
  combineResults,
  dedupePlayersByProfileId,
  filterTeamsByContains,
  isJerseyNumberQuery,
  normalizeSearchQuery,
  toApiError,
  toApiSuccess,
  type SearchResult,
} from "./route.contract";

const samplePlayers: SearchResult[] = [
  {
    type: "player",
    id: "doc-1",
    playerProfilesId: "p-1",
    name: "Virat Kohli",
    image: "virat.jpg",
    jerseyNumber: null,
    team: "RCB",
  },
  {
    type: "player",
    id: "doc-2",
    playerProfilesId: "p-1",
    name: "Virat Kohli",
    jerseyNumber: "18",
    team: "RCB",
  },
  {
    type: "player",
    id: "doc-3",
    playerProfilesId: "p-2",
    name: "Rohit Sharma",
    jerseyNumber: "45",
    team: "MI",
  },
];

const sampleTeams: SearchResult[] = [
  {
    type: "team",
    id: "t-1",
    name: "Royal Challengers Bengaluru",
    logo: "rcb.png",
    category: ["IPL"],
  },
  {
    type: "team",
    id: "t-2",
    name: "Mumbai Indians",
    logo: "mi.png",
    category: ["IPL"],
  },
];

test("normalizeSearchQuery returns lowercase trimmed query", () => {
  assert.equal(normalizeSearchQuery("  ViRaT  "), "virat");
});

test("normalizeSearchQuery returns null for empty input", () => {
  assert.equal(normalizeSearchQuery("  "), null);
  assert.equal(normalizeSearchQuery(undefined), null);
  assert.equal(normalizeSearchQuery(null), null);
});

test("isJerseyNumberQuery detects numeric-like values", () => {
  assert.equal(isJerseyNumberQuery("18"), true);
  assert.equal(isJerseyNumberQuery("18abc"), true);
  assert.equal(isJerseyNumberQuery("virat"), false);
});

test("dedupePlayersByProfileId merges duplicates and keeps jersey", () => {
  const deduped = dedupePlayersByProfileId(samplePlayers);
  assert.equal(deduped.length, 2);

  const virat = deduped.find((p) => p.playerProfilesId === "p-1");
  assert.equal(virat?.name, "Virat Kohli");
  assert.equal(virat?.jerseyNumber, "18");
  assert.equal(virat?.image, "virat.jpg");
});

test("filterTeamsByContains does case-insensitive matching when query is normalized", () => {
  const filtered = filterTeamsByContains(sampleTeams, "royal");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "t-1");
});

test("combineResults returns players first then teams", () => {
  const dedupedPlayers = dedupePlayersByProfileId(samplePlayers);
  const results = combineResults(dedupedPlayers, sampleTeams);

  assert.equal(results[0].type, "player");
  assert.equal(results[1].type, "player");
  assert.equal(results[2].type, "team");
});

test("combineResults caps players and teams to 10 each", () => {
  const players = Array.from({ length: 12 }, (_, i) => ({
    type: "player" as const,
    id: `p-${i}`,
    playerProfilesId: `profile-${i}`,
    name: `Player ${i}`,
  }));

  const teams = Array.from({ length: 11 }, (_, i) => ({
    type: "team" as const,
    id: `t-${i}`,
    name: `Team ${i}`,
  }));

  const combined = combineResults(players, teams);
  assert.equal(combined.length, 20);
  assert.equal(combined.filter((x) => x.type === "player").length, 10);
  assert.equal(combined.filter((x) => x.type === "team").length, 10);
});

test("buildSearchInfo reports counts and jersey mode", () => {
  const info = buildSearchInfo("18", 3, 2);
  assert.equal(info.query, "18");
  assert.equal(info.isJerseyNumber, true);
  assert.equal(info.playersFound, 3);
  assert.equal(info.teamsFound, 2);
});

test("toApiSuccess builds response contract", () => {
  const dedupedPlayers = dedupePlayersByProfileId(samplePlayers);
  const results = combineResults(dedupedPlayers, sampleTeams);
  const payload = toApiSuccess(results, "virat");

  assert.equal(payload.success, true);
  assert.equal(payload.totalCount, results.length);
  assert.equal(payload.searchInfo.query, "virat");
  assert.equal(payload.searchInfo.playersFound, 2);
  assert.equal(payload.searchInfo.teamsFound, 2);
});

test("toApiError builds error response contract", () => {
  const payload = toApiError("Search failed");
  assert.equal(payload.success, false);
  assert.equal(payload.error, "Search failed");
  assert.deepEqual(payload.results, []);
});