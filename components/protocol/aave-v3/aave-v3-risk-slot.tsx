"use client";

// The Aave V3 position card's risk slot — both risk reads, always on, riding
// the card's heading-button row. (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the "% from liquidation" runway (health factor traced by the card's own
//     HF stat; the slot adds no new receipts) — the spatial story, and
//   • the stated loan-to-value lines riding the same strip: the current ratio, the borrow
//     cap, the liquidation threshold and "available to borrow".

import { AaveV3Runway } from "@/components/protocol/aave-v3/aave-v3-runway";
import { AaveV3LtvView } from "@/components/protocol/aave-v3/aave-v3-ltv-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

export function AaveV3RiskSlot({ chain }: { chain: AaveV3PositionChainResponse }) {
  return (
    <RiskFooterStrip>
      <AaveV3LtvView chain={chain} />
      <RiskMeter>
        <AaveV3Runway compact healthFactor={chain.healthFactor} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}

/** The opened card's distance bar under Health factor (ui-jobs 209), beside
 *  its "Liquidates on a N% drop". The card carries no loan-to-value line: the
 *  Explanation states the ratio, the borrow cap and the threshold. */
export function AaveV3RiskDetail({ chain }: { chain: AaveV3PositionChainResponse }) {
  if (chain.healthFactor == null || chain.healthFactor <= 0) return null;
  return (
    <div className="mt-1.5 max-w-72">
      <AaveV3Runway compact barOnly healthFactor={chain.healthFactor} />
    </div>
  );
}
