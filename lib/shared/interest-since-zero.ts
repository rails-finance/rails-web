// The interest inside a lending balance: what accrued since the balance last
// started from zero.
// ----------------------------------------------------------------------------
// RULE (SparkLend newcomer round 2, R1): a card's "incl. $X interest" is what
// sits inside the balance shown, so it counts from the row where the balance
// last started from zero (a balance under the dust figure counts as zero). A
// wallet that repaid its debt to zero and borrowed again holds none of the
// interest from before; the Lifetime flows panel counts that. Each row's
// balance before less the previous row's balance after is the interest between
// them, and the balance now less the last row's after is the interest since.

/** One row of a lane (a reserve on one side), oldest first. */
export interface LaneRow {
  timestamp: number;
  before: number | null;
  after: number | null;
}

/** Interest since the lane last started from zero, in the reserve's token, and
 *  when that start was (unix seconds). Null where the start is not among the
 *  rows (a windowed page), a row after it lacks a balance, or the sum comes out
 *  below zero beyond rounding (a move the rows do not state). */
export function interestSinceZero(
  rows: readonly LaneRow[],
  current: number,
  dustAmount: number,
): { amount: number; since: number } | null {
  let k = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const b = rows[i].before;
    if (b != null && b <= dustAmount) {
      k = i;
      break;
    }
  }
  if (k < 0) return null;
  let interest = 0;
  for (let i = k + 1; i < rows.length; i += 1) {
    const b = rows[i].before;
    const prev = rows[i - 1].after;
    if (b == null || prev == null) return null;
    interest += b - prev;
  }
  const last = rows[rows.length - 1].after;
  if (last == null) return null;
  interest += current - last;
  if (interest < -Math.max(dustAmount, current * 1e-9)) return null;
  return { amount: Math.max(0, interest), since: rows[k].timestamp };
}

/** A decimal string as a number; null where absent or not a number. */
export const numOrNull = (v: unknown): number | null =>
  typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
