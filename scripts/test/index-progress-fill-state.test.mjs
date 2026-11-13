// lib/shared/index-progress.ts fillState (rails-ops ui-jobs 583): a stored hold
// shows as paused only while the fill's heartbeat is fresh; once the loop stops
// writing, the late or stalled heartbeat wins.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fillState, HEARTBEAT_LATE, HEARTBEAT_STALLED } from "../../lib/shared/index-progress.ts";

const now = Date.parse("2026-11-13T06:26:00Z") / 1000;
const at = (ago) => new Date((now - ago) * 1000).toISOString();
const hold = { reason: "egress-floor", resetsAt: "2026-11-13T14:06:00Z", remainingBytes: 1, floorBytes: 2 };
const entry = (ago, held) => ({ atHead: false, percent: 40, pace: null, head: null, heartbeatAt: at(ago), held });

test("a held fill with a fresh heartbeat is paused", () => {
  assert.equal(fillState(entry(5 * 60, hold), now), "paused");
});

test("a held fill whose heartbeat is late reads late", () => {
  assert.equal(fillState(entry(HEARTBEAT_LATE + 60, hold), now), "late");
});

test("a held fill whose heartbeat is stalled reads stalled", () => {
  assert.equal(fillState(entry(HEARTBEAT_STALLED + 60, hold), now), "stalled");
});

test("a failed job with a stalled heartbeat reads stalled", () => {
  assert.equal(fillState(entry(HEARTBEAT_STALLED + 60, { reason: "job-failed" }), now), "stalled");
});

test("an unheld fill that is not gaining reads late while its heartbeat is fresh", () => {
  assert.equal(fillState({ ...entry(60, null), pace: { blocksPerHour: 0 } }, now), "late");
});
