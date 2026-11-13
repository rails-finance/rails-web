// lib/shared/index-progress.ts fillState (rails-ops ui-jobs 583): a stored hold
// shows as paused only while the fill's heartbeat is fresh; once the loop stops
// writing, the late or stalled heartbeat wins.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  fillState,
  pipelineState,
  writerState,
  HEARTBEAT_LATE,
  HEARTBEAT_STALLED,
} from "../../lib/shared/index-progress.ts";

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

// The fill's writer stamps the hourly sample against a 10 min plan interval;
// it reads as the fill does, not as late against that interval.
const fillWriter = (ago) => ({
  name: "at-block-fill",
  kind: "processor",
  lastWriteAt: at(ago),
  expectEverySec: 600,
  lastRunAt: null,
});
const status = (ago, held) => ({
  protocol: "cow",
  chain: 1,
  backfill: { ...entry(ago, held), pipeline: "at-block-fill", rows: null },
  live: { writers: [fillWriter(ago)] },
});

test("a held fill's writer 62 min after its sample is paused, not stalled", () => {
  const e = status(62 * 60, hold);
  assert.equal(writerState(e.live.writers[0], now, e), "paused");
  assert.equal(pipelineState(e, now), "paused");
});

test("an unheld fill's writer is fresh within the fill's limit", () => {
  const e = status(62 * 60, null);
  assert.equal(writerState(e.live.writers[0], now, e), "fresh");
});

test("other writers keep their own interval", () => {
  const w = {
    name: "makerdao-backfill",
    kind: "processor",
    lastWriteAt: at(20 * 60),
    expectEverySec: 300,
    lastRunAt: null,
  };
  assert.equal(writerState(w, now, status(60, null)), "stalled");
});

// counterChains: chains whose counters reset together share one.
import { counterChains } from "../../lib/shared/index-progress.ts";

test("gateways resetting with the allowance share its counter; the rest count alone", () => {
  const a = { host: "arbitrum.gateway.tenderly.co", resetsAt: "2026-11-13T14:06:09.022Z" };
  const g = (chain, resetsAt) => ({ chain, resetsAt });
  const r = counterChains(a, [
    g(1, "2026-11-13T14:06:09.022Z"),
    g(10, "2026-11-14T06:44:56.759Z"),
    g(5042, "2026-11-14T06:44:56.829Z"),
    g(8453, "2026-11-13T14:06:09.022Z"),
    g(42161, "2026-11-13T14:06:09.022Z"),
    g(11155111, "2026-11-13T14:06:09.022Z"),
    g(4663, null),
  ]);
  assert.deepEqual(r, { shared: [1, 8453, 42161, 11155111], own: [10, 5042] });
});

// headMisses: a refusal at the last heartbeat is a pause until the reset; a
// failed read is late; a miss no heartbeat replaced does not stand.
import { withHeadMisses } from "../../lib/shared/index-progress.ts";

const refused = (ago) => ({ chain: 1, reason: "gateway-refused", until: "2026-11-13T14:06:09.022Z", at: at(ago) });

test("a refused chain reads paused though its samples are hours old", () => {
  const p = withHeadMisses({
    asOf: at(0),
    indexes: [{ ...entry(HEARTBEAT_STALLED + 60, null), chain: 1 }],
    headMisses: [refused(5 * 60)],
  });
  assert.equal(fillState(p.indexes[0], now), "paused");
});

test("a failed read is late, and stalled once the samples are three hours old", () => {
  const miss = { chain: 1, reason: "read-failed", until: null, at: at(60) };
  assert.equal(fillState({ ...entry(20 * 60, hold), headMiss: miss }, now), "late");
  assert.equal(fillState({ ...entry(HEARTBEAT_STALLED + 60, null), headMiss: miss }, now), "stalled");
});

test("a miss older than the late limit no longer stands", () => {
  assert.equal(
    fillState({ ...entry(HEARTBEAT_STALLED + 60, hold), headMiss: refused(HEARTBEAT_LATE + 60) }, now),
    "stalled",
  );
});

test("an answer without headMisses is unchanged; a status answer marks fill backfills only", () => {
  const p = { asOf: at(0), indexes: [entry(60, null)] };
  assert.equal(withHeadMisses(p), p);
  const s = withHeadMisses({
    asOf: at(0),
    entries: [
      { protocol: "cow", chain: 1, backfill: { pipeline: "fill" }, live: null },
      { protocol: "makerdao", chain: 1, backfill: { pipeline: "makerdao-backfill" }, live: null },
      { protocol: "cow", chain: 8453, backfill: { pipeline: "fill" }, live: null },
    ],
    headMisses: [refused(60)],
  });
  assert.equal(s.entries[0].backfill.headMiss.reason, "gateway-refused");
  assert.equal(s.entries[1].backfill.headMiss, undefined);
  assert.equal(s.entries[2].backfill.headMiss, null);
});

// Visit reads: one failure in a quiet hour stays green.
import { visitState } from "../../lib/shared/index-progress.ts";

test("one failed read of seven stays fresh; two of seven are late; four of seven stalled", () => {
  assert.equal(visitState({ lastHourVisits: 7, failedShare: 1 / 7 }), "fresh");
  assert.equal(visitState({ lastHourVisits: 7, failedShare: 2 / 7 }), "late");
  assert.equal(visitState({ lastHourVisits: 7, failedShare: 4 / 7 }), "stalled");
  assert.equal(visitState({ lastHourVisits: 1, failedShare: 1 }), "fresh");
});
