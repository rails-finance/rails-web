// A Comptroller-family market's index at a moment (lib/shared/ctoken-flows.ts):
// a straight line between the knots the rows and the live read state, flat
// before the first, and past the last grown by the market's APY now
// (rails-ops ui-jobs 644).
// ----------------------------------------------------------------------------
// The rate the page reads is an APY (lib/comptroller/apy.ts): Compound V2's
// compounds daily over 365 days, Moonwell's every second of 31,536,000. The
// index it extends is the chain's exchange rate or borrow growth, which
// compounds as interest accrues, so past the last knot the index grows by
// (1 + APY)^(elapsed ÷ a 365-day year), the APY's own year.
//
// Pure, with no imports, so scripts/test runs it.

/** [unix seconds, index]. */
export type IndexKnot = [ts: number, index: number];

/** The year both families' APYs are stated over: 365 days. */
export const APY_YEAR_S = 31_536_000;

/** `index` grown by `apy` over `seconds`. */
export function growByApy(index: number, apy: number, seconds: number): number {
  if (!(apy > 0) || !(seconds > 0)) return index;
  return index * Math.exp((seconds / APY_YEAR_S) * Math.log1p(apy));
}

/** A market's index at `ts`: a straight line between the knots, flat before
 *  the first, and past the last grown by `apy` where given, else flat. */
export function indexAt(knots: IndexKnot[], ts: number, apy: number | null): number | null {
  if (knots.length === 0) return null;
  if (ts <= knots[0][0]) return knots[0][1];
  let lo = 0;
  let hi = knots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (knots[mid][0] <= ts) lo = mid;
    else hi = mid - 1;
  }
  const [t0, i0] = knots[lo];
  const next = knots[lo + 1];
  if (!next) return growByApy(i0, apy ?? 0, ts - t0);
  const [t1, i1] = next;
  return t1 > t0 ? i0 + ((i1 - i0) * (ts - t0)) / (t1 - t0) : i1;
}
