import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESENCE_TTL_MS,
  isWithinTtl,
  dedupeByUid,
  sortByRecency,
  buildPresencePayload,
  type FanRecord,
} from "./presence.contract";

const fan = (uid: string, lastSeenAt: number, overrides: Partial<FanRecord> = {}): FanRecord => ({
  uid,
  username: `user_${uid}`,
  avatarUrl: null,
  badge: null,
  lastSeenAt,
  ...overrides,
});

// --- isWithinTtl ---

test("isWithinTtl: record seen exactly at cutoff is still within TTL", () => {
  const now = 100_000;
  assert.equal(isWithinTtl(now - PRESENCE_TTL_MS, now), true);
});

test("isWithinTtl: record seen 1ms before cutoff is expired", () => {
  const now = 100_000;
  assert.equal(isWithinTtl(now - PRESENCE_TTL_MS - 1, now), false);
});

test("isWithinTtl: record seen now is within TTL", () => {
  const now = 100_000;
  assert.equal(isWithinTtl(now, now), true);
});

// --- dedupeByUid ---

test("dedupeByUid: keeps most recent entry per uid", () => {
  const records = [fan("a", 100), fan("a", 300), fan("a", 200)];
  const result = dedupeByUid(records);
  assert.equal(result.length, 1);
  assert.equal(result[0].lastSeenAt, 300);
});

test("dedupeByUid: leaves distinct uids untouched", () => {
  const records = [fan("a", 100), fan("b", 200)];
  assert.equal(dedupeByUid(records).length, 2);
});

test("dedupeByUid: empty input returns empty output", () => {
  assert.deepEqual(dedupeByUid([]), []);
});

// --- sortByRecency ---

test("sortByRecency: orders most recent first", () => {
  const records = [fan("a", 100), fan("b", 300), fan("c", 200)];
  const sorted = sortByRecency(records);
  assert.deepEqual(sorted.map(r => r.uid), ["b", "c", "a"]);
});

test("sortByRecency: does not mutate input array", () => {
  const records = [fan("a", 100), fan("b", 300)];
  const copy = [...records];
  sortByRecency(records);
  assert.deepEqual(records, copy);
});

// --- buildPresencePayload: the core invariant ---

test("buildPresencePayload: fanCount equals true active count even when it exceeds maxFans", () => {
  // This is the regression test for the bug found while wiring this up:
  // POST's old query had .limit(3) applied BEFORE counting, so fanCount
  // silently capped at 3. Here we simulate 7 active fans with no upstream
  // limit and assert fanCount reflects all 7, while fans is still capped.
  const records = Array.from({ length: 7 }, (_, i) => fan(`u${i}`, 1000 + i));
  const payload = buildPresencePayload(records, { totalJoinCount: 50, pinnedPost: null });
  assert.equal(payload.fanCount, 7);
  assert.equal(payload.fans.length, 3);
});

test("buildPresencePayload: fanCount and fans.length agree when active count <= maxFans", () => {
  const records = [fan("a", 100), fan("b", 200)];
  const payload = buildPresencePayload(records, { totalJoinCount: 2, pinnedPost: null });
  assert.equal(payload.fanCount, 2);
  assert.equal(payload.fans.length, 2);
});

test("buildPresencePayload: zero active fans", () => {
  const payload = buildPresencePayload([], { totalJoinCount: 0, pinnedPost: null });
  assert.equal(payload.fanCount, 0);
  assert.deepEqual(payload.fans, []);
});

test("buildPresencePayload: invariant holds across a range of fan counts 0-50", () => {
  for (let n = 0; n <= 50; n++) {
    const records = Array.from({ length: n }, (_, i) => fan(`u${i}`, i));
    const payload = buildPresencePayload(records, { totalJoinCount: n, pinnedPost: null });
    assert.equal(payload.fanCount, n, `fanCount mismatch at n=${n}`);
    assert.equal(payload.fans.length, Math.min(n, 3), `fans.length mismatch at n=${n}`);
  }
});

test("buildPresencePayload: fans are sorted most-recent-first and deduped", () => {
  const records = [fan("a", 100), fan("b", 300), fan("a", 400), fan("c", 200)];
  const payload = buildPresencePayload(records, { totalJoinCount: 3, pinnedPost: null });
  assert.equal(payload.fanCount, 3); // a, b, c after dedupe
  assert.deepEqual(payload.fans.map(f => f.uid), ["a", "b", "c"]);
});

test("buildPresencePayload: public fan objects never leak lastSeenAt", () => {
  const records = [fan("a", 100)];
  const payload = buildPresencePayload(records, { totalJoinCount: 1, pinnedPost: null });
  assert.equal((payload.fans[0] as any).lastSeenAt, undefined);
});

test("buildPresencePayload: passes totalJoinCount and pinnedPost through unchanged", () => {
  const pin = { msgId: "m1", text: "hi" };
  const payload = buildPresencePayload([], { totalJoinCount: 42, pinnedPost: pin });
  assert.equal(payload.totalJoinCount, 42);
  assert.equal(payload.pinnedPost, pin);
});

test("buildPresencePayload: respects custom maxFans", () => {
  const records = Array.from({ length: 10 }, (_, i) => fan(`u${i}`, i));
  const payload = buildPresencePayload(records, { totalJoinCount: 10, pinnedPost: null, maxFans: 5 });
  assert.equal(payload.fanCount, 10);
  assert.equal(payload.fans.length, 5);
});