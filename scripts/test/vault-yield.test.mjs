// lib/vaults/yield.ts against hand-made series (rails-ops decision 0047).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  vaultYield,
  yieldText,
  changeText,
  jumpTail,
  measuredYield,
  tooSmallToMeasure,
} from "../../lib/vaults/yield.ts";

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

// ui-jobs 542: a one-off move over up to 7 days, and the dust floor.

/** A flat price from `first` to `last`, doubling linearly over `riseFrom`..`riseTo`. */
function rising(first, last, riseFrom, riseTo) {
  const obs = [];
  for (let d = first; d <= last; d++) {
    const k = d <= riseFrom ? 0 : d >= riseTo ? riseTo - riseFrom : d - riseFrom;
    obs.push([d, String(1_000_000n + (1_000_000n * BigInt(k)) / BigInt(riseTo - riseFrom)), String(d * 7200)]);
  }
  return { firstDay: first, obs };
}

test("a doubling unlocked over 7 days is named as one span (dUSDT's shape)", () => {
  const y = vaultYield(rising(100, 130, 120, 127));
  assert.equal(y.jump.fromDay, 120);
  assert.equal(y.jump.day, 127);
  assert.equal(
    jumpTail(y.jump, (d) => `day ${d}`),
    ", +100.00% of it from day 120 to day 127",
  );
});

test("a one-day step inside steady growth reads 'on' its day", () => {
  const s = series(100, 130, { step: 30n });
  s.obs = s.obs.map(([d, raw, b]) => [d, String(BigInt(raw) + (d >= 115 ? 500_000n : 0n)), b]);
  const y = vaultYield(s);
  assert.equal(y.jump.fromDay, undefined);
  assert.equal(y.jump.day, 115);
});

test("a rate that runs high for 5 days is no one-off move", () => {
  // 0.05% a day, then 0.3% a day for 5 days: those days carry over half the move at 6 times the pace.
  const obs = [];
  let p = 1_000_000_000n;
  for (let d = 100; d <= 130; d++) {
    obs.push([d, String(p), String(d * 7200)]);
    p += d >= 120 && d < 125 ? (p * 30n) / 10_000n : (p * 5n) / 10_000n;
  }
  assert.equal(vaultYield({ firstDay: 100, obs }).jump, undefined);
});

test("a move spread over more than 7 days is not named", () => {
  assert.equal(vaultYield(rising(100, 130, 110, 125)).jump, undefined);
});

test("a one-day step still reads 'on' its day", () => {
  const y = vaultYield(rising(100, 130, 120, 121));
  assert.equal(y.jump.fromDay, undefined);
  assert.equal(y.jump.day, 121);
  assert.equal(
    jumpTail(y.jump, (d) => `day ${d}`),
    ", +100.00% of it on day 121",
  );
});

test("under 10,000 raw units of total assets is too small to measure", () => {
  assert.equal(tooSmallToMeasure("9999"), true);
  assert.equal(tooSmallToMeasure(10_000n), false);
  const y = vaultYield(series(100, 130));
  assert.deepEqual(measuredYield(y, "2"), { none: "too-small" });
  assert.equal(measuredYield(y, "10000"), y);
  // Unread total assets, or no figure to replace, leave the answer as it is.
  assert.equal(measuredYield(y, null), y);
  assert.deepEqual(measuredYield({ none: "no-series" }, "2"), { none: "no-series" });
});
