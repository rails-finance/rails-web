"use client";

// The Aave V4 position card's risk slot — the ONE wrapping line riding the
// card's heading-button row (detail-page-anatomy §2, the four-point rule),
// modelled on aave-v3-risk-slot:
//
//   • the collateral-exposure cluster, label-led and reduced ("Collateral:
//     WBTC at a 78% liquidation threshold") — the sentence that used to sit
//     beneath the pane as a stacked footnote, brought onto the row (its LT
//     figure carries its own receipt: the blended threshold is a figure of
//     this slot's making, not a restatement of the card's HF stat), and
//   • the compact "% from liquidation" runway (health factor traced by the
//     card's own HF stat).

import { type PriceEntry, resolvePrice } from "@/lib/aave/prices";
import { type AaveSpokeCardInfo, type ReserveStats } from "@/lib/aave-v4/spoke-cards";
import { AAVE_V4_FALLBACK_LT } from "@/lib/aave-v4/liquidation-thresholds";
import { describeCollateralExposure, type ExposureInput } from "@/lib/aave-v4/position-exposure";
import { AaveV4SpokeRunway } from "@/components/protocol/aave-v4/aave-v4-spoke-runway";
import { RiskFooterStrip, RiskFigure, RiskStrong, RiskMeter } from "@/components/shared/risk-footer-strip";
import { Prov } from "@/components/shared/provenance";
import { BLENDED_LT_PROV } from "@/lib/aave-v4/position-provenance";

export function AaveV4RiskSlot({
  spoke,
  reserves,
  prices,
}: {
  spoke: AaveSpokeCardInfo;
  /** Event-derived reserve stats for the exposure cluster. Pass null until the
   *  event group + UI hydration have landed — the cluster waits (no flash);
   *  the runway renders on the spoke alone. */
  reserves: ReserveStats[] | null;
  prices?: Record<string, PriceEntry | number>;
}) {
  // The exposure sentence weighs assets by their USD share, so an asset with no
  // price source can't be weighed (RULE: Rails never invents a price —
  // lib/aave-v4/unpriced.ts). It drops out of the blend rather than entering it
  // at a dollar a unit; the tower's breakdown below names it.
  const inputs: ExposureInput[] = (reserves ?? [])
    .filter((r) => r.collateralEnabled ?? true)
    .map((r) => {
      const amount = r.currentSupplied ?? Math.max(0, r.supplied - r.withdrawn - r.liquidatedCollateral);
      const price = resolvePrice(r.symbol, prices);
      if (price == null) return null;
      return { symbol: r.symbol, collateralUsd: amount * price, lt: r.lt ?? AAVE_V4_FALLBACK_LT };
    })
    .filter((i): i is ExposureInput => i != null);
  const reduced = reserves ? describeCollateralExposure(inputs, spoke.blendedLt).reduced : null;

  return (
    <RiskFooterStrip>
      {reduced && (
        <RiskFigure label="Collateral">
          {reduced.subject}
          {reduced.ltPct != null && (
            <>
              {" "}
              at a{" "}
              <Prov info={BLENDED_LT_PROV}>
                <RiskStrong>{reduced.ltPct}%</RiskStrong>
              </Prov>{" "}
              {reduced.blended ? "blended liquidation" : "liquidation"} threshold
            </>
          )}
        </RiskFigure>
      )}
      <RiskMeter>
        <AaveV4SpokeRunway spoke={spoke} compact />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
