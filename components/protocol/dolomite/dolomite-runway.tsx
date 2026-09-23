"use client";

import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for a Dolomite account — one bar answering "how close is
 * this to liquidation?" at a glance, identical in look and scale to the other
 * explorers' runways.
 *
 * An account cross-margins several balances, so there is no single collateral
 * price to anchor a *price* runway — this always renders the ratio mode:
 * value = the account's collateralisation (the core's OWN adjusted supply ÷
 * adjusted borrow — both legs getAdjustedAccountValues; only the division is
 * ours), liquidation line = the core's OWN requirement for exactly this
 * account (1 + getMarginRatioForAccount — the risk override where one is set,
 * the global margin ratio otherwise). Unlike a fixed 1.0 line, the line here
 * is per-account chain state: 1.17647 normally, 1.1111 under the LST/ETH
 * carve-out.
 *
 * Hidden when there's no debt (ratio null / nothing to liquidate).
 *
 * `compact` is the stat-line shorthand: the "% from liquidation" figure with
 * the inline bar, for riding the position card's heading-button row.
 */
export function DolomiteRunway({
  collateralization,
  requiredCollateralization,
  overrideActive,
  compact,
}: {
  collateralization: number | null;
  requiredCollateralization: number;
  overrideActive?: boolean;
  compact?: boolean;
}) {
  if (collateralization == null || collateralization <= 0 || requiredCollateralization <= 0) return null;

  const line = `${(requiredCollateralization * 100).toFixed(2)}%`;
  const bar = (
    <PriceRunway
      compact={compact}
      currentPrice={collateralization}
      liqPrice={requiredCollateralization}
      liqCaption={`liquidation · ${line}${overrideActive ? " (account risk override)" : " (the account's own requirement)"}`}
      underwaterCaption="below the requirement"
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
