"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { Workflow, ChevronRight } from "lucide-react";
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

function SimplifiedOpenTroveCard({ trove, showViewButton = false, hideLabels = false }: { trove: TroveSummary; showViewButton?: boolean; hideLabels?: boolean }) {
  const calculator = useMemo(() => new InterestCalculator(), []);

  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('troves-scroll-position', String(window.scrollY));
    }
  };
  
  // Generate interest info if not provided by backend
  const interestInfo = useMemo(() => {
    // Remove this - new API doesn't have interestInfo property
    
    const mockLastUpdate = Date.now() / 1000 - (68 * 24 * 60 * 60); // 68 days ago
    const recordedDebt = parseFloat(trove.debt.currentRaw) / 1e18;
    const interestRate = trove.metrics.interestRate;
    
    return calculator.generateInterestInfo(
      recordedDebt,
      interestRate,
      mockLastUpdate,
      trove.batch.isMember,
      trove.batch.managementFee,
      trove.batch.manager || undefined
    );
  }, [trove, calculator]);

  // Calculate display value with interest
  const debtWithInterest = interestInfo ? interestInfo.entireDebt : trove.debt.current;

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-500 bg-slate-900 hover:shadow-lg transition-shadow cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold px-2 py-0.5 bg-green-900 text-green-400 rounded-xs">ACTIVE</span>
            <span className="text-slate-400">
              {formatDuration(trove.activity.createdAt, new Date())}
            </span>
            <span className="inline-flex items-center text-slate-400">
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
      </div>

      {/* Content section */}
      <div className="grid grid-cols-1 pt-2 p-4 gap-4">
        {/* Mobile layout - stack everything vertically */}
        <div className="md:hidden">
          {/* Main debt value */}
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">Debt</p>
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {formatPrice(debtWithInterest)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Essential metrics grid */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1 font-bold">Backed by</p>
              <div className="flex items-center">
                <span className="flex items-center">
                  <p className="text-xl font-bold mr-1">
                    {trove.collateral.amount}
                  </p>
                  <span className="flex items-center">
                    <TokenIcon assetSymbol={trove.collateralType} />
                  </span>
                </span>
                <div className="ml-1 flex items-center">
                  <span className="text-xs flex items-center text-green-400 border-l border-r border-green-400 rounded-sm px-1 py-0">
                    {formatUsdValue(trove.collateral.valueUsd)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1">Collateral Ratio</p>
              <p className="text-xl font-semibold">
                {interestInfo && trove.collateral.valueUsd > 0
                  ? `${((trove.collateral.valueUsd / debtWithInterest) * 100).toFixed(1)}%`
                  : `${trove.metrics.collateralRatio}%`}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                {trove.batch.isMember && (
                  <span className="text-xs font-semibold px-1 py-0.5 bg-pink-900/50 text-pink-400 rounded-xs">DELEGATED</span>
                )}
                <p className="text-xs text-slate-400">Interest Rate</p>
              </div>
              <div className="text-xl font-medium">
                {trove.metrics.interestRate}%
              </div>
            </div>
          </div>
        </div>

        {/* Desktop layout - all on one line with 5 columns */}
        <div className="hidden md:grid md:gap-6 md:items-end" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
          {/* Main debt value */}
          <div>
            {!hideLabels && <p className="text-xs text-slate-400 mb-1">Debt</p>}
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {formatPrice(debtWithInterest)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>

          <div>
            {!hideLabels && <p className="text-xs text-slate-600 mb-1 font-bold">Backed by</p>}
            <div className="flex items-center">
              <span className="flex items-center">
                <p className="text-xl font-bold mr-1 text-slate-300">
                  {trove.collateral.amount}
                </p>
                <span className="flex items-center">
                  <TokenIcon assetSymbol={trove.collateralType} />
                </span>
              </span>
              <div className="ml-1 flex items-center">
                <span className="text-xs flex items-center text-green-400 border-l border-r border-green-400 rounded-sm px-1 py-0">
                  {formatUsdValue(trove.collateral.valueUsd)}
                </span>
              </div>
            </div>
          </div>

          <div>
            {!hideLabels && <p className="text-xs text-slate-400 mb-1">Collateral Ratio</p>}
            <p className="text-xl font-semibold">
              {interestInfo && trove.collateral.valueUsd > 0
                ? `${((trove.collateral.valueUsd / debtWithInterest) * 100).toFixed(1)}%`
                : `${trove.metrics.collateralRatio}%`}
            </p>
          </div>

          <div>
            {!hideLabels && (
              <div className="flex items-center gap-1 mb-1">
                {trove.batch.isMember && (
                  <span className="text-xs font-semibold px-1 py-0.5 bg-blue-900 text-blue-400 rounded-xs">DELEGATED</span>
                )}
                <p className="text-xs text-slate-400">Interest Rate</p>
              </div>
            )}
            {hideLabels && trove.batch.isMember && (
              <span className="text-xs font-semibold px-1 py-0.5 bg-fuchsia-900 text-fuchsia-400 rounded-xs mb-1 inline-block">DELEGATED</span>
            )}
            <div className="text-xl font-medium">
              {trove.metrics.interestRate}%
            </div>
          </div>

          {/* 5th column with view link */}
          {showViewButton && (
            <div className="flex justify-end items-center bg-slate-800  group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1">
              <span className="text-sm text-slate-500 group-hover:text-white font-medium flex items-center gap-1" aria-label="View Trove">
                <Workflow className="w-6 h-6" />
                View
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>

        {/* Footer - without view button since it's now in the 5th column on desktop */}
        <TroveCardFooter
          trove={trove}
          showViewButton={false}
          dateText={formatDuration(trove.activity.createdAt, new Date())}
          showDetailedInfo={false}
        />

        {/* Mobile view link - still shown in footer on mobile */}
        {showViewButton && (
          <div className="md:hidden mt-4">
            <span className="flex items-center gap-1 text-sm text-blue-400 group-hover:text-blue-300 font-medium transition-colors" aria-label="View Trove">
                <Workflow className="w-6 h-6" />
                View
                <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function SimplifiedClosedTroveCard({ trove, showViewButton = false, hideLabels = false }: { trove: TroveSummary; showViewButton?: boolean; hideLabels?: boolean }) {
  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('troves-scroll-position', String(window.scrollY));
    }
  };

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-500 bg-slate-700 hover:shadow-lg transition-shadow cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold px-2 py-0.5 bg-slate-800 text-slate-400 rounded-xs">CLOSED</span>
            <span className="text-slate-400">
              {formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
            </span>
            <span className="inline-flex items-center text-slate-400">
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
      </div>

      {/* Content section */}
      <div className="grid grid-cols-1 pt-2 p-4 gap-4">
        {/* Mobile layout */}
        <div className="md:hidden">
          {/* Peak debt value */}
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">Peak Debt</p>
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {formatPrice(trove.debt.peak)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>
        </div>

        {/* Desktop layout - with view link */}
        <div className="hidden md:grid md:gap-6 md:items-end" style={{ gridTemplateColumns: '1fr auto' }}>
          {/* Peak debt value */}
          <div>
            {!hideLabels && <p className="text-xs text-slate-400 mb-1">Peak Debt</p>}
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {formatPrice(trove.debt.peak)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* View link */}
          {showViewButton && (
            <div className="flex justify-end items-center">
              <span className="text-sm text-blue-400 group-hover:text-blue-300 font-medium transition-colors flex items-center gap-1" aria-label="View Trove">
                <Workflow className="w-6 h-6" />
                View
                <ChevronRight className="w-4 h-4" />
              </span>
            </div>
          )}
        </div>

        {/* Footer - without view button since it's now inline */}
        <TroveCardFooter
          trove={trove}
          showViewButton={false}
          dateText={formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
          showDetailedInfo={false}
        />

        {/* Mobile view link - still shown in footer on mobile */}
        {showViewButton && (
          <div className="md:hidden mt-4">
            <span className="flex items-center gap-1 text-sm text-blue-400 group-hover:text-blue-300 font-medium transition-colors" aria-label="View Trove">
                <Workflow className="w-6 h-6" />
                View
                <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function SimplifiedLiquidatedTroveCard({ trove, showViewButton = false, collateralAtLiquidation, hideLabels = false }: { trove: TroveSummary; showViewButton?: boolean; collateralAtLiquidation?: number; hideLabels?: boolean }) {
  // Save scroll position when navigating to trove detail
  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('troves-scroll-position', String(window.scrollY));
    }
  };

  return (
    <Link
      href={`/trove/${trove.collateralType}/${trove.id}`}
      onClick={handleClick}
      className="block relative rounded-lg text-slate-500 bg-slate-800 hover:shadow-lg transition-shadow cursor-pointer group"
    >
      {/* Header section */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold px-2 py-0.5 bg-red-900 text-red-400 rounded-xs">LIQUIDATED</span>
            <span className="text-slate-400">
              {formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
            </span>
            <span className="inline-flex items-center text-slate-400">
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
      </div>

      {/* Content section */}
      <div className="grid grid-cols-1 pt-2 p-4 gap-4">
        {/* Mobile layout - stack everything vertically */}
        <div className="md:hidden">
          {/* Liquidated debt value */}
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">Liquidated Debt</p>
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {formatPrice(trove.debt.current)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>

          {/* Essential metrics */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Collateral at Liquidation</p>
              <div className="flex items-center">
                <p className="text-xl font-bold mr-1">
                  {collateralAtLiquidation ? collateralAtLiquidation.toFixed(4) : '—'}
                </p>
                {collateralAtLiquidation && (
                  <TokenIcon assetSymbol={trove.collateralType} />
                )}
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1">Final Interest Rate</p>
              <div className="text-xl font-medium">
                {trove.metrics.interestRate}%
              </div>
            </div>
          </div>
        </div>

        {/* Desktop layout - all on one line */}
        <div className="hidden md:grid md:grid-cols-3 md:gap-6 md:items-end">
          {/* Liquidated debt value */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Liquidated Debt</p>
            <div className="flex items-center">
              <h3 className="text-3xl font-bold">
                {formatPrice(trove.debt.current)}
              </h3>
              <span className="ml-2 text-green-400 text-lg">
                <TokenIcon assetSymbol="BOLD" className="w-7 h-7 relative top-0" />
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Collateral at Liquidation</p>
            <div className="flex items-center">
              <p className="text-xl font-bold mr-1">
                {collateralAtLiquidation ? collateralAtLiquidation.toFixed(4) : '—'}
              </p>
              {collateralAtLiquidation && (
                <TokenIcon assetSymbol={trove.collateralType} />
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Final Interest Rate</p>
            <div className="text-xl font-medium">
              {trove.metrics.interestRate}%
            </div>
          </div>
        </div>

        {/* Footer */}
        <TroveCardFooter
          trove={trove}
          showViewButton={showViewButton}
          dateText={formatDuration(trove.activity.createdAt, trove.activity.lastActivityAt)}
          showDetailedInfo={false}
        />
      </div>
    </Link>
  );
}

export function SimplifiedTroveCard({ trove, showViewButton = false, collateralAtLiquidation, hideLabels = false }: SimplifiedTroveCardProps) {
  if (trove.status === "liquidated") {
    return <SimplifiedLiquidatedTroveCard
      trove={trove}
      showViewButton={showViewButton}
      collateralAtLiquidation={collateralAtLiquidation}
      hideLabels={hideLabels}
    />;
  }

  if (trove.status === "open") {
    return <SimplifiedOpenTroveCard trove={trove} showViewButton={showViewButton} hideLabels={hideLabels} />;
  }

  return <SimplifiedClosedTroveCard trove={trove} showViewButton={showViewButton} hideLabels={hideLabels} />;
}