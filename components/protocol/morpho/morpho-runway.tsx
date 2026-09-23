"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for a Morpho position — one bar answering "how close is
 * this to liquidation?" at a glance, identical in look and scale to the other
 * protocols' runways.
 *
 * Rendered in HEALTH-FACTOR mode: value = maxBorrow ÷ debt (collateral × the
 * market's own oracle price × lltv, over the live-accrued debt — every input a
 * chain read at the same head), liquidation line = HF 1.0. Morpho exposes no
 * public health getter, so HF 1.0 is the REPLICATED _isHealthy line — the
 * exact arithmetic the contract runs before allowing a liquidation, verified
 * by scripts/verify-morpho-chain.mjs. `m = (HF − 1) / HF` is the % the
 * collateral price can fall before liquidation.
 *
 * Hidden when there's no debt (HF null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading and no HF-1.0
 * caption — for riding the position card's heading-button row. The full
 * section form remains for hosts that give the runway its own row.
 */
export function MorphoRunway({ healthFactor, compact }: { healthFactor: number | null; compact?: boolean }) {
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
