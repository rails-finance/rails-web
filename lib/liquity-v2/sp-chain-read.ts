// A Liquity V2 deposit's head read, assembled from one multicall's results.
// Pure: no imports, so scripts/test/liquity-v2-sp.test.mjs loads it.
//
// RULE: every figure the page states from the chain is the getter's answer.
// When any of the pool's getters fails inside the multicall, the whole read is
// stale and the page states none of them: a failed getter never becomes a
// zero. The price is apart: where it fails, the page values nothing.

export type ChainResult = { status: string; result?: unknown };

const ok = <T>(r: ChainResult | undefined): T | null =>
  r?.status === "success" && r.result != null ? (r.result as T) : null;

export interface SpHeadFigures {
  compoundedRaw: string;
  recordedRaw: string;
  collGainRaw: string;
  stashRaw: string;
  yieldGainRaw: string;
  /** USD per collateral token (1e18): the PriceFeed's simulated fetchPrice,
   *  else its lastGoodPrice; null where neither answered. */
  priceRaw: string | null;
  /** Only lastGoodPrice answered: the price the last operation fetched. */
  priceStale: boolean;
}

/** Results in the order the source reads them: getCompoundedBoldDeposit,
 *  deposits, getDepositorCollGain, stashedColl,
 *  getDepositorYieldGainWithPending, then the PriceFeed's fetchPrice and
 *  lastGoodPrice. Null when one of the pool's figures failed. */
export function spHeadFigures(res: ChainResult[]): SpHeadFigures | null {
  const compounded = ok<bigint>(res[0]);
  const recorded = ok<bigint>(res[1]);
  const collGain = ok<bigint>(res[2]);
  const stash = ok<bigint>(res[3]);
  const yieldGain = ok<bigint>(res[4]);
  if (compounded == null || recorded == null || collGain == null || stash == null || yieldGain == null) return null;
  const fetched = ok<readonly [bigint, boolean]>(res[5]);
  const lastGood = ok<bigint>(res[6]);
  const live = fetched != null && fetched[0] > BigInt(0) ? fetched[0] : null;
  const price = live ?? (lastGood != null && lastGood > BigInt(0) ? lastGood : null);
  return {
    compoundedRaw: compounded.toString(),
    recordedRaw: recorded.toString(),
    collGainRaw: collGain.toString(),
    stashRaw: stash.toString(),
    yieldGainRaw: yieldGain.toString(),
    priceRaw: price == null ? null : price.toString(),
    priceStale: live == null && price != null,
  };
}
