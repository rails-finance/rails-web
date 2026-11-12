// A branch's shutdown state from its stored record and its live read (ui-jobs 612):
// the record draws "Shut down" without the live read, a live "not shut down"
// shows as a disagreement and never replaces the record, and a deployment with no
// record draws the state from a live shutdown only.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  branchShutdownState,
  settleShutdownTime,
  shutdownTtlMs,
  SHUTDOWN_FAILED_TTL_MS,
  SHUTDOWN_FALSE_TTL_MS,
} from "../../lib/liquity-fork/shutdown.ts";

const source = {
  contract: "ActivePool",
  address: "0x83a095a74839ad88c24e77f1e9a54baaa7ff5157",
  call: "ActivePool.shutdownTime()",
  block: 26_400_160,
};
const record = {
  by: "admin",
  shutdown: {
    at: 1_787_265_479,
    tx: "0xcf1dc077db5a5139e9b0c58ef0726882260e3d1f1c0dfb43b84deaf55894514a",
    block: 25_799_370,
  },
};

test("a shutdownTime answer settles to shut down, live or not known", () => {
  assert.deepEqual(settleShutdownTime(1_787_265_479n, source), {
    shutDown: true,
    at: 1_787_265_479,
    raw: "1787265479",
    source,
  });
  assert.deepEqual(settleShutdownTime(0n, source), { shutDown: false, at: null, raw: "0", source });
  assert.deepEqual(settleShutdownTime(null, source), { shutDown: null, at: null, raw: null, source });
});

test("a true answer is kept for the process, false ten minutes, a failed read 30 s", () => {
  assert.equal(shutdownTtlMs({ shutDown: true }), Number.POSITIVE_INFINITY);
  assert.equal(shutdownTtlMs({ shutDown: false }), SHUTDOWN_FALSE_TTL_MS);
  assert.equal(SHUTDOWN_FALSE_TTL_MS, 600_000);
  assert.equal(shutdownTtlMs({ shutDown: null }), SHUTDOWN_FAILED_TTL_MS);
  assert.equal(SHUTDOWN_FAILED_TTL_MS, 30_000);
});

test("the record draws the state before any live read", () => {
  const s = branchShutdownState(record, null);
  assert.equal(s?.at, record.shutdown.at);
  assert.equal(s?.disagree, false);
  assert.equal(s?.live, null);
});

test("a live read that confirms the record keeps it, with the live answer beside it", () => {
  const live = settleShutdownTime(1_787_265_479n, source);
  const s = branchShutdownState(record, live);
  assert.equal(s?.disagree, false);
  assert.equal(s?.live, live);
});

test("a live 'not shut down' against the record is a disagreement, and the record still draws", () => {
  const s = branchShutdownState(record, settleShutdownTime(0n, source));
  assert.equal(s?.at, record.shutdown.at);
  assert.equal(s?.disagree, true);
});

test("a failed live read leaves the record standing with no disagreement", () => {
  const s = branchShutdownState(record, settleShutdownTime(null, source));
  assert.equal(s?.disagree, false);
});

test("with no record, only a live shutdown draws the state", () => {
  assert.equal(branchShutdownState(undefined, settleShutdownTime(0n, source)), null);
  assert.equal(branchShutdownState(undefined, settleShutdownTime(null, source)), null);
  assert.equal(branchShutdownState(undefined, null), null);
  const s = branchShutdownState(undefined, settleShutdownTime(1_800_000_000n, source));
  assert.equal(s?.at, 1_800_000_000);
  assert.equal(s?.record, null);
});
