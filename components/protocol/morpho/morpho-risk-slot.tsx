"use client";

// The Morpho position card's risk slot — both risk reads, always on, riding
// the card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the "% from liquidation" runway (health factor traced by the card's own
//     HF stat; the slot adds no new receipts) — the spatial story, and
//   • the stated borrow-capacity lines riding the same strip: the current debt's share of
//     the market's one line (LLTV), the line itself, and "available to borrow",
//   • the oracle price those lines rest on, with when its feeds published it
//     (morpho-oracle-price.tsx).
//
// Morpho keeps only ONE line — the lltv is the borrow cap and the liquidation
// line at once.

import { MorphoRunway } from "@/components/protocol/morpho/morpho-runway";
import { MorphoBorrowCapacityView } from "@/components/protocol/morpho/morpho-borrow-capacity-card";
import { MorphoOraclePriceFigure } from "@/components/protocol/morpho/morpho-oracle-price";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";

export function MorphoRiskSlot({ chain }: { chain: MorphoChainPositionResponse }) {
  return (
    <RiskFooterStrip>
      <MorphoBorrowCapacityView chain={chain} />
      <MorphoOraclePriceFigure chain={chain} />
      <RiskMeter>
        <MorphoRunway compact healthFactor={chain.healthFactor} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
