// The "decimals disagree" standing's reading and words (lib/vaults/asset-scale.ts
// reads it). Pure: the index table, a client component, draws the sentence.

export interface AssetScale {
  /** The asset's `decimals()`. */
  stated: number;
  /** The decimals its conversion implies. */
  implied: number;
  /** What it wraps: `asset()`, its symbol and decimals. */
  wraps: { address: string; symbol: string; decimals: number };
  /** `convertToAssets(10^18)` at the read, raw in the wrapped token. */
  per1e18: string;
}

/** The ratio past which the scale is marked, either way. */
const BOUND = 1e6;

/** The implied decimals, or null where the two scales agree within the bound. */
export function impliedDecimals(stated: number, wrapsDecimals: number, per1e18: bigint): number | null {
  if (per1e18 <= BigInt(0)) return null;
  // One unit at the stated decimals, in whole wrapped tokens.
  const ratio = (Number(per1e18) * 10 ** stated) / 1e18 / 10 ** wrapsDecimals;
  if (ratio > 1 / BOUND && ratio < BOUND) return null;
  return stated + Math.round(-Math.log10(ratio));
}

const TIMES: Record<number, string> = { 3: "a thousand", 6: "a million", 9: "a billion", 12: "a trillion" };

/** The pill's sentence. */
export function assetScaleSentence(symbol: string, s: AssetScale): string {
  const k = Math.abs(s.implied - s.stated);
  const times = TIMES[k] ?? `10^${k}`;
  return (
    `${symbol} states ${s.stated} decimals, but converts to ${s.wraps.symbol} at ${s.implied}. ` +
    `Amounts in ${symbol} here are read at ${s.stated}, so they read ${times} times too ${s.implied > s.stated ? "large" : "small"}.`
  );
}

/** Why an amount in the asset is not shown (ui-jobs 664): the tip on "decimals
 *  disagree" where a headline, a share price or a holder's amount stands as
 *  "—". The figure read at the stated decimals is a power of ten off, so none
 *  is printed. */
export function assetScaleAbsentTip(symbol: string, s: AssetScale): string {
  const k = Math.abs(s.implied - s.stated);
  const times = TIMES[k] ?? `10^${k}`;
  return (
    `${symbol} states ${s.stated} decimals, but converts to ${s.wraps.symbol} at ${s.implied}. ` +
    `Read at ${s.stated}, an amount in ${symbol} comes out ${times} times too ${s.implied > s.stated ? "large" : "small"}, so none is shown.`
  );
}
