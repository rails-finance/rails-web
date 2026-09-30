"use client";

// The SparkLend position card's room left to borrow (ui-jobs 209), the line
// under Debt in the card's opened layer: `availableBorrowsBase` from
// Pool.getUserAccountData @ head, <Prov>-traced to that read. The loan-to-value,
// the borrow cap, the liquidation threshold and the e-mode category are stated
// in the card's Explanation.

import { Prov } from "@/components/shared/provenance";
import { fmtUsd } from "@/lib/aave-v4/format";
import { accountDataProv } from "@/lib/spark/position-provenance";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

export function SparkBorrowRoom({ chain }: { chain: SparkPositionChainResponse }) {
  if (chain.totalDebtUsd <= 0 || chain.totalCollateralUsd <= 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={accountDataProv("Available to borrow", "availableBorrowsBase")}>
        {fmtUsd(chain.availableBorrowsUsd).display}
      </Prov>{" "}
      more to borrow
    </div>
  );
}
