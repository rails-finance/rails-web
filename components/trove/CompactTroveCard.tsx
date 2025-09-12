"use client";

import { useMemo } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveData } from "@/types/api/trove";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { InterestCalculator } from "@/lib/utils/interest-calculator";
import { Square } from "lucide-react";

interface CompactTroveCardProps {
  trove: TroveData;
  showViewButton?: boolean;
}

export function CompactTroveCard({ trove, showViewButton = false }: CompactTroveCardProps) {
  const calculator = useMemo(() => new InterestCalculator(), []);
  
  const batchManagerInfo = useMemo(() => {
    if (trove.batchMembership?.batchManager) {
      return getBatchManagerInfo(trove.batchMembership.batchManager);
    }
    return undefined;
  }, [trove.batchMembership?.batchManager]);

  // Generate interest info for open troves
  const interestInfo = useMemo(() => {
    if (trove.status !== "open" || trove.interestInfo) {
      return trove.interestInfo;
    }
    
    // Mock data for demonstration - in production this should come from the API
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

  // Calculate display value with interest for open troves
  const debtWithInterest = trove.status === "open" && interestInfo ? interestInfo.entireDebt : trove.mainValue;
  
  // Determine main value based on trove status
  const mainValue = trove.status === "closed" ? trove.peakValue : debtWithInterest;
  const mainValueLabel = trove.status === "closed" ? "Debt at peak" : "Debt";
  
  // Determine collateral value and label based on trove status
  const collateralValue = trove.status === "closed" ? trove.backedBy.peakAmount : trove.backedBy.amount;
  const collateralLabel = trove.status === "closed" ? "Highest recorded collateral" : "Collateral";
  const collateralUsd = trove.status === "closed" ? null : trove.backedBy.valueUsd;

  // Calculate current collateral ratio for open troves
  const currentCollateralRatio = trove.status === "open" && interestInfo && trove.backedBy.valueUsd > 0 
    ? ((trove.backedBy.valueUsd / debtWithInterest) * 100).toFixed(1)
    : trove.metrics.collateralRatio;

  return (
    <div className={`relative rounded-lg text-slate-500 ${
      trove.status === "closed" 
        ? "bg-slate-700" 
        : "bg-slate-900"
    }`}>
        {/* Header Row */}
        <div className="flex items-center justify-between">
          {/* Protocol Icon */}
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              <TroveCardHeader status={trove.status} assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} />
            </div>
            
            {/* Status Pill */}
            {trove.status === "open" ? (
              <span className="text-xs font-semibold px-2 py-0.5 bg-green-900 text-green-400 rounded-xs">ACTIVE</span>
            ) : trove.status === "closed" ? (
              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-400 rounded-xs">CLOSED</span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 bg-red-900 text-red-400 rounded-xs">LIQUIDATED</span>
            )}
          </div>

          {/* Delegated Icon for open delegated troves */}
          {trove.status === "open" && trove.batchMembership?.isMember && (
            <div className="flex items-center">
              <Square className="w-3 h-3 text-blue-400 fill-current" />
            </div>
          )}
        </div>

        {/* Content Grid */}
        <div className="p-3">
        <div className="grid grid-cols-2 gap-4">
          {/* Left Column */}
          <div className="space-y-3">
            {/* Main Value (Debt) */}
            <div>
              <p className="text-xs text-slate-400 mb-1">{mainValueLabel}</p>
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-white">
                  {formatPrice(mainValue)}
                </span>
                <TokenIcon assetSymbol={trove.assetType} className="w-4 h-4" />
              </div>
            </div>

            {/* Collateral */}
            <div>
              <p className="text-xs text-slate-400 mb-1">{collateralLabel}</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-white">
                  {formatPrice(collateralValue)}
                </span>
                <TokenIcon assetSymbol={trove.collateralType} className="w-4 h-4" />
                {collateralUsd && (
                  <span className="text-xs text-green-400 border border-green-400 rounded px-1 ml-1">
                    {formatUsdValue(collateralUsd)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Only for Open Troves */}
          {trove.status === "open" && (
            <div className="space-y-3">
              {/* Collateral Ratio */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Collateral Ratio</p>
                <span className="text-sm font-medium text-white">
                  {currentCollateralRatio}%
                </span>
              </div>

              {/* Interest Rate */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  {trove.batchMembership.isMember && (
                    <span className="text-xs font-semibold px-1 py-0.5 bg-blue-900 text-blue-400 rounded-xs">DEL</span>
                  )}
                  <p className="text-xs text-slate-400">Interest Rate</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-white">
                    {trove.metrics.interestRate}%
                  </span>
                  {trove.batchMembership.isMember && (
                    <span className="text-xs text-slate-500">
                      +{trove.batchMembership.managementFeeRate}%
                    </span>
                  )}
                </div>
                {trove.batchMembership.isMember && batchManagerInfo && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {batchManagerInfo.name}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* View Button */}
        {showViewButton && (
          <div className="mt-3 pt-3 flex justify-end">
            <button className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 cursor-pointer text-white rounded transition-colors">
              View Trove
            </button>
          </div>
        )}
        </div>
    </div>
  );
}