"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for a Compound V2 position — one bar answering "how close
 * is this to liquidation?" at a glance, identical in look and scale to the
 * Aave-family, Compound V3 and Moonwell runways.
 *
 * A Compound V2 account borrows against a cross-market collateral stack, so
 * there is no single collateral price to anchor a *price* runway — this always
 * renders the ratio mode: value = the health REPLICA (CF-weighted capacity ÷
 * debt, every input a live read at the same head through the Comptroller's
 * own oracle), liquidation line = 1.0. The figure is a replica of the
 * Comptroller's walk — the contract itself answers with the
 * (liquidity, shortfall) tuple, which the surfaces beside this bar lead with —
 * so the receipt on the ratio says so. The multi-asset basket read,
 * `m = (HF − 1) / HF`, is the % the collateral basket can fall before the
 * account is liquidatable.
 *
 * Hidden when there's no debt (replica null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading — for riding the
 * position card's heading-button row.
 */
export function CompoundV2Runway({ healthReplica, compact }: { healthReplica: number | null; compact?: boolean }) {
  if (healthReplica == null || healthReplica <= 0) return null;

  const bar = (
    <PriceRunway
      compact={compact}
      currentPrice={healthReplica}
      liqPrice={1}
      liqCaption="liquidation · 1.0 (replica)"
      underwaterCaption="below the line (replica)"
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
