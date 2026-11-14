// The Comptroller family's rate models as the shared curve's two-slope
// constants (lib/comptroller/rate-model.ts), on terms read 9 Nov 2026.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { curveConstants, jumpRateModel, modelUtilisation, whitePaperModel } from "../../lib/comptroller/rate-model.ts";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
/** The borrow rate on the shared curve (components/shared/product/rate-curve.tsx). */
const at = (u, c) =>
  u <= c.optimal
    ? c.base + (c.slope1 * u) / c.optimal
    : c.base + c.slope1 + (c.slope2 * (u - c.optimal)) / (1 - c.optimal);

test("Compound V2 cUSDC's jump-rate model: 5% to the 80% kink, then 109% a year", () => {
  // 0xD8EC56013EA119E7181d231E5048f90fBbe753c0, per block, on the model's 2,102,400 blocks a year.
  const m = jumpRateModel(
    { base: 0n, multiplier: 23782343987n, jump: 518455098934n, kink: 800000000000000000n },
    2_102_400,
  );
  assert.equal(m.shape, "jump");
  near(m.multiplier, 0.05);
  near(m.jump, 1.09);
  const c = curveConstants(m);
  assert.equal(c.noKink, false);
  // Compound's getBorrowRate: base + multiplier × min(U, kink) + jump × max(0, U − kink).
  near(at(0.63, c), 0.05 * 0.63);
  near(at(0.9, c), 0.05 * 0.8 + 1.09 * 0.1);
  near(at(1, c), 0.05 * 0.8 + 1.09 * 0.2);
});

test("a Moonwell Base flat model (kink, multiplier and jump zero) draws a flat line with no kink", () => {
  const m = jumpRateModel({ base: 317097919n, multiplier: 0n, jump: 0n, kink: 0n }, 31_536_000);
  assert.equal(m.shape, "linear");
  const c = curveConstants(m);
  assert.equal(c.noKink, true);
  near(at(0, c), at(0.99, c));
  near(at(0.5, c), 0.01, 1e-4);
});

test("the white-paper model is stored a year and leaves reserves out of utilisation", () => {
  const m = whitePaperModel({ baseRate: 20000000000000000n, multiplier: 300000000000000000n });
  near(at(0.5, curveConstants(m)), 0.02 + 0.15);
  near(modelUtilisation(m, 50, 50, 10), 0.5);
  near(modelUtilisation({ reservesInUtil: true }, 50, 50, 10), 50 / 90);
});
