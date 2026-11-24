// The live read behind a Liquity V1 deposit page, as
// /api/chain/liquity-v1/stability-pool answers it
// (lib/sources/chain/liquity-v1-sp.ts). Raw integer strings beside the block
// they were read at; the page scales them.

import type { DepositChainFigures } from "@/lib/liquity-v1/sp-math";

export interface LiquityV1DepositChain extends DepositChainFigures {
  depositor: string;
  blockNumber: number;
  blockTimestamp: number;
  /** USD per ETH (1e18) from the PriceFeed, or null. */
  priceRaw: string | null;
  /** Only lastGoodPrice answered. */
  priceStale: boolean;
  /** getTotalLUSDDeposits(): the pool's LUSD, or null where it failed. */
  totalDepositsRaw: string | null;
  chainStale?: boolean;
}

export async function fetchLiquityV1DepositChain(depositor: string): Promise<LiquityV1DepositChain> {
  const url = `/api/chain/liquity-v1/stability-pool?wallet=${depositor}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as LiquityV1DepositChain;
}
