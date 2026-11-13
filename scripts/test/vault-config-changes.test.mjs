// lib/vaults/config-changes.ts and lib/vaults/steward-runs.ts: a MetaMorpho
// vault's configuration changes in words, and a steward's runs (rails-ops
// ui-jobs 554, point 1 and piece C). Hand-made logs in the route's shape.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  changeRows,
  changeWords,
  coveredThrough,
  recentChanges,
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
  assert.equal(changeWords(up, all, F, DAY, NOW).text, "Cap on the wstETH market raised from 5 USDC to 7 USDC");
  assert.equal(changeWords(first, all, F, DAY, NOW).text, "Cap on the wstETH market set to 5 USDC");
  const down = log("SetCap", { caller: A1, id: ID2, cap: "0" }, 2);
  const prev = log("SetCap", { caller: A1, id: ID2, cap: "1000000" }, 50);
  assert.match(
    changeWords(down, [down, prev], F, DAY, NOW).text,
    /^Cap on market 0xcdcd…cdcd lowered from 1 USDC to zero$/,
  );
  const max = log("SetCap", { caller: A1, id: ID, cap: ((1n << 184n) - 1n).toString() }, 1);
  assert.match(changeWords(max, [max], F, DAY, NOW).text, /largest cap the contract takes/);
});

test("a submitted cap waits for the timelock in force then, or says when it was accepted", () => {
  const tl = log("SetTimelock", { caller: A1, newTimelock: String(3 * DAY) }, 100);
  const sub = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 1);
  const w = changeWords(sub, newestFirst([tl, sub]), F, 7 * DAY, NOW);
  assert.equal(w.waiting.validAt, sub.blockTime + 3 * DAY);
  assert.equal(w.waiting.acceptedBy, null);
  assert.match(w.text, /waits for the 3 days timelock and can be accepted from day -2 ago$/);
  // No SetTimelock in the answer: the page's read of the timelock.
  assert.equal(changeWords(sub, [sub], F, 7 * DAY, NOW).waiting.timelock, 7 * DAY);
  // Accepted: the SetCap with the same market and cap that follows.
  const acc = log("SetCap", { caller: A2, id: ID, cap: "9000000" }, 0);
  const wa = changeWords(sub, newestFirst([tl, sub, acc]), F, 7 * DAY, NOW);
  assert.equal(wa.waiting.acceptedBy, acc);
  assert.match(wa.text, /; accepted on day 0 ago$/);
  // Past its time with no acceptance in the record.
  const oldSub = log("SubmitCap", { caller: A1, id: ID, cap: "9000000" }, 20);
  assert.match(
    changeWords(oldSub, newestFirst([tl, oldSub]), F, null, NOW).text,
    /no acceptance follows in the record$/,
  );
});

test("queues, roles and the timelock in words", () => {
  const q1 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID] }, 40);
  const q2 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID, ID2] }, 2);
  assert.equal(
    changeWords(q2, [q2, q1], F, null, NOW).text,
    "Supply queue changed from 1 market to 2 markets: 1 added",
  );
  const q3 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID2, ID] }, 1);
  assert.equal(changeWords(q3, [q3, q2, q1], F, null, NOW).text, "Supply queue reordered, 2 markets");
  const q4 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID2, ID] }, 0.5);
  assert.equal(changeWords(q4, [q4, q3], F, null, NOW).text, "Supply queue set again with the same 2 markets");
  const q5 = log("SetSupplyQueue", { caller: A1, newSupplyQueue: [ID2, "0x" + "ef".repeat(32)] }, 0.2);
  assert.equal(
    changeWords(q5, [q5, q4], F, null, NOW).text,
    "Supply queue changed, still 2 markets: 1 added, 1 removed",
  );
  const w = log("SetWithdrawQueue", { caller: A1, newWithdrawQueue: [ID] }, 2);
  assert.equal(changeWords(w, [w], F, null, NOW).text, "Withdraw queue set to 1 market");
  assert.equal(
    changeWords(log("SetCurator", { newCurator: A2 }, 1), [], F, null, NOW).text,
    "Curator set to 0x2222…2222",
  );
  assert.equal(
    changeWords(log("SetGuardian", { caller: A1, guardian: ZERO }, 1), [], F, null, NOW).text,
    "Guardian removed",
  );
  const t0 = log("SetTimelock", { caller: A1, newTimelock: String(DAY) }, 90);
  const t1 = log("SetTimelock", { caller: A1, newTimelock: String(7 * DAY) }, 1);
  assert.equal(changeWords(t1, [t1, t0], F, null, NOW).text, "Timelock changed from 1 day to 7 days");
  assert.equal(
    changeWords(log("OwnershipTransferred", { previousOwner: A1, newOwner: A2 }, 1), [], F, null, NOW).text,
    "Owner changed from 0x1111…1111 to 0x2222…2222",
  );
  assert.equal(
    changeWords(log("OwnershipTransferred", { previousOwner: A1, newOwner: ZERO }, 1), [], F, null, NOW).text,
    "Ownership renounced",
  );
  assert.equal(timelockText(36 * 3600), "36 hours");
});

test("rows and coverage", () => {
  const a = log("SetCap", { caller: A1, id: ID, cap: "1000000" }, 5);
  const rows = changeRows([a], { block: a.blockNumber, time: NOW }, F, null);
  assert.equal(rows.length, 1);
  assert.equal(coveredThrough({ index: { fromBlock: 1, throughBlock: 50 }, sieve: null }), 50);
  assert.equal(
    coveredThrough({ index: { fromBlock: 1, throughBlock: 50 }, sieve: { fromBlock: 40, throughBlock: 60 } }),
    60,
  );
  assert.equal(coveredThrough({ index: null, sieve: null }), null);
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
