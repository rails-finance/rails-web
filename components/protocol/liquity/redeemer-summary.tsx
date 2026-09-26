"use client";

// Redeemer summary — a separate block shown beneath the trove tower for a
// mixed wallet (owns troves AND initiated redemptions against someone else's).
// `RedeemerStats`/`calculateRedeemerStats` live in lib/liquity/economics.ts
// (co-located with calculateEconomicsFromEvents, which shares its
// ownedTroveIds derivation) — every caller of this component already gets a
// computed `RedeemerStats` from there (computeLiquityEconomics's `redeemer`
// field), so only the type is re-exported here for convenience.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatPrice, formatUsdValue } from "@/components/shared/economics-chart-primitives";
import type { RedeemerStats } from "@/lib/liquity/economics";
import { formatDate } from "@/lib/date";

export type { RedeemerStats };

export function RedeemerSummary({ stats, currentPrice }: { stats: RedeemerStats; currentPrice?: number }) {
  const dateRange = `${formatDate(stats.firstTimestamp)} – ${formatDate(stats.lastTimestamp)}`;
  const collValue = currentPrice ? stats.totalCollateralReceived * currentPrice : null;
  const netPL = collValue !== null ? collValue - stats.totalDebtRedeemed : null;
  // Effective rate: BOLD per unit of collateral received
  const effectiveRate =
    stats.totalCollateralReceived > 0 ? stats.totalDebtRedeemed / stats.totalCollateralReceived : null;

  return (
    <div className="rounded-lg bg-raised overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-xs font-bold border bg-rb-200 dark:bg-rb-800 text-foreground border-rb-300 dark:border-rb-700">
              REDEEMER
            </span>
            <span className="text-sm font-medium ">
              {stats.redemptionCount} redemptions across {stats.uniqueTroves} trove{stats.uniqueTroves !== 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-xs ">{dateRange}</span>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className=" text-xs">BOLD Redeemed</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-2xl font-bold text-foreground tabular-nums">
                {formatPrice(stats.totalDebtRedeemed)}
              </span>
              <TokenChipIcon symbol={stats.stableSymbol} size={16} />
            </div>
          </div>
          <div>
            <div className=" text-xs">Collateral Received</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-2xl font-bold text-foreground tabular-nums">
                {stats.totalCollateralReceived.toFixed(2)}
              </span>
              <TokenChipIcon symbol={stats.collateralType} size={16} />
            </div>
            {collValue !== null && (
              <div className="text-sm text-foreground font-medium mt-0.5">({formatUsdValue(collValue)})</div>
            )}
          </div>
          <div>
            <div className=" text-xs">Avg Rate</div>
            {effectiveRate !== null && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-2xl font-bold text-foreground tabular-nums">{formatPrice(effectiveRate)}</span>
                <span className="text-xs ">
                  {stats.stableSymbol}/{stats.collateralType}
                </span>
              </div>
            )}
            {effectiveRate !== null && currentPrice && (
              <div className="text-sm  font-medium mt-0.5">(spot: {formatPrice(currentPrice)})</div>
            )}
          </div>
        </div>

        {/* Net outcome */}
        {netPL !== null && (
          <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-rb-200 dark:border-rb-800 text-xs">
            <span className="">Net outcome at today&apos;s price:</span>
            <span className={`font-bold text-foreground`}>
              {netPL >= 0 ? "+" : "−"}
              {formatUsdValue(Math.abs(netPL))}
            </span>
          </div>
        )}

        {/* Gas */}
        {stats.totalGasCostUsd > 0 && (
          <p className="text-xs  flex items-center gap-0.5 mt-2">
            Gas: {stats.totalGasCostEth.toFixed(4)} <TokenChipIcon symbol="ether" size={16} /> (
            {formatUsdValue(stats.totalGasCostUsd)})
          </p>
        )}
      </div>
    </div>
  );
}
