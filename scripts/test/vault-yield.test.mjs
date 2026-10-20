// lib/vaults/yield.ts against hand-made series (rails-ops decision 0047).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { vaultYield, yieldText, changeText } from "../../lib/vaults/yield.ts";

/** Days `first`..`last` with a price rising by `step` raw units a day from `start`. */
function series(first, last, { start = 1_000_000n, step = 100n, skip = [], firstDay } = {}) {
  const obs = [];
  for (let d = first; d <= last; d++) {
    if (skip.includes(d)) continue;
    obs.push([d, String(start + step * BigInt(d - first)), String(20_000_000 + d * 7200)]);
  }
  return { firstDay: firstDay ?? first, obs };
}

test("exactly 30 days: p0 is the day 30 before the latest", () => {
  const y = vaultYield(series(100, 130, { step: 120n }));
  assert.equal(y.days, 30);
  assert.equal(y.from.day, 100);
  assert.equal(y.to.day, 130);
  assert.equal(y.from.raw, "1000000");
  assert.equal(y.to.raw, "1003600");
  assert.equal(y.from.block, 20_000_000 + 100 * 7200);
  assert.ok(Math.abs(y.change - 0.0036) < 1e-12);
  assert.ok(Math.abs(y.yearly - (0.0036 * 365) / 30) < 1e-12);
  assert.equal(yieldText(y.yearly), "4.4% a year");
  assert.equal(changeText(y.change), "+0.36%");
});

test("a missing day widens d rather than being filled", () => {
  const y = vaultYield(series(90, 130, { skip: [100] }));
  assert.equal(y.from.day, 99);
  assert.equal(y.days, 31);
  assert.ok(Math.abs(y.yearly - (y.change * 365) / 31) < 1e-15);
});

test("a fall renders a negative figure", () => {
  const y = vaultYield(series(100, 130, { start: 2_000_000n, step: -1000n }));
  assert.ok(y.change < 0);
  assert.ok(y.yearly < 0);
  assert.equal(changeText(y.change), "-1.50%");
  assert.match(yieldText(y.yearly), /^-18\.3% a year$/);
});

test("a series younger than 30 days has no figure and names its first day", () => {
  assert.deepEqual(vaultYield(series(110, 130)), { none: "young", firstDay: 110 });
  assert.deepEqual(vaultYield(series(101, 130)), { none: "young", firstDay: 101 });
});

test("no series, or only empty rows", () => {
  assert.deepEqual(vaultYield(undefined), { none: "no-series" });
  assert.deepEqual(vaultYield({ obs: [] }), { none: "no-series" });
  assert.deepEqual(
    vaultYield({
      obs: [
        [1, null, "5"],
        [40, "0", "6"],
      ],
    }),
    { none: "no-series" },
  );
});

test("an older series whose answer starts inside the window is not called young", () => {
  assert.deepEqual(vaultYield(series(110, 130, { firstDay: 10 })), { none: "no-series" });
});

test("30-digit raws keep their precision", () => {
  const y = vaultYield({
    obs: [
      [100, "1013810617363032811", "1"],
      [130, "1017559953150443001", "2"],
    ],
  });
  assert.ok(Math.abs(y.change - (1017559953150443001 / 1013810617363032811 - 1)) < 1e-12);
});

test("a one-day jump carrying most of the move is named", () => {
  const s = series(100, 130, { step: 10n });
  // Day 115 doubles the price; every later day keeps the step.
  s.obs = s.obs.map(([d, raw, b]) => [d, String(BigInt(raw) + (d >= 115 ? 1_000_000n : 0n)), b]);
  const y = vaultYield(s);
  assert.ok(y.jump);
  assert.equal(y.jump.day, 115);
  assert.ok(Math.abs(y.jump.change) > Math.abs(y.change) / 2);
});

test("a steady series names no jump", () => {
  const y = vaultYield(series(100, 130, { step: 120n }));
  assert.equal(y.jump, undefined);
});

test("a fall with a one-day drop names the drop", () => {
  const s = series(100, 130, { start: 2_000_000n, step: -100n });
  s.obs = s.obs.map(([d, raw, b]) => [d, String(BigInt(raw) - (d >= 120 ? 500_000n : 0n)), b]);
  const y = vaultYield(s);
  assert.ok(y.change < 0);
  assert.equal(y.jump.day, 120);
  assert.ok(y.jump.change < 0);
});

test("a flat series names no jump however its wobble falls", () => {
  const s = series(100, 130, { step: 0n });
  s.obs = s.obs.map(([d, raw, b]) => [d, String(BigInt(raw) + (d === 120 ? 1n : 0n)), b]);
  assert.equal(vaultYield(s).jump, undefined);
});
