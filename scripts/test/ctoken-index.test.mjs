// A Comptroller-family market's index past its last knot grows by the APY,
// compounded over the APY's 365-day year (lib/shared/ctoken-index.ts). rails-ops ui-jobs 644. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { APY_YEAR_S, growByApy, indexAt } from "../../lib/shared/ctoken-index.ts";
import { compoundV2Apy, moonwellApy, yearOfApy } from "../../lib/comptroller/apy.ts";

const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("a year past the last knot, the index has grown by the APY", () => {
  const knots = [[1_000, 1.0]];
  close(indexAt(knots, 1_000 + APY_YEAR_S, 0.05), 1.05);
});

test("half a year compounds: √(1 + APY), above the simple half", () => {
  const at = indexAt([[0, 2]], APY_YEAR_S / 2, 0.21);
  close(at, 2 * Math.sqrt(1.21));
  assert.ok(at < 2 * (1 + 0.21 / 2));
});

test("Compound V2: a year's growth matches the docs' APY from the per-block rate", () => {
  // cDAI's borrowRatePerBlock read at block 26,402,492 (register, ui-jobs 631): APY 27.16%.
  const apy = compoundV2Apy(91459164853n);
  close(indexAt([[0, 1]], APY_YEAR_S, apy), 1 + apy);
  // Treating the APY as a simple rate overstates the yearly rate the chain
  // accrues on: the simple rate behind 27.16% compounded daily is lower.
  assert.ok(yearOfApy(apy, 365) < apy);
});

test("Moonwell: one day at the APY is one day of per-second compounding", () => {
  const perSecond = 3_000_000_000; // 3e9 per second, about 9.9% a year
  const apy = moonwellApy(perSecond);
  const day = 86_400;
  close(growByApy(1, apy, day), Math.exp(day * Math.log1p(perSecond / 1e18)), 1e-12);
});

test("between knots the line is straight, before the first it is flat, with no rate it is flat", () => {
  const knots = [
    [100, 1.0],
    [200, 1.1],
  ];
  close(indexAt(knots, 150, 0.5), 1.05);
  close(indexAt(knots, 50, 0.5), 1.0);
  close(indexAt(knots, 300, null), 1.1);
  close(indexAt(knots, 300, 0), 1.1);
  assert.equal(indexAt([], 300, 0.1), null);
});
