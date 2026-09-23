"use client";

// The Compound V3 (Comet) position card's risk slot — both risk reads, always
// on, riding the card's heading-button row. (The Display menu is retired: one
// framing no longer hides behind the other.) Everything it draws is ON the
// card face and inside the card's receipts scope, so the Provenance list holds
// exactly these figures —
//
//   • the "% from liquidation" runway (health factor traced by the card's own
//     HF stat; the slot adds no new receipts) — the spatial story, and
//   • the stated borrow-capacity lines riding the same strip: the current debt's share of
//     the liquidation capacity, the liquidation line and "available to borrow"
//     — all in base-token terms (unit-safe in every market, since the WETH
//     market quotes in ETH, not USD).

import { CompoundRunway } from "@/components/protocol/compound/compound-runway";
import { CompoundBorrowCapacityView } from "@/components/protocol/compound/compound-borrow-capacity-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";

export function CompoundRiskSlot({ chain }: { chain: CompoundMarketChainResponse }) {
  return (
    <RiskFooterStrip>
      <CompoundBorrowCapacityView chain={chain} />
      <RiskMeter>
        <CompoundRunway compact healthFactor={chain.healthFactor} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
