// The live read behind a Liquity V1 stake page, as
// /api/chain/liquity-v1/staking answers it
// (lib/sources/chain/liquity-v1-staking.ts). Raw integer strings beside the
// block they were read at; the page scales them.

import type { StakeChainFigures } from "@/lib/liquity-v1/staking-math";

export interface LiquityV1StakeChain extends StakeChainFigures {
  staker: string;
  blockNumber: number;
  blockTimestamp: number;
  /** totalLQTYStaked(): all the LQTY staked, or null where it failed. */
  totalStakedRaw: string | null;
  /** USD per ETH (1e18) from the PriceFeed, or null. */
  priceRaw: string | null;
  /** Only lastGoodPrice answered. */
  priceStale: boolean;
  chainStale?: boolean;
}

export async function fetchLiquityV1StakeChain(staker: string): Promise<LiquityV1StakeChain> {
  const url = `/api/chain/liquity-v1/staking?wallet=${staker}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as LiquityV1StakeChain;
}
