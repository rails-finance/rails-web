"use client";

// The Aave V3 position card's risk detail (ui-jobs 209): the distance bar
// under Health factor in the card's opened layer. The health factor is traced
// by the card's HF stat; the bar adds no receipts.

import { AaveV3Runway } from "@/components/protocol/aave-v3/aave-v3-runway";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

/** The opened card's distance bar under Health factor, beside its
 *  "Liquidates on a N% drop". The card carries no loan-to-value line: the
 *  Explanation states the ratio, the borrow cap and the threshold. */
export function AaveV3RiskDetail({ chain }: { chain: AaveV3PositionChainResponse }) {
  if (chain.healthFactor == null || chain.healthFactor <= 0) return null;
  return (
    <div className="mt-1.5 max-w-72">
      <AaveV3Runway compact barOnly healthFactor={chain.healthFactor} />
    </div>
  );
}
