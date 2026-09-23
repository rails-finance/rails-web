"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for a Moonwell position — one bar answering "how close is
 * this to liquidation?" at a glance, identical in look and scale to the
 * Aave-family and Compound runways.
 *
 * A Moonwell account borrows against a cross-market collateral stack, so there
 * is no single collateral price to anchor a *price* runway — this always
 * renders the HEALTH-FACTOR mode: value = HF (CF-weighted capacity ÷ debt,
 * every input a live read at the same head through the Comptroller's own
 * oracle), liquidation line = HF 1.0 — exactly the Comptroller's shortfall
 * line (the arithmetic reproduces getAccountLiquidity exactly; verified by
 * scripts/verify-moonwell-chain.mjs). The multi-asset basket branch,
 * `m = (HF − 1) / HF`, is the % the collateral basket can fall before the
 * account is liquidatable.
 *
 * Hidden when there's no debt (HF null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading — for riding the
 * position card's heading-button row.
 */
export function MoonwellRunway({ healthFactor, compact }: { healthFactor: number | null; compact?: boolean }) {
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
