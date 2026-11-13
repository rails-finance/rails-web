// Euler V2 rates as APYs, the form Euler's docs display
// (https://docs.euler.finance/use/annual-percentage-yield): a vault's
// `interestRate()` is a per-second compounded rate scaled by 1e27, and
// "borrow APY = (1 + borrow SPY)^seconds_per_year − 1" over "an average
// Gregorian year of 365.2425 × 86,400 seconds". A growth read between two
// blocks is put on the same year: (1 + growth)^(365.2425 ÷ days) − 1.
//
// log1p and expm1 keep the small per-second step in floating point: 1 + rate
// would lose the rate's low digits before the power is taken.
//
// Pure, with no imports, so scripts/test runs it.

/** Days in Euler's year: an average Gregorian year. */
export const EULER_YEAR_DAYS = 365.2425;
/** Seconds in that year: 365.2425 × 86,400. */
export const EULER_YEAR_SECONDS = 31_556_952;
/** The scale of `interestRate()`. */
const RAY_DECIMALS = 27;

/** A per-second rate scaled by 1e27 (the integer as a decimal string or bigint) as an APY fraction. */
export function spyToApy(raw: string | bigint): number {
  const spy = Number(BigInt(raw)) / 10 ** RAY_DECIMALS;
  if (!(spy > 0)) return 0;
  return Math.expm1(EULER_YEAR_SECONDS * Math.log1p(spy));
}

/** Growth over a window (0.01 = 1%) compounded to Euler's year, as an APY fraction; null where no
 *  window or a growth of −100% or less. */
export function growthToApy(growth: number | null, days: number): number | null {
  if (growth === null || !(days > 0) || !(growth > -1)) return null;
  return Math.expm1((EULER_YEAR_DAYS / days) * Math.log1p(growth));
}

/** The formulas as a receipt states them. */
export const SPY_APY_FORMULA = "(1 + interestRate ÷ 10^27)^31,556,952 − 1";
export const GROWTH_APY_FORMULA = (read: string) => `(${read} now ÷ ${read} then)^(365.2425 ÷ days) − 1`;
