"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for a Compound V3 position — one bar answering "how close
 * is this to liquidation?" at a glance, identical in look and scale to the
 * Aave-family runways.
 *
 * A Comet account borrows one base asset against a multi-asset collateral
 * stack, so there is no single collateral price to anchor a *price* runway —
 * this always renders the HEALTH-FACTOR mode: value = HF (liquidation capacity
 * ÷ debt value, every input a live Comet read at the same head), liquidation
 * line = HF 1.0 — exactly the contract's own isLiquidatable line (verified by
 * scripts/verify-compound-v3-chain.mjs). The multi-asset basket branch,
 * `m = (HF − 1) / HF`, is the % the collateral basket can fall before the
 * protocol can absorb the account.
 *
 * Hidden when there's no debt (HF null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading and no HF-1.0
 * caption — for riding the position card's heading-button row. The full
 * section form remains for hosts that give the runway its own row.
 */
export function CompoundRunway({ healthFactor, compact }: { healthFactor: number | null; compact?: boolean }) {
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
