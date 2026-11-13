// lib/vaults/config-changes.ts and lib/vaults/steward-runs.ts: a MetaMorpho
// vault's configuration changes in words, and a steward's runs (rails-ops
// ui-jobs 554, point 1 and piece C). Hand-made logs in the route's shape.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceOf,
  changeRows,
  changeWords,
  changesScope,
  coveredThrough,
  recentChanges,
  timelockAdjective,
  timelockText,
} from "../../lib/vaults/config-changes.ts";
import { spanOf, stewardRuns } from "../../lib/vaults/steward-runs.ts";

const DAY = 86_400;
const NOW = 1_794_000_000;
const ID = "0x" + "ab".repeat(32);
const ID2 = "0x" + "cd".repeat(32);
const A1 = "0x" + "11".repeat(20);
const A2 = "0x" + "22".repeat(20);
const ZERO = "0x" + "00".repeat(20);

let seq = 0;
/** A log `daysAgo` before NOW, at a block that grows with time. */
const log = (event, args, daysAgo) => {
  const t = NOW - Math.round(daysAgo * DAY);
  return {
    blockNumber: 1_000_000 + Math.floor(t / 12) - 140_000_000,
    blockTime: t,
    txHash: "0x" + String(++seq).padStart(64, "0"),
    txIndex: 0,
    logIndex: seq,
    event,
    args,
    source: "index",
  };
};

const F = {
  date: (ts) => `day ${Math.floor((NOW - ts) / DAY)} ago`,
  amount: (raw) => `${Number(raw) / 1e6} USDC`,
  market: (id) => (id === ID ? "the wstETH market" : null),
};

/** The block a log at NOW sits at: the page's block. */
const HEAD = 1_000_000 + Math.floor(NOW / 12) - 140_000_000;
/** One change in words against `all`, the page's timelock read and whether the answer was truncated. */
const W = (c, all, timelock = null, truncated = false) =>
  changeWords(c, { all, truncated, timelock, asOf: { block: HEAD, time: NOW } }, F);

const newestFirst = (xs) => [...xs].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);

test("the window is the 30 days to the page's block time, at or before its block", () => {
  const old = log("SetCap", { caller: A1, id: ID, cap: "5000000" }, 33);
  const recent = log("SetCap", { caller: A1, id: ID, cap: "7000000" }, 3);
  const later = log("SetCap", { caller: A1, id: ID, cap: "9000000" }, 1);
  const asOf = { block: recent.blockNumber + 1, time: NOW - 2 * DAY };
  assert.deepEqual(
    recentChanges(newestFirst([old, recent, later]), asOf).map((c) => c.args.cap),
    ["7000000"],
  );
});

test("a cap names its market and the value before where an earlier SetCap is in the answer", () => {
  const first = log("SetCap", { caller: A1, id: ID, cap: "5000000" }, 40);
  const up = log("SetCap", { caller: A1, id: ID, cap: "7000000" }, 3);
  const all = newestFirst([first, up]);
  assert.equal(W(up, all, DAY).text, "Cap on the wstETH market raised from 5 USDC to 7 USDC");
  assert.equal(W(first, all, DAY).text, "Cap on the wstETH market set to 5 USDC");
  const down = log("SetCap", { caller: A1, id: ID2, cap: "0" }, 2);
  const prev = log("SetCap", { caller: A1, id: ID2, cap: "1000000" }, 50);
  assert.match(W(down, [down, prev], DAY).text, /^Cap on market 0xcdcd…cdcd lowered from 1 USDC to zero$/);
  const max = log("SetCap", { caller: A1, id: ID, cap: ((1n << 184n) - 1n).toString() }, 1);
  assert.match(W(max, [max], DAY).text, /largest cap the contract takes/);
});

test("a submitted cap waits for the timelock in force then, or says when it was accepted", () => {
  const tl = log("SetTimelock", { caller: A1, newTimelock: String(3 * DAY) }, 100);
  const sub = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 1);
  const w = W(sub, newestFirst([tl, sub]), 7 * DAY);
  assert.equal(w.waiting.validAt, sub.blockTime + 3 * DAY);
  assert.equal(w.waiting.acceptedBy, null);
  assert.match(w.text, /waits for the 3-day timelock and can be accepted from day -2 ago$/);
  // No SetTimelock in the answer: the page's read of the timelock.
  assert.equal(W(sub, [sub], 7 * DAY).waiting.timelock, 7 * DAY);
  // Accepted: the SetCap with the same market and cap that follows, once the timelock has run.
  const earlier = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 5);
  const acc = log("SetCap", { caller: A2, id: ID, cap: "9000000" }, 0);
  const wa = W(earlier, newestFirst([tl, earlier, acc]), 7 * DAY);
  assert.equal(wa.waiting.acceptedBy, acc);
  assert.match(wa.text, /; accepted on day 0 ago$/);
  // Past its time with no acceptance in the record.
  const oldSub = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 20);
  assert.match(W(oldSub, newestFirst([tl, oldSub]), null).text, /no acceptance follows in the record$/);
});

