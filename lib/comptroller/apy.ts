// The Comptroller family's rates as APYs (rails-ops ui-jobs 631 and 632).
// ----------------------------------------------------------------------------
// Compound V2: the docs' formula (https://docs.compound.xyz/v2/, "Calculating
// the APY Using Rate Per Block"): APY = (rate per block ÷ 1e18 × 7200 + 1)^365
// − 1, with "Blocks Per Day = 7200 (12 seconds per block)" and 365 days, so
// the per-block rate is summed over a day and compounded daily.
//
// Moonwell: interest "accrues per-second" (docs, Moonwell Core) and the docs
// give no APY formula, so Rails compounds the per-second rate every second of
// a 365-day year, 31,536,000 seconds (each Moonwell rate model's
// `timestampsPerYear()`): APY = (1 + rate per second ÷ 1e18)^31,536,000 − 1.
//
// log1p and expm1 keep the small per-period step in floating point: 1 + rate
// would lose the rate's low digits before the power is taken.
//
// Pure, with no imports, so scripts/test runs it.

/** Blocks a day in Compound's docs. */
export const COMPOUND_V2_BLOCKS_PER_DAY = 7_200;
/** Days a year in Compound's docs. */
export const COMPOUND_V2_DAYS_PER_YEAR = 365;
/** Seconds Moonwell's rate models count a year (`timestampsPerYear()`). */
export const MOONWELL_SECONDS_PER_YEAR = 31_536_000;

const E18 = 1e18;

/** A Compound V2 per-block rate (1e18 mantissa) as an APY fraction, by the docs' formula. */
export function compoundV2Apy(perBlock: bigint | number | string): number {
  const r = Number(perBlock) / E18;
  if (!(r > 0)) return 0;
  return Math.expm1(COMPOUND_V2_DAYS_PER_YEAR * Math.log1p(r * COMPOUND_V2_BLOCKS_PER_DAY));
}

/** A Moonwell per-second rate (1e18 mantissa) as an APY fraction, compounded every second of the year. */
export function moonwellApy(perSecond: bigint | number | string): number {
  const r = Number(perSecond) / E18;
  if (!(r > 0)) return 0;
  return Math.expm1(MOONWELL_SECONDS_PER_YEAR * Math.log1p(r));
}

/** A simple yearly rate as an APY compounded `steps` times a year: 365 for
 *  Compound V2 (the docs' daily compounding of 7,200 blocks, a year of
 *  2,628,000), 31,536,000 for Moonwell. The rate curve draws in this form. */
export function apyOfYear(year: number, steps: number): number {
  if (!(year > 0)) return 0;
  return Math.expm1(steps * Math.log1p(year / steps));
}

/** The simple yearly rate an APY compounds from, `steps` times a year. */
export function yearOfApy(apy: number, steps: number): number {
  if (!(apy > 0)) return 0;
  return steps * Math.expm1(Math.log1p(apy) / steps);
}

/** The formulas as a receipt states them. */
export const COMPOUND_V2_APY_FORMULA = "(rate per block ÷ 1e18 × 7,200 + 1)^365 − 1";
export const MOONWELL_APY_FORMULA = "(1 + rate per second ÷ 1e18)^31,536,000 − 1";
