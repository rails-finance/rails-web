"use client";

// The SparkLend position card's risk slot — both risk reads, always on,
// riding the card's heading-button row. Near-clone of aave-v3-risk-slot.tsx
// (SparkLend is an Aave V3 fork). (The Display menu is retired: one framing no
// longer hides behind the other.) Everything it draws is ON the card face and
// inside the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the "% from liquidation" runway (health factor traced by the card's own
//     HF stat; the slot adds no new receipts) — the spatial story, and
//   • the stated loan-to-value lines riding the same strip: the current ratio, the borrow
//     cap, the liquidation threshold and "available to borrow".

import { SparkRunway } from "@/components/protocol/spark/spark-runway";
import { SparkLtvView } from "@/components/protocol/spark/spark-ltv-card";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";

export function SparkRiskSlot({ chain }: { chain: SparkPositionChainResponse }) {
  return (
    <RiskFooterStrip>
      <SparkLtvView chain={chain} />
      {/* On a phone the strip stacks its figures right-aligned above the card's
          (i) button; the meter keeps a line of its own there rather than
          sharing the button's. */}
      <div className="mb-11 @min-[560px]:mb-0">
        <RiskMeter>
          <SparkRunway compact healthFactor={chain.healthFactor} />
        </RiskMeter>
      </div>
    </RiskFooterStrip>
  );
}
