"use client";

// The Aave V3 position card's room left to borrow (ui-jobs 209), the line
// under Debt in the card's opened layer: `availableBorrowsBase` from
// Pool.getUserAccountData @ head, <Prov>-traced to that read. The loan-to-value,
// the borrow cap and the liquidation threshold are stated in the card's
// Explanation.

import { Prov } from "@/components/shared/provenance";
import { fmtUsd } from "@/lib/aave-v4/format";
import { accountDataProv, type V3PoolLane } from "@/lib/aave-v3/position-provenance";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

export function AaveV3BorrowRoom({ chain }: { chain: AaveV3PositionChainResponse }) {
  // Which Pool, and through which route, the receipt names: the page's own
  // identity (a Base lender's Pool and proxy), which on Ethereum resolves to
  // the same market Pool `chain.pool` names.
  const lane = useV3Pool();
  const pool: V3PoolLane = lane.positionRoute ? { ...lane, address: chain.pool || lane.address } : chain.pool;
  if (chain.totalDebtUsd <= 0 || chain.totalCollateralUsd <= 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={accountDataProv("Available to borrow", "availableBorrowsBase", pool)}>
        {fmtUsd(chain.availableBorrowsUsd).display}
      </Prov>{" "}
      more to borrow
    </div>
  );
}
