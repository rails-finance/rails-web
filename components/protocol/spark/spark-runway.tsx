"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for a SparkLend position — one bar answering "how close is
 * this to liquidation?" at a glance, identical in look and scale to the Aave V3
 * runway (SparkLend is a V3 fork with the same pooled-account HF).
 *
 * A single cross-collateralised pooled account has no single collateral asset to
 * anchor a *price* runway, so this always renders the HEALTH-FACTOR mode:
 * value = HF (live chain read), liquidation line = HF 1.0 — the multi-asset
 * basket branch, `m = (HF − 1) / HF`, the % the collateral basket can fall
 * before liquidation. The readout means the same risk here as on every other
 * rail.
 *
 * Hidden when there's no debt (HF null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading and no HF-1.0
 * caption — for riding the position card's heading-button row. The full
 * section form remains for hosts that give the runway its own row.
 */
export function SparkRunway({ healthFactor, compact }: { healthFactor: number | null; compact?: boolean }) {
  if (healthFactor == null || healthFactor <= 0) return null;

  const bar = (
    <PriceRunway
      compact={compact}
      currentPrice={healthFactor}
      liqPrice={1}
      liqCaption="liquidation · HF 1.0"
      underwaterCaption="below HF 1.0"
    />
  );
  if (compact) return bar;
  return (
    <div className="mt-2">
      <div className="mb-3 text-[11px] uppercase tracking-wider text-rb-500">Liquidation runway</div>
      {bar}
    </div>
  );
}
