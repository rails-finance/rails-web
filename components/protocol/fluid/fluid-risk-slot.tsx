"use client";

// The Fluid position card's footer, riding the card's heading-button row: the
// headroom to the vault's borrow limit and the vault's current borrow rate.
// The position ratio, its liquidation line and the runway are the card's third
// column (FluidPositionCard); the penalty and absorption lines are in the
// card's Explanation. Everything here is on the card face and inside the
// card's receipts scope.

import { FluidRiskView } from "@/components/protocol/fluid/fluid-risk-card";
import { RiskFooterStrip } from "@/components/shared/risk-footer-strip";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";

export function FluidRiskSlot({ chain, pair }: { chain: FluidPositionChainResponse; pair: string }) {
  return (
    <RiskFooterStrip>
      <FluidRiskView chain={chain} pair={pair} />
    </RiskFooterStrip>
  );
}
