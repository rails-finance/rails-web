// Euler V2's borrow rate as an APY, the form Euler's docs display
// (https://docs.euler.finance/use/annual-percentage-yield): a vault's
// `interestRate()` is a per-second compounded rate scaled by 1e27, and
// "borrow APY = (1 + borrow SPY)^seconds_per_year − 1" over "an average
// Gregorian year of 365.2425 × 86,400 seconds".
//
// log1p and expm1 keep the small per-second step in floating point: 1 + rate
// would lose the rate's low digits before the power is taken.
//
// Pure, with no imports, so scripts/test runs it.

/** Seconds in Euler's year: 365.2425 × 86,400, an average Gregorian year. */
export const EULER_YEAR_SECONDS = 31_556_952;
/** The scale of `interestRate()`. */
const RAY_DECIMALS = 27;

/** A per-second rate scaled by 1e27 (the integer as a decimal string or bigint) as an APY fraction. */
export function spyToApy(raw: string | bigint): number {
  const spy = Number(BigInt(raw)) / 10 ** RAY_DECIMALS;
  if (!(spy > 0)) return 0;
  return Math.expm1(EULER_YEAR_SECONDS * Math.log1p(spy));
}

/** The formula as a receipt states it. */
export const SPY_APY_FORMULA = "(1 + interestRate ÷ 10^27)^31,556,952 − 1";
