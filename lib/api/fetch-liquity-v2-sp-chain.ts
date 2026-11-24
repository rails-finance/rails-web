// The live read behind a Liquity V2 or fork deposit page, as
// /api/chain/<deployment>/stability-pool answers it
// (lib/sources/chain/liquity-v2-sp.ts). Raw integer strings beside the block
// they were read at; the page scales them.

import type { DepositChainFigures } from "@/lib/liquity-v2/sp-math";
import { LIQUITY_V2_SP, type SpDeployment } from "@/lib/liquity-v2/sp-deployment";

export interface LiquityV2DepositChain extends DepositChainFigures {
  /** The branch symbol, as the routes key it. */
  branch: string;
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

/** The deployment's chain read (`dep.chainApi`), Liquity V2's by default. A
 *  fork's collateral figures and price come back in 1e18
 *  (lib/liquity-v2/sp-decimals.ts). */
export async function fetchLiquityV2DepositChain(
  branch: string,
  depositor: string,
  dep: SpDeployment = LIQUITY_V2_SP,
): Promise<LiquityV2DepositChain> {
  const url = `${dep.chainApi}?collateralType=${branch}&wallet=${depositor}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (await res.json()) as LiquityV2DepositChain;
}
