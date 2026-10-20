// lib/vaults/yield.ts's one window (seriesWindow / vaultWindow) against
// hand-made series: the window the "last 30 days" strip reads for every
// series (rails-ops ui-jobs 413). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { seriesWindow, vaultWindow, vaultYield } from "../../lib/vaults/yield.ts";

/** Days `first`..`last` at `value(d)`, skipping `skip`. */
function series(first, last, { value = () => 1_000n, skip = [], firstDay } = {}) {
  const obs = [];
  for (let d = first; d <= last; d++) {
    if (skip.includes(d)) continue;
    obs.push([d, String(value(d)), String(20_000_000 + d * 7200)]);
  }
  return { firstDay: firstDay ?? first, obs };
}

test("a steady series: 30 days, no change, 31 points", () => {
  const w = seriesWindow(series(80, 130));
  assert.equal(w.from.day, 100);
  assert.equal(w.to.day, 130);
  assert.equal(w.days, 30);
  assert.equal(w.change, 0);
  assert.equal(w.points.length, 31);
  assert.deepEqual(
    w.points.map((p) => p.day),
    Array.from({ length: 31 }, (_, i) => 100 + i),
  );
  assert.equal(w.to.block, 20_000_000 + 130 * 7200);
});

test("a gap widens the window and stays a gap among the points", () => {
  const w = seriesWindow(series(80, 130, { value: (d) => BigInt(1000 + d), skip: [100, 115] }));
  assert.equal(w.from.day, 99);
  assert.equal(w.days, 31);
  assert.ok(!w.points.some((p) => p.day === 115));
  assert.equal(w.points.length, 30);
  assert.ok(Math.abs(w.change - (1130 / 1099 - 1)) < 1e-12);
});

test("a young series reports its first day and keeps its points", () => {
  const w = seriesWindow(series(110, 130));
  assert.equal(w.none, "young");
  assert.equal(w.firstDay, 110);
  assert.equal(w.points.length, 21);
});

test("an absent series, by key or by value", () => {
  assert.deepEqual(seriesWindow(undefined), { none: "no-series" });
  assert.deepEqual(vaultWindow({}, "vault-holders:1:0xabc"), { none: "no-series" });
  assert.deepEqual(vaultWindow(null, "vault:1:0xabc"), { none: "no-series" });
});

test("a zero row is a point; a window from zero has no ratio", () => {
  const w = seriesWindow(series(100, 130, { value: (d) => (d < 120 ? 0n : 500n) }));
  assert.equal(w.from.raw, "0");
  assert.equal(w.change, null);
  assert.equal(w.points.length, 31);
  // The share price does not take a zero as a read: no read 30 days back.
  const p = seriesWindow(series(100, 130, { value: (d) => (d < 120 ? 0n : 500n) }), { zeroIsRead: false });
  assert.equal(p.none, "no-series");
});

test("the key form reads the answer's series", () => {
  const key = "vault-assets:8453:0xabc";
  const w = vaultWindow({ [key]: series(90, 130, { value: (d) => BigInt(2000 - d) }) }, key);
  assert.equal(w.to.raw, "1870");
  assert.equal(w.from.raw, "1900");
});

test("Yield reads the same window", () => {
  const s = series(80, 130, { value: (d) => BigInt(1_000_000 + 50 * d) });
  const w = seriesWindow(s, { zeroIsRead: false });
  const y = vaultYield(s);
  assert.equal(y.from.block, w.from.block);
  assert.equal(y.to.block, w.to.block);
  assert.equal(y.change, w.change);
});