test("queues, roles and the timelock in words", () => {
  const q1 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID] }, 40);
  const q2 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID, ID2] }, 2);
  assert.equal(W(q2, [q2, q1], null).text, "Supply queue changed from 1 market to 2 markets: 1 added");
  const q3 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID2, ID] }, 1);
  assert.equal(W(q3, [q3, q2, q1], null).text, "Supply queue reordered, 2 markets");
  const q4 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID2, ID] }, 0.5);
  assert.equal(W(q4, [q4, q3], null).text, "Supply queue set again with the same 2 markets");
  const q5 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID2, "0x" + "ef".repeat(32)] }, 0.2);
  assert.equal(W(q5, [q5, q4], null).text, "Supply queue changed, still 2 markets: 1 added, 1 removed");
  const w = log("SetWithdrawQueue", { caller: A1, newWithdrawQueue: [ID] }, 2);
  assert.equal(W(w, [w], null).text, "Withdraw queue set to 1 market");
  assert.equal(W(log("SetCurator", { newCurator: A2 }, 1), [], null).text, "Curator set to 0x2222…2222");
  assert.equal(W(log("SetGuardian", { caller: A1, guardian: ZERO }, 1), [], null).text, "Guardian removed");
  const t0 = log("SetTimelock", { caller: A1, newTimelock: String(DAY) }, 90);
  const t1 = log("SetTimelock", { caller: A1, newTimelock: String(7 * DAY) }, 1);
  assert.equal(W(t1, [t1, t0], null).text, "Timelock changed from 1 day to 7 days");
  assert.equal(
    W(log("OwnershipTransferred", { previousOwner: A1, newOwner: A2 }, 1), [], null).text,
    "Owner changed from 0x1111…1111 to 0x2222…2222",
  );
  assert.equal(
    W(log("OwnershipTransferred", { previousOwner: A1, newOwner: ZERO }, 1), [], null).text,
    "Ownership renounced",
  );
  assert.equal(timelockText(36 * 3600), "36 hours");
});

test("rows and coverage", () => {
  const a = log("SetCap", { caller: A1, id: ID, cap: "1000000" }, 5);
  const rows = changeRows({ all: [a], truncated: false, timelock: null, asOf: { block: a.blockNumber, time: NOW } }, F);
  assert.equal(rows.length, 1);
  assert.equal(coveredThrough({ index: { fromBlock: 1, throughBlock: 50 }, sieve: null }), 50);
  assert.equal(
    coveredThrough({ index: { fromBlock: 1, throughBlock: 50 }, sieve: { fromBlock: 40, throughBlock: 60 } }),
    60,
  );
  assert.equal(coveredThrough({ index: null, sieve: null }), null);
});

test("an accepted cap reads as accepted, bounded by the next submission, validAt and the page's block", () => {
  const tl = log("SetTimelock", { caller: A1, newTimelock: String(3 * DAY) }, 100);
  const sub = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 10);
  // A SetCap of the same value before validAt is not the acceptance (it cannot be).
  const early = log("SetCap", { caller: A1, id: ID, cap: "9000000" }, 9);
  assert.equal(acceptanceOf(newestFirst([tl, sub, early]), sub, sub.blockTime + 3 * DAY, HEAD), null);
  // Revoked, then submitted again and accepted: the first submission is not accepted.
  const again = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 8);
  const acc = log("SetCap", { caller: A2, id: ID, cap: "9000000" }, 4);
  const all = newestFirst([tl, sub, again, acc]);
  assert.equal(W(sub, all).accepted, null);
  assert.match(W(sub, all).text, /no acceptance follows in the record$/);
  assert.equal(W(again, all).accepted, acc);
  // After the page's block: not yet.
  assert.equal(acceptanceOf(all, again, again.blockTime + 3 * DAY, acc.blockNumber - 1), null);
  // No timelock known (truncated answer, no SetTimelock in it): an acceptance still reads as accepted.
  const t = W(again, newestFirst([again, acc]), 7 * DAY, true);
  assert.equal(t.waiting, undefined);
  assert.equal(t.accepted, acc);
  assert.match(t.text, /; accepted on day 4 ago$/);
});

test("a truncated answer infers no timelock from outside it", () => {
  const sub = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 1);
  // Whole answer, no SetTimelock: the page's read dates it.
  assert.equal(W(sub, [sub], 7 * DAY, false).waiting.timelock, 7 * DAY);
  // Truncated: no date.
  const t = W(sub, [sub], 7 * DAY, true);
  assert.equal(t.waiting, undefined);
  assert.equal(t.text, "Cap of 9 USDC on the wstETH market submitted; no acceptance follows in the record");
  assert.equal(t.accepted, null);
  // A SetTimelock inside the truncated answer still counts.
  const tl = log("SetTimelock", { caller: A1, newTimelock: String(DAY) }, 5);
  assert.equal(W(sub, newestFirst([tl, sub]), 7 * DAY, true).waiting.timelock, DAY);
  // Truncated with no earlier SetCap in it: "set to".
  const cap = log("SetCap", { caller: A1, id: ID, cap: "1000000" }, 1);
  assert.equal(W(cap, [cap], null, true).text, "Cap on the wstETH market set to 1 USDC");
});

