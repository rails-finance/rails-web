"use client";

// The Fluid position card's risk slot — both risk reads, always on, riding
// the card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the "% from liquidation" runway, on the vault's own price axis
//     (collateral priced in the debt token — Fluid has no USD feed) — the
//     spatial story, and
//   • the stated position-ratio lines riding the same strip: debt ÷ (collateral ×
//     liquidate price) against the vault's lines (borrow gate, liquidation
//     threshold, full-absorption limit) — the same engine-space read.
//
// No rate strip: Fluid vault rates float per vault (exchangePricesAndRates),
// and the vault view (/fluid/vaults) is where that pool-wide context belongs
// — nothing here needs a market-view addition.

import { FluidRunway } from "@/components/protocol/fluid/fluid-runway";
import { FluidRiskView } from "@/components/protocol/fluid/fluid-risk-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";

export function FluidRiskSlot({ chain, pair }: { chain: FluidPositionChainResponse; pair: string }) {
  return (
    <RiskFooterStrip>
      <FluidRiskView chain={chain} pair={pair} />
      <RiskMeter>
        <FluidRunway compact chain={chain} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
