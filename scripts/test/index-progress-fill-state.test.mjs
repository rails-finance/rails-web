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
import { withHeadMisses, MISS_RESUME_GRACE } from "../../lib/shared/index-progress.ts";

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

test("a refusal lapses once its reset and the resume grace have passed", () => {
  const reset = Date.parse("2026-11-13T14:06:09.022Z") / 1000;
  const miss = { chain: 1, reason: "gateway-refused", until: "2026-11-13T14:06:09.022Z", at: "2026-11-13T14:06:00Z" };
  const old = { ...entry(HEARTBEAT_STALLED + 60, null), heartbeatAt: "2026-11-13T05:58:32Z", headMiss: miss };
  assert.equal(fillState(old, reset + 10 * 60), "paused");
  assert.equal(fillState(old, reset + MISS_RESUME_GRACE + 60), "stalled");
  // With no readable until, the refusal stands for HEARTBEAT_LATE after its at.
  for (const until of [null, "not a time"]) {
    assert.equal(fillState({ ...old, headMiss: { ...miss, until } }, reset + MISS_RESUME_GRACE + 60), "paused");
  }
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
});

test("one visit that failed is too few to judge: not measured, not green", () => {
  assert.equal(visitState({ lastHourVisits: 1, failedShare: 1 }), "none");
  assert.equal(visitState({ lastHourVisits: 2, failedShare: 0.5 }), "fresh");
  assert.equal(visitState({ lastHourVisits: 2, failedShare: 1 }), "stalled");
  assert.equal(visitState({ lastHourVisits: 1, answered: 0, failedShare: 1 }), "none");
  assert.equal(visitState({ lastHourVisits: 1, answered: 1, failedShare: 0 }), "fresh");
});

// censusRuns: a census that stops at its share or deadline is held while the
// run is recent; three stuck stops are an alarm; a failed run is late.
import { withCensusRuns, censusDue } from "../../lib/shared/index-progress.ts";

const censusRun = (over) => ({
  chain: 1,
  family: "aave",
  families: ["stata"],
  outcome: "stopped-share",
  startedAt: at(3 * 3600),
  endedAt: at(2 * 3600),
  vaultsWritten: 0,
  chunksSaved: 4,
  stoppedAtVault: null,
  gateway: "mainnet.gateway.tenderly.co",
  remainingMb: 690,
  floorMb: 700,
  resetsAt: "2026-11-13T14:06:09.022Z",
  error: null,
  shareStopsInARow: 1,
  stuckStopsInARow: 0,
  ...over,
});
const censusWriter = (ranAgo, ok = true) => ({
  name: "vault-census",
  kind: "processor",
  lastWriteAt: at(40 * 3600),
  expectEverySec: 86400,
  lastRunAt: at(ranAgo),
  lastRunOk: ok,
});
const censusStatus = (run, writer = censusWriter(2 * 3600)) =>
  withCensusRuns({
    asOf: at(0),
    entries: [
      {
        protocol: "aave-vaults",
        chain: 1,
        backfill: null,
        live: { lane: "x", checkpoint: null, head: null, writers: [writer] },
      },
    ],
    censusRuns: run ? [run] : [],
  });

test("a census stopped at its share is paused while the run is recent", () => {
  const s = censusStatus(censusRun());
  assert.equal(writerState(s.entries[0].live.writers[0], now, s.entries[0]), "paused");
});

test("a census past its due time and the grace with no newer run is late", () => {
  const s = censusStatus(censusRun({ resetsAt: at(3 * 3600) }));
  assert.equal(writerState(s.entries[0].live.writers[0], now, s.entries[0]), "late");
});

test("a census whose run never came reads stalled three schedules past its due time", () => {
  const s = censusStatus(censusRun({ resetsAt: at(3 * 86400 + 60) }));
  assert.equal(writerState(s.entries[0].live.writers[0], now, s.entries[0]), "stalled");
});

