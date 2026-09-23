"use client";

// The Compound V2 position card's risk slot — both risk reads, always on,
// riding the card's heading-button row. (The Display menu is retired: one
// framing no longer hides behind the other.) Everything it draws is ON the
// card face and inside the card's receipts scope, so the Provenance list holds
// exactly these figures —
//
//   • the "% from liquidation" runway (the health REPLICA traced by the card's
//     own stat; the slot adds no new receipts) — the spatial story, and
//   • the stated borrow-capacity lines riding the same strip: the current debt's share of
//     the CF-weighted capacity line, the line itself, and the Comptroller's
//     own "more to borrow" figure.
//
// Compound V2 has ONE collateral factor per market — the borrow limit and the
// liquidation threshold coincide (the Morpho one-line shape, not Comet's
// two-factor split).

import { CompoundV2Runway } from "@/components/protocol/compound-v2/compound-v2-runway";
import { CompoundV2BorrowCapacityView } from "@/components/protocol/compound-v2/compound-v2-borrow-capacity-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";

export function CompoundV2RiskSlot({ chain }: { chain: CompoundV2ChainResponse }) {
  return (
    <RiskFooterStrip>
      <CompoundV2BorrowCapacityView chain={chain} />
      <RiskMeter>
        <CompoundV2Runway compact healthReplica={chain.healthReplica} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
