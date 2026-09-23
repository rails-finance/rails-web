"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for an Aave V3 position — one bar answering "how close is
 * this to liquidation?" at a glance, identical in look and scale to the Aave V4
 * spoke runway and the Liquity trove runway (all feed the shared `PriceRunway`,
 * whose axis IS the "% from liquidation" metric).
 *
 * V3 is a single cross-collateralised pooled account, so there is no single
 * collateral asset to anchor a *price* runway (and the chain reserve read carries
 * the liquidation threshold, not an oracle price). It therefore always renders
 * the HEALTH-FACTOR mode: value = HF (chain-state at T), liquidation line = HF
 * 1.0. This is exactly V4's multi-asset-basket branch — `m = (HF − 1) / HF`, the
 * % the collateral basket can fall before liquidation — so the readout means the
 * same risk here as on every other rail.
 *
 * Hidden when there's no debt (HF null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading and no HF-1.0
 * caption — for riding the position card's heading-button row. The full
 * section form remains for hosts that give the runway its own row.
 */
export function AaveV3Runway({ healthFactor, compact }: { healthFactor: number | null; compact?: boolean }) {
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
