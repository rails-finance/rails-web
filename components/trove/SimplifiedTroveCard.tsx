"use client";

import { useMemo } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { TroveData } from "@/types/api/trove";
import { formatDate } from "@/lib/date";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { InterestCalculator } from "@/lib/utils/interest-calculator";

interface SimplifiedTroveCardProps {
  trove: TroveData;
  showViewButton?: boolean;
  collateralAtLiquidation?: number;
}

function SimplifiedOpenTroveCard({ trove, showViewButton = false }: { trove: TroveData; showViewButton?: boolean }) {
  const calculator = useMemo(() => new InterestCalculator(), []);
  
  // Generate interest info if not provided by backend
  const interestInfo = useMemo(() => {
    if (trove.interestInfo) {
      return trove.interestInfo;
    }
    
    const mockLastUpdate = Date.now() / 1000 - (68 * 24 * 60 * 60); // 68 days ago
    const recordedDebt = parseFloat(trove.mainValueRaw) / 1e18;
    const interestRate = trove.metrics.interestRate;
    
    return calculator.generateInterestInfo(
      recordedDebt,
      interestRate,
      mockLastUpdate,
      trove.batchMembership.isMember,
      trove.batchMembership.managementFeeRate,
      trove.batchMembership.batchManager || undefined
    );
  }, [trove, calculator]);

  // Calculate display value with interest
  const debtWithInterest = interestInfo ? interestInfo.entireDebt : trove.mainValue;

  return (
    <div className="relative rounded-lg text-slate-500 bg-slate-900">
      {/* Header section */}
      <div className="flex items-center">
        <TroveCardHeader status="open" assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} />
        <div className="flex items-center ml-4">
          <span className="text-xs font-semibold px-2 py-0.5 bg-green-900 text-green-400 rounded-xs mr-2">ACTIVE</span>
        </div>
      </div>

      {/* Content section */}
      <div className="grid grid-cols-1 pt-2 p-4 gap-4">
        {/* Main debt value */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Debt</p>
          <div className="flex items-center">
            <h3 className="text-3xl font-bold">
              {formatPrice(debtWithInterest)}
            </h3>
            <span className="ml-2 text-green-400 text-lg">
              <TokenIcon assetSymbol={trove.assetType} className="w-7 h-7 relative top-0" />
            </span>
          </div>
        </div>

        {/* Essential metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Backed by</p>
            <div className="flex items-center">
              <span className="flex items-center">
                <p className="text-xl font-bold mr-1">
                  {trove.backedBy.amount}
                </p>
                <span className="flex items-center">
                  <TokenIcon assetSymbol={trove.collateralType} />
                </span>
              </span>
              <div className="ml-1 flex items-center">
                <span className="text-xs flex items-center text-green-400 border-l border-r border-green-400 rounded-sm px-1 py-0">
                  {formatUsdValue(trove.backedBy.valueUsd)}
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <p className="text-xs text-slate-400 mb-1">Collateral Ratio</p>
            <p className="text-xl font-semibold">
              {interestInfo && trove.backedBy.valueUsd > 0 
                ? `${((trove.backedBy.valueUsd / debtWithInterest) * 100).toFixed(1)}%`
                : `${trove.metrics.collateralRatio}%`}
            </p>
          </div>
          
          <div>
            <div className="flex items-center gap-1 mb-1">
              {trove.batchMembership.isMember && (
                <span className="text-xs font-semibold px-1 py-0.5 bg-blue-900 text-blue-400 rounded-xs">DELEGATED</span>
              )}
              <p className="text-xs text-slate-400">Interest Rate</p>
            </div>
            <div className="text-xl font-medium">
              {trove.metrics.interestRate}%
            </div>
          </div>
        </div>

        {/* Footer */}
        <TroveCardFooter
          trove={trove}
          showViewButton={showViewButton}
          dateInfo={{
            prefix: "Opened",
            date: formatDate(trove.activity.created),
            suffix: `${trove.activity.lifetimeDays} days`
          }}
        />
      </div>
    </div>
  );
}

function SimplifiedClosedTroveCard({ trove, showViewButton = false }: { trove: TroveData; showViewButton?: boolean }) {
  return (
    <div className="relative rounded-lg text-slate-500 bg-slate-700">
      {/* Header section */}
      <div className="flex items-center">
        <TroveCardHeader status="closed" assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} />
        <div className="flex items-center ml-4">
          <span className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-400 rounded-xs mr-2">CLOSED</span>
        </div>
      </div>

      {/* Content section */}
      <div className="grid grid-cols-1 pt-2 p-4 gap-4">
        {/* Peak debt value */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Peak Debt</p>
          <div className="flex items-center">
            <h3 className="text-3xl font-bold">
              {formatPrice(trove.peakValue)}
            </h3>
            <span className="ml-2 text-green-400 text-lg">
              <TokenIcon assetSymbol={trove.assetType} className="w-7 h-7 relative top-0" />
            </span>
          </div>
        </div>

        {/* Essential metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Peak Collateral Ratio</p>
            <p className="text-xl font-semibold">
              {trove.metrics.collateralRatio}%
            </p>
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
          dateInfo={{
            prefix: "Closed",
            date: formatDate(trove.activity.closed || trove.activity.created),
            suffix: `${trove.activity.lifetimeDays} days`
          }}
        />
      </div>
    </div>
  );
}

function SimplifiedLiquidatedTroveCard({ trove, showViewButton = false, collateralAtLiquidation }: { trove: TroveData; showViewButton?: boolean; collateralAtLiquidation?: number }) {
  return (
    <div className="relative rounded-lg text-slate-500 bg-slate-800">
      {/* Header section */}
      <div className="flex items-center">
        <TroveCardHeader status="liquidated" assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} />
        <div className="flex items-center ml-4">
          <span className="text-xs font-semibold px-2 py-0.5 bg-red-900 text-red-400 rounded-xs mr-2">LIQUIDATED</span>
        </div>
      </div>

      {/* Content section */}
      <div className="grid grid-cols-1 pt-2 p-4 gap-4">
        {/* Liquidated debt value */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Liquidated Debt</p>
          <div className="flex items-center">
            <h3 className="text-3xl font-bold">
              {formatPrice(trove.mainValue)}
            </h3>
            <span className="ml-2 text-green-400 text-lg">
              <TokenIcon assetSymbol={trove.assetType} className="w-7 h-7 relative top-0" />
            </span>
          </div>
        </div>

        {/* Essential metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          dateInfo={{
            prefix: "Liquidated",
            date: formatDate(trove.activity.closed || trove.activity.created),
            suffix: `${trove.activity.lifetimeDays} days`
          }}
        />
      </div>
    </div>
  );
}

export function SimplifiedTroveCard({ trove, showViewButton = false, collateralAtLiquidation }: SimplifiedTroveCardProps) {
  if (trove.status === "liquidated") {
    return <SimplifiedLiquidatedTroveCard 
      trove={trove} 
      showViewButton={showViewButton} 
      collateralAtLiquidation={collateralAtLiquidation}
    />;
  }

  if (trove.status === "open") {
    return <SimplifiedOpenTroveCard trove={trove} showViewButton={showViewButton} />;
  }

  return <SimplifiedClosedTroveCard trove={trove} showViewButton={showViewButton} />;
}