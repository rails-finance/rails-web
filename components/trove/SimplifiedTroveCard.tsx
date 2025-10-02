"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { ChevronRight, Users } from "lucide-react";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { TroveSummary } from "@/types/api/trove";
import { formatDate, formatDuration } from "@/lib/date";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { InterestCalculator } from "@/lib/utils/interest-calculator";

interface SimplifiedTroveCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
  collateralAtLiquidation?: number;
  hideLabels?: boolean;
}

function SimplifiedOpenTroveCard({
  trove,
  showViewButton = false,
  hideLabels = false,
}: {
  trove: TroveSummary;
  showViewButton?: boolean;
  hideLabels?: boolean;
}) {
  const calculator = useMemo(() => new InterestCalculator(), []);

  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("troves-scroll-position", String(window.scrollY));
    }
  };

  // Generate interest info if not provided by backend
  const interestInfo = useMemo(() => {
    const recordedDebt = parseFloat(trove.debt.currentRaw) / 1e18;
    const interestRate = trove.metrics.interestRate;
    // Use actual lastActivityAt timestamp from trove data
    const lastUpdateTime = trove.activity.lastActivityAt;

    return calculator.generateInterestInfo(
      recordedDebt,
      interestRate,
      lastUpdateTime,
      trove.batch.isMember,
      trove.batch.managementFee,
      trove.batch.manager || undefined,
    );
  }, [trove, calculator]);

  // Calculate display value with interest
  const debtWithInterest = interestInfo ? interestInfo.entireDebt : trove.debt.current;

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-600 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 hover:shadow-sm transition-shadow cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-extrabold px-2 py-0.5 text-white bg-green-500 dark:bg-green-900 dark:text-green-400 rounded-xs text-xs">
            ACTIVE
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {trove.activity.redemptionCount > 0 && (
            <span className="inline-flex items-center text-orange-400">
              <Icon name="triangle" size={12} />
              <span className="ml-1">{trove.activity.redemptionCount}</span>
            </span>
          )}
          <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
            <Icon name="arrow-left-right" size={12} />
            <span className="ml-1">{trove.activity.transactionCount}</span>
          </span>
        </div>
      </div>

      {/* Content section - single responsive grid */}
      <div className="pt-2 p-4 space-y-4">
        {/* Main metrics grid - responsive columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 md:items-end">
          {/* Debt - spans 2 columns on mobile */}
          <div className="col-span-2 md:col-span-1">
            {!hideLabels && <span className="text-xs font-bold text-slate-400 milodon dark:text-slate-600">Debt</span>}
            <div className="flex items-center">
              <span className="text-xl font-bold text-slate-800 milodon dark:text-slate-300">
                {formatPrice(debtWithInterest)}
              </span>
              <span className="ml-2 text-green-400">
                <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Backed by */}
          <div className="md:col-span-1">
            {!hideLabels && (
              <span className="text-xs font-bold text-slate-400 milodon dark:text-slate-600">Backed by</span>
            )}
            <div className="flex items-center">
              <span className="flex items-center">
                <span className="text-xl font-bold text-slate-800 milodon dark:text-slate-300">
                  {trove.collateral.amount}
                </span>
                <TokenIcon assetSymbol={trove.collateralType} />
              </span>
              <div className="ml-1 flex items-center">
                <span className="text-xs flex items-center text-green-400 border-l border-r border-green-400 rounded-sm px-1 py-0">
                  {formatUsdValue(trove.collateral.valueUsd)}
                </span>
              </div>
            </div>
          </div>

          {/* Collateral Ratio */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-1">
              {!hideLabels && (
                <span className="text-xs font-bold text-slate-400 milodon dark:text-slate-600">
                  <span className="">Collateral Ratio</span>
                </span>
              )}
            </div>
            <span className="text-xl font-bold text-slate-800 milodon dark:text-slate-300">
              {interestInfo && trove.collateral.valueUsd > 0
                ? `${((trove.collateral.valueUsd / debtWithInterest) * 100).toFixed(1)}%`
                : `${trove.metrics.collateralRatio}%`}
            </span>
          </div>

          {/* Interest Rate */}
          <div className="md:col-span-1">
            {!hideLabels && (
              <div className="flex items-center gap-1">
                {trove.batch.isMember && (
                  <span className="inline-flex items-center text-xs font-semibold px-1 py-0.5 bg-pink-300 text-white dark:bg-pink-900/50 dark:text-pink-400 rounded-xs">
                    <Users className="w-3 h-3" aria-hidden="true" />
                  </span>
                )}
                <span className="text-xs font-bold text-slate-400 milodon dark:text-slate-600">Interest Rate</span>
              </div>
            )}
            {hideLabels && trove.batch.isMember && (
              <span className="inline-flex items-center text-xs font-semibold px-1 py-0.5 bg-pink-300 text-white dark:bg-pink-900/50 dark:text-pink-400 rounded-xs">
                <Users className="w-3 h-3" aria-hidden="true" />
              </span>
            )}
            <span className="text-xl font-bold text-slate-800 milodon dark:text-slate-300">
              {trove.metrics.interestRate}%
            </span>
          </div>
        </div>

        {/* Footer with view button */}
        <div className="flex items-center justify-between">
          <TroveCardFooter
            trove={trove}
            showViewButton={false}
            dateText={`Latest activity ${formatDuration(trove.activity.lastActivityAt, new Date())} ago`}
            showDetailedInfo={false}
          />
          {showViewButton && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1">
              <span
                className="text-sm text-slate-700 dark:text-slate-500 group-hover:text-white font-medium flex items-center gap-1"
                aria-label="View Trove"
              >
                <Icon name="timeline" size={20} />
                View
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SimplifiedClosedTroveCard({
  trove,
  showViewButton = false,
  hideLabels = false,
}: {
  trove: TroveSummary;
  showViewButton?: boolean;
  hideLabels?: boolean;
}) {
  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("troves-scroll-position", String(window.scrollY));
    }
  };

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-600 dark:text-slate-500 bg-gray-100 dark:bg-slate-700 hover:shadow-sm transition-shadow cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold px-2 py-0.5 bg-slate-500 dark:bg-slate-800 text-white dark:text-slate-400 rounded text-xs">
            CLOSED
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
            <Icon name="arrow-left-right" size={12} />
            <span className="ml-1">{trove.activity.transactionCount}</span>
          </span>
          {trove.activity.redemptionCount > 0 && (
            <span className="inline-flex items-center text-orange-400">
              <Icon name="triangle" size={12} />
              <span className="ml-1">{trove.activity.redemptionCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* Content section - single responsive structure */}
      <div className="pt-2 p-4 space-y-4">
        {/* Main content grid */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 md:items-end">
          {/* Peak debt value */}
          <div>
            {!hideLabels && (
              <span className="text-xs font-bold text-slate-400 milodon dark:text-slate-600">Debt At Peak</span>
            )}
            <div className="flex items-center">
              <span className="text-xl font-bold text-slate-800 milodon dark:text-slate-300">
                {formatPrice(trove.debt.peak)}
              </span>
              <span className="ml-2 text-green-400">
                <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 relative top-0" />
              </span>
            </div>
          </div>
        </div>

        {/* Footer with view button */}
        <div className="flex items-center justify-between">
          <TroveCardFooter
            trove={trove}
            showViewButton={false}
            dateText={`Latest activity ${formatDuration(trove.activity.lastActivityAt, new Date())} ago`}
            showDetailedInfo={false}
          />
          {showViewButton && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1">
              <span
                className="text-sm text-slate-700 dark:text-slate-500 group-hover:text-white font-medium flex items-center gap-1"
                aria-label="View Trove"
              >
                <Icon name="timeline" size={20} />
                View
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SimplifiedLiquidatedTroveCard({
  trove,
  showViewButton = false,
  collateralAtLiquidation,
  hideLabels = false,
}: {
  trove: TroveSummary;
  showViewButton?: boolean;
  collateralAtLiquidation?: number;
  hideLabels?: boolean;
}) {
  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("troves-scroll-position", String(window.scrollY));
    }
  };

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-600 dark:text-slate-500 bg-red-50 dark:bg-slate-800 hover:shadow-sm transition-shadow cursor-pointer group "
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold px-2 py-0.5 bg-red-900 text-red-400 rounded-xs">LIQUIDATED</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center text-slate-600 dark:text-slate-400">
            <Icon name="arrow-left-right" size={12} />
            <span className="ml-1">{trove.activity.transactionCount}</span>
          </span>
          {trove.activity.redemptionCount > 0 && (
            <span className="inline-flex items-center text-orange-400">
              <Icon name="triangle" size={12} />
              <span className="ml-1">{trove.activity.redemptionCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* Content section - single responsive structure */}
      <div className="pt-2 p-4 space-y-4">
        {/* Main metrics grid - responsive columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 md:items-end">
          {/* Liquidated debt value */}
          <div>
            {!hideLabels && (
              <span className="text-xs text-slate-700 dark:text-slate-600 mb-1 font-bold">Liquidated Debt</span>
            )}
            <div className="flex items-center">
              <span className="text-xl font-bold text-slate-800 milodon dark:text-slate-300">
                {formatPrice(trove.debt.current)}
              </span>
              <span className="ml-2 text-green-400">
                <TokenIcon assetSymbol="BOLD" className="w-6 md:w-7 h-6 md:h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Collateral at liquidation */}
          <div>
            {!hideLabels && (
              <span className="text-xs text-slate-700 dark:text-slate-600 mb-1 font-bold">
                Collateral at Liquidation
              </span>
            )}
            <div className="flex items-center">
              <span className="text-lg md:text-xl font-bold mr-1">
                {collateralAtLiquidation ? collateralAtLiquidation.toFixed(4) : "—"}
              </span>
              {collateralAtLiquidation && <TokenIcon assetSymbol={trove.collateralType} />}
            </div>
          </div>

          {/* Final interest rate */}
          <div>
            {!hideLabels && (
              <span className="text-xs text-slate-700 dark:text-slate-600 mb-1 font-bold">Final Interest Rate</span>
            )}
            <div className="text-lg md:text-xl font-medium">{trove.metrics.interestRate}%</div>
          </div>
        </div>

        {/* Footer with view button */}
        <div className="flex items-center justify-between">
          <TroveCardFooter
            trove={trove}
            showViewButton={false}
            dateText={`Latest activity ${formatDuration(trove.activity.lastActivityAt, new Date())} ago`}
            showDetailedInfo={false}
          />
          {showViewButton && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1">
              <span
                className="text-sm text-slate-700 dark:text-slate-500 group-hover:text-white font-medium flex items-center gap-1"
                aria-label="View Trove"
              >
                <Icon name="timeline" size={20} />
                View
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SimplifiedTroveCard({
  trove,
  showViewButton = false,
  collateralAtLiquidation,
  hideLabels = false,
}: SimplifiedTroveCardProps) {
  if (trove.status === "liquidated") {
    return (
      <SimplifiedLiquidatedTroveCard
        trove={trove}
        showViewButton={showViewButton}
        collateralAtLiquidation={collateralAtLiquidation}
        hideLabels={hideLabels}
      />
    );
  }

  if (trove.status === "open") {
    return <SimplifiedOpenTroveCard trove={trove} showViewButton={showViewButton} hideLabels={hideLabels} />;
  }

  return <SimplifiedClosedTroveCard trove={trove} showViewButton={showViewButton} hideLabels={hideLabels} />;
}
