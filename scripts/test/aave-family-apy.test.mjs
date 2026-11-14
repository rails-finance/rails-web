// SparkLend's APY: the Pool's ray rate compounded each second for a year, as
// Aave's aave-utilities computes it (ui-jobs 611).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { aprToApy, rayRateToApy, SECONDS_PER_YEAR } from "../../lib/aave-family/apy.ts";

const RAY = 10n ** 27n;

// aave-utilities' calculateCompoundedRate: rayPow(rate / SECONDS_PER_YEAR + RAY, SECONDS_PER_YEAR) − RAY,
// with rayMul rounding half up, restated in bigint.
function rayMul(a, b) {
  return (a * b + RAY / 2n) / RAY;
}
function rayPow(x, n) {
  let z = n % 2n !== 0n ? x : RAY;
  for (n = n / 2n; n !== 0n; n = n / 2n) {
    x = rayMul(x, x);
    if (n % 2n !== 0n) z = rayMul(z, x);
  }
  return z;
}
const referenceApy = (rayRate) => {
  const out = rayPow(rayRate / BigInt(SECONDS_PER_YEAR) + RAY, BigInt(SECONDS_PER_YEAR)) - RAY;
  return Number(out) / 1e27;
};

test("a 5% rate compounds to e^0.05 − 1 over a year of seconds", () => {
  assert.ok(Math.abs(aprToApy(0.05) - Math.expm1(0.05)) < 1e-9);
});

test("matches aave-utilities' compounding on real-sized ray rates", () => {
  for (const pct of ["0.0001", "0.0312", "0.0468", "0.0857", "0.25", "1.5"]) {
    const ray = BigInt(Math.round(Number(pct) * 1e12)) * 10n ** 15n;
    const ours = rayRateToApy(ray.toString());
    const ref = referenceApy(ray);
    assert.ok(Math.abs(ours - ref) < 1e-9, `${pct}: ${ours} vs ${ref}`);
  }
});

test("zero stays zero and nonsense reads null", () => {
  assert.equal(aprToApy(0), 0);
  assert.equal(rayRateToApy("0"), 0);
  assert.equal(aprToApy(null), null);
  assert.equal(aprToApy(Number.NaN), null);
  assert.equal(aprToApy(-0.01), null);
  assert.equal(rayRateToApy("not a number"), null);
});

test("an APY is never below its rate", () => {
  for (const r of [0.001, 0.02, 0.07, 0.4]) assert.ok(aprToApy(r) >= r);
});

// Aave V4 (ui-jobs 627): the Core hub's WETH drawn rate at block 26,401,778
// (getAssetDrawnRate, read 12 Nov 2026), 2.15% stored, states a 2.18% borrow APY.
test("Aave V4's drawn rate compounds the same way: Core WETH at block 26,401,778", () => {
  const ray = "21536617015515426407969040";
  const apy = rayRateToApy(ray);
  assert.ok(Math.abs(apy - referenceApy(BigInt(ray))) < 1e-9);
  assert.equal((apy * 100).toFixed(2), "2.18");
});