test("timelock words: the adjective before a noun, none for no wait", () => {
  assert.equal(timelockAdjective(3 * DAY), "3-day");
  assert.equal(timelockAdjective(36 * 3600), "36-hour");
  assert.equal(timelockAdjective(0), null);
  assert.equal(timelockText(0), "none");
  const t0 = log("SetTimelock", { caller: A1, newTimelock: String(7 * DAY) }, 60);
  const t1 = log("SetTimelock", { caller: A1, newTimelock: "0" }, 1);
  assert.equal(W(t1, [t1, t0]).text, "Timelock changed from 7 days to none");
  assert.equal(W(t1, [t1]).text, "Timelock set to none");
});

test("the scope: unread with no coverage, scoped where the record stops short or starts late", () => {
  const asOf = { block: 30_000_000 };
  assert.deepEqual(changesScope({ index: null, sieve: null }, 1, asOf), { kind: "unread" });
  // Within a day of blocks (7,200 on Ethereum): whole.
  assert.deepEqual(changesScope({ index: { fromBlock: 1, throughBlock: 29_993_000 }, sieve: null }, 1, asOf), {
    kind: "whole",
    through: 29_993_000,
  });
  // More than a day short: scoped from the window's start.
  assert.deepEqual(changesScope({ index: { fromBlock: 1, throughBlock: 29_990_000 }, sieve: null }, 1, asOf), {
    kind: "scoped",
    through: 29_990_000,
    fromBlock: null,
  });
  // Base's day is 43,200 blocks.
  assert.equal(
    changesScope({ index: { fromBlock: 1, throughBlock: 29_960_000 }, sieve: null }, 8453, asOf).kind,
    "whole",
  );
  // A vault younger than the window: the record starts at its creation and misses nothing.
  assert.deepEqual(
    changesScope({ index: { fromBlock: 29_950_000, throughBlock: 30_000_000 }, sieve: null }, 1, asOf, 29_950_000),
    { kind: "whole", through: 30_000_000 },
  );
  // Starting after both the window and the vault's creation is late.
  assert.equal(
    changesScope({ index: { fromBlock: 29_960_000, throughBlock: 30_000_000 }, sieve: null }, 1, asOf, 29_950_000).kind,
    "scoped",
  );
  // Starts after the window's first block (30 days of 7,200 back): scoped from that block.
  assert.deepEqual(changesScope({ index: { fromBlock: 29_900_000, throughBlock: 30_000_000 }, sieve: null }, 1, asOf), {
    kind: "scoped",
    through: 30_000_000,
    fromBlock: 29_900_000,
  });
});

const run = (from, until) => ({
  fromBlock: from,
  fromTime: from * 12,
  fromTx: `0x${from}`,
  untilBlock: until,
  untilTime: until == null ? null : until * 12,
  untilTx: until == null ? null : `0x${until}`,
});
const cov = { index: { fromBlock: 1, throughBlock: 1000 }, sieve: null };

test("open runs give since-dates; vaults whose runs all ended are ran-before, latest end first", () => {
  const V1 = "0x" + "a1".repeat(20);
  const V2 = "0x" + "a2".repeat(20);
  const V3 = "0x" + "a3".repeat(20);
  const V4 = "0x" + "a4".repeat(20);
  const r = stewardRuns(
    "curator",
    [
      {
        chainId: 1,
        coverage: cov,
        vaults: [
          {
            vault: V1,
            name: "Now",
            symbol: "N",
            version: "v1.1",
            firstBlock: 10,
            lastBlock: null,
            runs: [run(10, 20), run(30, null)],
          },
          {
            vault: V2,
            name: null,
            symbol: null,
            version: "v1.0",
            firstBlock: 5,
            lastBlock: 50,
            runs: [run(40, 50), run(5, 9)],
          },
          // Ended in the index, listed now by the directory: neither.
          {
            vault: V4,
            name: "Lagging",
            symbol: "L",
            version: "v1.1",
            firstBlock: 5,
            lastBlock: 60,
            runs: [run(5, 60)],
          },
        ],
      },
      {
        chainId: 8453,
        coverage: cov,
        vaults: [
          { vault: V3, name: "Base", symbol: "B", version: "v1.1", firstBlock: 70, lastBlock: 80, runs: [run(70, 80)] },
        ],
      },
    ],
    new Set([`1:${V1}`, `1:${V4}`]),
  );
  assert.equal(r.since[`1:${V1}`].run.fromBlock, 30);
  assert.deepEqual(
    r.before.map((b) => `${b.chainId}:${b.vault}`),
    [`8453:${V3}`, `1:${V2}`],
  );
  const span = spanOf(r.before[1]);
  assert.equal(span.from.fromBlock, 5);
  assert.equal(span.until.untilBlock, 50);
});
