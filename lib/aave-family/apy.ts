// A Pool rate as an APY: the rate an Aave-family Pool stores
// (`currentLiquidityRate`, `currentVariableBorrowRate`, ray-scaled, 1e27 =
// 100% a year) compounded every second for a year, the way Aave's own
// aave-utilities derives `supplyAPY` and `variableBorrowAPY` for its app
// (`calculateCompoundedRate`: (1 + rate ÷ SECONDS_PER_YEAR)^SECONDS_PER_YEAR − 1,
// SECONDS_PER_YEAR = 31,536,000). SparkLend states its rates as APY (ui-jobs
// 611); Aave V3 and Seamless keep the stored rate as an APR.
//
// Pure, with no imports, so scripts/test/aave-family-apy.test.mjs runs it.

/** The year aave-utilities compounds over: 365 days of seconds. */
export const SECONDS_PER_YEAR = 31_536_000;

/** The ray scale a Pool rate is stored at. */
export const RAY_DECIMALS = 27;

/** An annual rate as a fraction (0.05 = 5%) compounded each second for a
 *  year, as a fraction. log1p and expm1 keep the small per-second step exact
 *  in floating point. Null for a rate that is not a finite number ≥ 0. */
export function aprToApy(apr: number | null | undefined): number | null {
  if (apr == null || !Number.isFinite(apr) || apr < 0) return null;
  if (apr === 0) return 0;
  return Math.expm1(SECONDS_PER_YEAR * Math.log1p(apr / SECONDS_PER_YEAR));
}

/** A ray-scaled Pool rate (the integer as a decimal string or bigint) as an
 *  APY fraction. */
export function rayRateToApy(ray: string | bigint | null | undefined): number | null {
  if (ray == null) return null;
  let n: bigint;
  try {
    n = typeof ray === "bigint" ? ray : BigInt(ray);
  } catch {
    return null;
  }
  if (n < BigInt(0)) return null;
  return aprToApy(Number(n) / 10 ** RAY_DECIMALS);
}

/** The formula as a receipt states it. */
export const APY_FORMULA = "(1 + rate ÷ 31,536,000)^31,536,000 − 1";