test("the next run comes from nextRunAt, else after the reset, else a schedule after the run", () => {
  const w = (run, ranAgo = 2 * 3600) => ({ ...censusWriter(ranAgo), censusRun: run });
  assert.deepEqual(censusDue(w(censusRun({ nextRunAt: "2026-11-13T14:12:00.000Z" }))), {
    at: Date.parse("2026-11-13T14:12:00Z") / 1000,
    after: false,
  });
  // nextRunAt has moved to tomorrow's slot; the due time is the first slot after the stop.
  assert.deepEqual(
    censusDue(w(censusRun({ endedAt: "2026-11-12T14:40:00.000Z", nextRunAt: "2026-11-14T14:12:00.000Z" }))),
    { at: Date.parse("2026-11-13T14:12:00Z") / 1000, after: false },
  );
  assert.deepEqual(censusDue(w(censusRun())), { at: Date.parse("2026-11-13T14:06:09.022Z") / 1000, after: true });
  assert.deepEqual(censusDue(w(censusRun({ outcome: "stopped-deadline", resetsAt: null }))), {
    at: now - 2 * 3600 + 86400,
    after: false,
  });
  assert.equal(censusDue(w(censusRun({ outcome: "completed" }))), null);
});

test("three stops in the same vault are stalled; a failed run is late", () => {
  const stuck = censusStatus(censusRun({ stuckStopsInARow: 3 }));
  assert.equal(writerState(stuck.entries[0].live.writers[0], now, stuck.entries[0]), "stalled");
  const failed = censusStatus(censusRun({ outcome: "failed", error: "boom" }), censusWriter(2 * 3600, false));
  assert.equal(writerState(failed.entries[0].live.writers[0], now, failed.entries[0]), "late");
});

test("an answer without censusRuns leaves the census writer as it was", () => {
  const s = censusStatus(null);
  assert.equal(s.entries[0].live.writers[0].censusRun, undefined);
  assert.equal(writerState(s.entries[0].live.writers[0], now, s.entries[0]), "fresh");
});

// The visit window follows the snapshot's asOf across the hour boundary.
import { visitWindowStart } from "../../lib/shared/index-progress.ts";

test("visit window starts at the previous clock hour of the snapshot", () => {
  const h = (hh, mm = 0, ss = 0) => Date.UTC(2026, 10, 13, hh, mm, ss) / 1000;
  assert.equal(visitWindowStart(h(13, 59, 59)), h(12));
  assert.equal(visitWindowStart(h(14, 0, 0)), h(13));
  assert.equal(visitWindowStart(h(14, 0, 30)), h(13));
});

// Two censuses on one entry: each writer takes its own run, by censusScope,
// else by censusFamilies, else by the entry's family.
import { censusScopeOf } from "../../lib/shared/index-progress.ts";

test("each Morpho census writer takes its own run", () => {
  const mm = censusRun({ family: "metamorpho", families: ["morpho"], outcome: "completed" });
  const v2 = censusRun({ family: "vault-v2", families: ["morpho-v2"], outcome: "failed", error: "RangeError: x" });
  const base = censusRun({ chain: 8453, family: "vault-v2", families: ["morpho-v2"], outcome: "completed" });
  const s = withCensusRuns({
    asOf: at(0),
    entries: [
      {
        protocol: "morpho",
        chain: 1,
        backfill: null,
        live: {
          lane: "x",
          checkpoint: null,
          head: null,
          writers: [
            { name: "morpho-processor", kind: "processor", lastWriteAt: at(60), newest: null },
            { ...censusWriter(3600), censusScope: "metamorpho" },
            { ...censusWriter(3600, false), censusFamilies: ["morpho-v2"] },
          ],
        },
      },
    ],
    censusRuns: [mm, base, v2],
  });
  const [, a, b] = s.entries[0].live.writers;
  assert.equal(a.censusRun.family, "metamorpho");
  assert.equal(b.censusRun, v2);
  assert.equal(censusScopeOf(a, "morpho"), "metamorpho");
  assert.equal(writerState(b, now, s.entries[0]), "late");
});

