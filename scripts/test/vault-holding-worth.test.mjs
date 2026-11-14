// lib/vaults/holding-worth.ts against hand-made rows and stored days
// (rails-ops ui-jobs 553, the holder card's worth line).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { holdingWorthPoints } from "../../lib/vaults/holding-worth.ts";

const row = (blockNumber, balanceAfter, logIndex = 0) => ({ blockNumber, logIndex, balanceAfter });
const read = (day, block, raw) => ({ day, block, raw });
const opts = { shareDecimals: 6, now: null };

test("each stored day is the balance at its block × that day's share price", () => {
  const events = [row(100, "1000000"), row(250, "3000000")];
  const reads = [read(1, 90, "1000000"), read(2, 150, "1100000"), read(3, 250, "1200000"), read(4, 300, "1300000")];
  assert.deepEqual(holdingWorthPoints(events, reads, opts), [
    read(2, 150, "1100000"),
    read(3, 250, "3600000"),
    read(4, 300, "3900000"),
  ]);
});

test("the last log of a block is the balance at it", () => {
  const events = [row(100, "1000000", 1), row(100, "0", 2)];
  assert.deepEqual(holdingWorthPoints(events, [read(1, 100, "1000000")], opts), [read(1, 100, "0")]);
});

test("today's point is the claim, replacing a stored read of the same day", () => {
  const events = [row(100, "1000000")];
  const reads = [read(1, 120, "1000000"), read(2, 140, "1100000")];
  const now = { day: 2, block: 160, claimRaw: "1150000" };
  assert.deepEqual(holdingWorthPoints(events, reads, { ...opts, now }), [
    read(1, 120, "1000000"),
    read(2, 160, "1150000"),
  ]);
  const later = { day: 3, block: 160, claimRaw: "1150000" };
  assert.equal(holdingWorthPoints(events, reads, { ...opts, now: later }).length, 3);
});

test("a stored day past the page's block is left out", () => {
  const events = [row(100, "1000000")];
  const now = { day: 5, block: 130, claimRaw: "1000000" };
  const points = holdingWorthPoints(events, [read(1, 120, "1000000"), read(2, 140, "1100000")], { ...opts, now });
  assert.deepEqual(points, [read(1, 120, "1000000"), read(5, 130, "1000000")]);
});

test("no rows, no line", () => {
  assert.deepEqual(holdingWorthPoints([], [read(1, 120, "1000000")], opts), []);
});
