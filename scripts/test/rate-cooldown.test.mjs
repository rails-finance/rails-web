// The Liquity V2 rate-change cooldown read from a Trove's rows
// (lib/liquity-v2/rate-cooldown.ts; rails-ops TO-DO-ui-jobs 831).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { cooldownLeft, INTEREST_RATE_ADJ_COOLDOWN, rateCooldown } from "../../lib/liquity-v2/rate-cooldown.ts";

const DAY = 86_400;
const T0 = 1_760_000_000;
let n = 0;
const row = (op, timestamp, batchManager) => ({
  id: `e${++n}`,
  op,
  timestamp,
  blockNumber: timestamp / 12,
  txHash: `0x${n}`,
  batchManager,
});

test("the constant is 7 days", () => {
  assert.equal(INTEREST_RATE_ADJ_COOLDOWN, 7 * DAY);
});

test("a rate change three days ago runs until four days from now", () => {
  const rows = [row("openTrove", T0), row("adjustTrove", T0 + DAY), row("adjustTroveInterestRate", T0 + 10 * DAY)];
  const c = rateCooldown(rows, { now: T0 + 13 * DAY });
  assert.ok(c);
  assert.equal(c.clock.start, "rate");
  assert.equal(c.clock.endsAt, T0 + 17 * DAY);
  assert.equal(c.batchManager, null);
  assert.equal(c.delegate, null);
});

test("an adjustment that moves no rate leaves the clock alone", () => {
  const rows = [row("openTrove", T0), row("adjustTrove", T0 + 6 * DAY)];
  assert.equal(rateCooldown(rows, { now: T0 + 8 * DAY }), null);
  assert.equal(rateCooldown(rows, { now: T0 + 2 * DAY }).clock.start, "open");
});

test("the cooldown ends at its deadline", () => {
  const rows = [row("openTrove", T0)];
  assert.equal(rateCooldown(rows, { now: T0 + 7 * DAY }), null);
  assert.ok(rateCooldown(rows, { now: T0 + 7 * DAY - 1 }));
});

test("a batched Trove reads its join, or the delegate's later change", () => {
  const m = "0xabc";
  const rows = [
    row("openTrove", T0),
    row("setInterestBatchManager", T0 + 10 * DAY, m),
    row("setBatchManagerAnnualInterestRate", T0 + 12 * DAY, m),
  ];
  const c = rateCooldown(rows, { now: T0 + 13 * DAY });
  assert.equal(c.troveClock.start, "join");
  assert.equal(c.clock.start, "batch-rate");
  assert.equal(c.clock.endsAt, T0 + 19 * DAY);
  assert.equal(c.delegate?.endsAt, T0 + 19 * DAY);
  assert.equal(c.batchManager, m);
  // After the join's 7 days the delegate's clock still holds the leave.
  assert.equal(rateCooldown(rows, { now: T0 + 18 * DAY }).clock.start, "batch-rate");
  assert.equal(rateCooldown(rows, { now: T0 + 19 * DAY }), null);
});

test("a delegate change before the join does not count", () => {
  const m = "0xabc";
  const rows = [row("setBatchManagerAnnualInterestRate", T0, m), row("openTroveAndJoinBatch", T0 + DAY, m)];
  const c = rateCooldown(rows, { now: T0 + 2 * DAY });
  assert.equal(c.clock.start, "open-batch");
  assert.equal(c.delegate, null);
});

test("leaving the batch restarts the Trove's clock", () => {
  const rows = [
    row("openTroveAndJoinBatch", T0, "0xabc"),
    row("setBatchManagerAnnualInterestRate", T0 + 20 * DAY, "0xabc"),
    row("removeFromBatch", T0 + 30 * DAY),
  ];
  const c = rateCooldown(rows, { now: T0 + 31 * DAY });
  assert.equal(c.clock.start, "leave");
  assert.equal(c.batchManager, null);
});

test("a batch switch in one block reads as a leave then a join", () => {
  const join = row("setInterestBatchManager", T0 + DAY, "0xdef");
  const leave = { ...row("removeFromBatch", T0 + DAY), blockNumber: join.blockNumber };
  const c = rateCooldown([row("openTroveAndJoinBatch", T0, "0xabc"), join, leave], { now: T0 + 2 * DAY });
  assert.equal(c.clock.start, "join");
  assert.equal(c.batchManager, "0xdef");
});

test("a folder that may hold a newer rate change leaves it unsettled", () => {
  const rows = [row("adjustTroveInterestRate", T0)];
  const folders = [{ kind: "owner_run", lastAt: T0 + DAY, counts: [{ key: "adjustTroveInterestRate", count: 3 }] }];
  assert.equal(rateCooldown(rows, { now: T0 + 2 * DAY, folders }), null);
  const redemptions = [{ kind: "redemption", lastAt: T0 + DAY, counts: [{ key: "redeemCollateral", count: 3 }] }];
  assert.ok(rateCooldown(rows, { now: T0 + 2 * DAY, folders: redemptions }));
});

test("rows with no clock event settle nothing", () => {
  assert.equal(rateCooldown([row("adjustTrove", T0)], { now: T0 + DAY }), null);
});

test("time left on one short scale", () => {
  assert.equal(cooldownLeft(5 * DAY + 3 * 3600 + 120), "5d 3h");
  assert.equal(cooldownLeft(5 * DAY + 120), "5d");
  assert.equal(cooldownLeft(3 * 3600 + 12 * 60), "3h 12m");
  assert.equal(cooldownLeft(12 * 60 + 5), "12m");
  assert.equal(cooldownLeft(30), "under 1m");
});
