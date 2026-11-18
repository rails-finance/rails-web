// The live read behind a Liquity V2 deposit page, as
// /api/chain/liquity-v2/stability-pool answers it
// (lib/sources/chain/liquity-v2-sp.ts). Raw integer strings beside the block
// they were read at; the page scales them.

import type { SpBranch } from "@/lib/liquity-v2/sp-routes";
import type { DepositChainFigures } from "@/lib/liquity-v2/sp-math";

export interface LiquityV2DepositChain extends DepositChainFigures {
  branch: SpBranch;
  depositor: string;
  blockNumber: number;
  blockTimestamp: number;
  /** USD per collateral token (1e18) from the branch PriceFeed, or null. */
  priceRaw: string | null;
  /** Only lastGoodPrice answered. */
  priceStale: boolean;
  /** getTotalBoldDeposits(): the pool's BOLD, or null where it failed. */
  totalDepositsRaw: string | null;
  chainStale?: boolean;
}

export async function fetchLiquityV2DepositChain(branch: SpBranch, depositor: string): Promise<LiquityV2DepositChain> {
  const url = `/api/chain/liquity-v2/stability-pool?collateralType=${branch}&wallet=${depositor}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as LiquityV2DepositChain;
}
