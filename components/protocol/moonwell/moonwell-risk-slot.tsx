"use client";

// The Moonwell position card's risk slot — both risk reads, always on, riding
// the card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the "% from liquidation" runway (the health factor traced by the card's
//     own stat; the slot adds no new receipts) — the spatial story, and
//   • the stated borrow-capacity lines riding the same strip: the current debt's share of
//     the CF-weighted capacity line, the line itself, and the Comptroller's
//     own "more to borrow" figure.
//
// Moonwell (a Compound V2 fork on this deployment) has ONE collateral factor
// per market — the borrow limit and the liquidation threshold coincide (the
// Morpho one-line shape, not Comet's two-factor split).

import { MoonwellRunway } from "@/components/protocol/moonwell/moonwell-runway";
import { MoonwellBorrowCapacityView } from "@/components/protocol/moonwell/moonwell-borrow-capacity-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";

export function MoonwellRiskSlot({ chain }: { chain: MoonwellChainResponse }) {
  return (
    <RiskFooterStrip>
      <MoonwellBorrowCapacityView chain={chain} />
      <RiskMeter>
        <MoonwellRunway compact healthFactor={chain.healthFactor} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
