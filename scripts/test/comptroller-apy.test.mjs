// The Comptroller family's APYs (lib/comptroller/apy.ts). rails-ops ui-jobs 631 and 632. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPOUND_V2_BLOCKS_PER_DAY,
  COMPOUND_V2_DAYS_PER_YEAR,
  MOONWELL_SECONDS_PER_YEAR,
  apyOfYear,
  compoundV2Apy,
  moonwellApy,
  yearOfApy,
} from "../../lib/comptroller/apy.ts";
import { COMPOUND_V2_BLOCKS_PER_YEAR } from "../../lib/compound-v2/rate-year.ts";

const pct2 = (f) => (f * 100).toFixed(2);

// cDAI 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643, borrowRatePerBlock at block 26,402,492.
const CDAI_PER_BLOCK = 91459164853n;

test("Compound V2: the docs' 7,200 blocks a day over 365 days is the 2,628,000-block year", () => {
  assert.equal(COMPOUND_V2_BLOCKS_PER_DAY * COMPOUND_V2_DAYS_PER_YEAR, COMPOUND_V2_BLOCKS_PER_YEAR);
});

test("Compound V2: cDAI's per-block borrow rate is a 27.16% APY by the docs' formula", () => {
  const r = Number(CDAI_PER_BLOCK) / 1e18;
  const docs = Math.pow(r * 7200 + 1, 365) - 1;
  assert.ok(Math.abs(compoundV2Apy(CDAI_PER_BLOCK) - docs) < 1e-12);
  assert.equal(pct2(compoundV2Apy(CDAI_PER_BLOCK)), "27.16");
  assert.equal(pct2(compoundV2Apy("91459164853")), "27.16");
  // The docs' worked input: supplyRatePerBlock 37,893,566.
  assert.equal(pct2(compoundV2Apy(37893566n)), "0.01");
  assert.equal(compoundV2Apy(0n), 0);
});

test("Moonwell: a per-second rate compounds every second of 31,536,000", () => {
  assert.equal(MOONWELL_SECONDS_PER_YEAR, 365 * 86400);
  // 16.62% a year simple (Base USDC, 12 Nov 2026) as a per-second mantissa.
  const perSecond = BigInt(Math.round((0.1662 / MOONWELL_SECONDS_PER_YEAR) * 1e18));
  assert.equal(pct2(moonwellApy(perSecond)), "18.08");
  assert.ok(Math.abs(moonwellApy(perSecond) - Math.expm1(0.1662)) < 1e-9);
  assert.equal(moonwellApy("0"), 0);
});

test("the curve's form: a simple year compounded the family's way, and back", () => {
  const r = Number(CDAI_PER_BLOCK) / 1e18;
  const year = r * COMPOUND_V2_BLOCKS_PER_YEAR;
  assert.ok(Math.abs(apyOfYear(year, 365) - compoundV2Apy(CDAI_PER_BLOCK)) < 1e-12);
  assert.ok(Math.abs(yearOfApy(compoundV2Apy(CDAI_PER_BLOCK), 365) - year) < 1e-12);
  const perSecond = 5e9;
  const y2 = (perSecond / 1e18) * MOONWELL_SECONDS_PER_YEAR;
  assert.ok(Math.abs(apyOfYear(y2, MOONWELL_SECONDS_PER_YEAR) - moonwellApy(perSecond)) < 1e-12);
  assert.ok(Math.abs(yearOfApy(moonwellApy(perSecond), MOONWELL_SECONDS_PER_YEAR) - y2) < 1e-12);
  assert.equal(apyOfYear(0, 365), 0);
});