test("an answer without censusScope still matches by the entry's family", () => {
  const s = censusStatus(censusRun());
  assert.equal(s.entries[0].live.writers[0].censusRun.family, "aave");
  assert.equal(censusScopeOf(s.entries[0].live.writers[0], "aave-vaults"), "aave");
});

import { errorKind } from "../../lib/shared/index-progress.ts";

test("an error shows its class name, never its text", () => {
  assert.equal(
    errorKind("RangeError: Maximum call stack size exceeded\n    at main (/app/src/x.ts:1:1)"),
    "RangeError",
  );
  assert.equal(errorKind("Error: connect ECONNREFUSED 10.0.0.1:5432"), "Upstream refused");
  assert.equal(errorKind("fetch failed to 10.0.0.1"), "Error");
  assert.equal(errorKind("socket timed out"), "Timeout");
});

test("a held census does not take a row with its own index; a late one raises it", () => {
  const held = { ...censusWriter(2 * 3600), censusRun: censusRun() };
  const failed = { ...censusWriter(2 * 3600, false), censusRun: censusRun({ outcome: "failed", error: "RangeError" }) };
  const row = (writers, checkpoint = { block: 1, time: null, updatedAt: at(60) }) => ({
    protocol: "morpho",
    chain: 1,
    backfill: null,
    live: { lane: "sieve", checkpoint, head: null, writers },
  });
  assert.equal(pipelineState(row([held]), now), "fresh");
  assert.equal(pipelineState(row([held, failed]), now), "late");
  assert.equal(pipelineState(row([held], null), now), "paused");
});

import { pipelineHeartbeat, hasOwnIndex } from "../../lib/shared/index-progress.ts";

test("a row with its own index takes its last write from the index, not a census", () => {
  const stale = {
    name: "base-lending-copy",
    kind: "copy-worker",
    lastWriteAt: at(5 * 3600),
    expectEverySec: 600,
    newest: null,
  };
  const census = { ...censusWriter(600), lastWriteAt: at(600) };
  const e = {
    protocol: "morpho",
    chain: 8453,
    backfill: null,
    live: { lane: "x", checkpoint: null, head: null, writers: [stale, census] },
  };
  assert.equal(pipelineHeartbeat(e, now), now - 5 * 3600);
  assert.equal(pipelineState(e, now), "stalled");
  const alone = { ...e, protocol: "yearn", live: { ...e.live, writers: [census] } };
  assert.equal(pipelineHeartbeat(alone, now), now - 600);
});

test("a never-run writer is no index of its own: a held census still holds the row", () => {
  const never = {
    name: "base-lending-copy",
    kind: "copy-worker",
    lastWriteAt: null,
    lastRunAt: null,
    expectEverySec: 600,
    newest: null,
  };
  const held = { ...censusWriter(2 * 3600), censusRun: censusRun() };
  const e = {
    protocol: "morpho",
    chain: 8453,
    backfill: null,
    live: { lane: "x", checkpoint: null, head: null, writers: [never, held] },
  };
  assert.equal(writerState(never, now, e), "none");
  assert.equal(hasOwnIndex(e, now), false);
  assert.equal(pipelineState(e, now), "paused");
  assert.equal(pipelineHeartbeat(e, now), now - 40 * 3600);
});

test("a failed census whose last write is three schedules old reads stalled", () => {
  const failed = (wroteAgo) => ({
    ...censusWriter(3 * 3600, false),
    lastWriteAt: at(wroteAgo),
    censusRun: censusRun({ outcome: "failed", error: "RangeError: x" }),
  });
  assert.equal(writerState(failed(4 * 86400), now), "stalled");
  assert.equal(writerState(failed(2 * 86400), now), "late");
  assert.equal(writerState({ ...failed(4 * 86400), name: "morpho-processor", censusRun: undefined }, now), "late");
});
