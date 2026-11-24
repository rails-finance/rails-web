// A Liquity V1 stake's head read, assembled from one multicall's results.
// Pure: no imports, so scripts/test/liquity-v1-staking.test.mjs loads it.
//
// RULE: every figure the page states from the chain is the getter's answer.
// When any of the staker's getters fails inside the multicall, the whole read
// is stale and the page states none of them: a failed getter never becomes a
// zero. The pool total and the price are apart: where one fails, the page
// states no share, or values nothing.

export type ChainResult = { status: string; result?: unknown };

const ok = <T>(r: ChainResult | undefined): T | null =>
  r?.status === "success" && r.result != null ? (r.result as T) : null;

export interface StakeHeadFigures {
  stakeRaw: string;
  lusdGainRaw: string;
  ethGainRaw: string;
  /** totalLQTYStaked(): every stake's LQTY; null where it failed. */
  totalStakedRaw: string | null;
  /** USD per ETH (1e18): the PriceFeed's simulated fetchPrice, else its
   *  lastGoodPrice; null where neither answered. */
  priceRaw: string | null;
  /** Only lastGoodPrice answered. */
  priceStale: boolean;
}

/** Results in the order the source reads them: stakes, getPendingLUSDGain,
 *  getPendingETHGain, totalLQTYStaked, then the PriceFeed's fetchPrice and
 *  lastGoodPrice. Null when one of the staker's figures failed. */
export function stakeHeadFigures(res: ChainResult[]): StakeHeadFigures | null {
  const stake = ok<bigint>(res[0]);
  const lusd = ok<bigint>(res[1]);
  const eth = ok<bigint>(res[2]);
  if (stake == null || lusd == null || eth == null) return null;
  const total = ok<bigint>(res[3]);
  const fetched = ok<bigint>(res[4]);
  const lastGood = ok<bigint>(res[5]);
  const live = fetched != null && fetched > BigInt(0) ? fetched : null;
  const price = live ?? (lastGood != null && lastGood > BigInt(0) ? lastGood : null);
  return {
    stakeRaw: stake.toString(),
    lusdGainRaw: lusd.toString(),
    ethGainRaw: eth.toString(),
    totalStakedRaw: total == null ? null : total.toString(),
    priceRaw: price == null ? null : price.toString(),
    priceStale: live == null && price != null,
  };
}
