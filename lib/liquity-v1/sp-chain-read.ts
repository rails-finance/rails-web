// A Liquity V1 deposit's head read, assembled from one multicall's results.
// Pure: no imports, so scripts/test/liquity-v1-sp.test.mjs loads it.
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
  frontEnd: string;
  ethGainRaw: string;
  lqtyGainRaw: string;
  /** USD per ETH (1e18): the PriceFeed's simulated fetchPrice, else its
   *  lastGoodPrice; null where neither answered. */
  priceRaw: string | null;
  /** Only lastGoodPrice answered: the price the last operation fetched. */
  priceStale: boolean;
  /** The pool's getTotalLUSDDeposits(): every deposit's LUSD; null where it
   *  failed, so the page states no share. */
  totalDepositsRaw: string | null;
}

/** Results in the order the source reads them: getCompoundedLUSDDeposit,
 *  deposits, getDepositorETHGain, getDepositorLQTYGain, then the PriceFeed's
 *  fetchPrice and lastGoodPrice, then the pool's getTotalLUSDDeposits. Null
 *  when one of the depositor's figures failed. */
export function spHeadFigures(res: ChainResult[]): SpHeadFigures | null {
  const compounded = ok<bigint>(res[0]);
  const deposit = ok<readonly [bigint, string]>(res[1]);
  const ethGain = ok<bigint>(res[2]);
  const lqtyGain = ok<bigint>(res[3]);
  if (compounded == null || deposit == null || ethGain == null || lqtyGain == null) return null;
  const fetched = ok<bigint>(res[4]);
  const lastGood = ok<bigint>(res[5]);
  const total = ok<bigint>(res[6]);
  const live = fetched != null && fetched > BigInt(0) ? fetched : null;
  const price = live ?? (lastGood != null && lastGood > BigInt(0) ? lastGood : null);
  return {
    compoundedRaw: compounded.toString(),
    recordedRaw: deposit[0].toString(),
    frontEnd: String(deposit[1]).toLowerCase(),
    ethGainRaw: ethGain.toString(),
    lqtyGainRaw: lqtyGain.toString(),
    priceRaw: price == null ? null : price.toString(),
    priceStale: live == null && price != null,
    totalDepositsRaw: total == null ? null : total.toString(),
  };
}
