"use client";

import { useMemo } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Icon } from "@/components/icons/icon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveCardFooter } from "./components/TroveCardFooter";
import { TroveData } from "@/types/api/trove";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";
import { formatDate } from "@/lib/date";
import { InterestCalculator } from "@/lib/utils/interest-calculator";

interface OpenTroveCardProps {
  trove: TroveData;
  showViewButton?: boolean;
}

export function OpenTroveCard({ trove, showViewButton = false }: OpenTroveCardProps) {
  const calculator = useMemo(() => new InterestCalculator(), []);
  
  const batchManagerInfo = useMemo(() => {
    if (trove.batchMembership?.batchManager) {
      return getBatchManagerInfo(trove.batchMembership.batchManager);
    }
    return undefined;
  }, [trove.batchMembership?.batchManager]);

  // Generate interest info if not provided by backend
  const interestInfo = useMemo(() => {
    if (trove.interestInfo) {
      return trove.interestInfo;
    }
    
    // Mock data for demonstration - in production this should come from the API
    // Using the example values from the prototype
    const mockLastUpdate = Date.now() / 1000 - (68 * 24 * 60 * 60); // 68 days ago
    // Convert from wei (18 decimals) to normal units
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
  
  // Calculate daily and annual interest cost
  const dailyInterestCost = useMemo(() => {
    if (!interestInfo) return 0;
    return (interestInfo.recordedDebt * interestInfo.annualInterestRatePercent / 100) / 365;
  }, [interestInfo]);
  
  const annualInterestCost = useMemo(() => {
    if (!interestInfo) return 0;
    return interestInfo.recordedDebt * interestInfo.annualInterestRatePercent / 100;
  }, [interestInfo]);

  return (
    <div className="rounded-lg text-slate-500 bg-slate-900 grid grid-cols-1 p-4 gap-4">
      <TroveCardHeader status="open" assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} />

      {/* Main value */}
      <div>
        <div className="text-xs font-bold text-slate-400 mb-1">
          Debt
        </div>
        <div className="flex items-center">
          <h3 className="text-3xl font-bold text-white">
            {interestInfo ? debtWithInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : trove.mainValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <span className="ml-2 text-green-400 text-lg">
            <TokenIcon assetSymbol={trove.assetType} />
          </span>
        </div>
        {/* Debt breakdown */}
        {interestInfo && (
          <div className="mt-2 text-xs text-slate-500 space-y-0.5">
            <div className="flex items-center gap-1">
              <Icon name="calculator" size={14} className="flex-shrink-0" />
              <span>{interestInfo.recordedDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + {interestInfo.accruedInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} interest</span>
            </div>
            {interestInfo.isBatchMember && interestInfo.accruedManagementFees !== undefined && interestInfo.accruedManagementFees > 0 && (
              <div className="flex justify-between">
                <span>Management fees</span>
                <span className="font-mono text-orange-400">+{interestInfo.accruedManagementFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-sm">Backed by</p>
          <div className="flex items-center">
            <span className="flex items-center">
              <p className="text-xl font-medium text-white mr-1">{trove.backedBy.amount}</p>
              <span className="flex items-center">
                <TokenIcon assetSymbol={trove.collateralType} />
              </span>
            </span>
            <div className="ml-1 flex items-center">
              <span className="text-xs flex items-center text-green-400 border border-green-400 rounded-sm px-1 py-0">
                ${trove.backedBy.valueUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm">Collateral Ratio</p>
          <p className="text-xl font-medium text-white">
            {interestInfo && trove.backedBy.valueUsd > 0 
              ? `${((trove.backedBy.valueUsd / debtWithInterest) * 100).toFixed(1)}%`
              : `${trove.metrics.collateralRatio}%`}
          </p>
        </div>
        <div>
          <p className="text-sm">Interest Rate</p>
          <div className="text-xl font-medium">
            <span className="text-white">{trove.metrics.interestRate}%</span>
          </div>
          {interestInfo && (
            <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
              <div>~{dailyInterestCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {trove.assetType}/day</div>
              <div>~{annualInterestCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {trove.assetType}/year</div>
            </div>
          )}
          {trove.batchMembership.isMember && (
            <>
              {batchManagerInfo?.website ? (
                <a 
                  href={batchManagerInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 underline underline-offset-2 block"
                >
                  {batchManagerInfo.name}
                </a>
              ) : (
                <p className="text-xs text-slate-400 mt-1">{batchManagerInfo?.name || "Batch Manager"}</p>
              )}
              <p className="text-xs text-slate-400">+ {trove.batchMembership.managementFeeRate}% mgmt fee</p>
            </>
          )}
        </div>
      </div>

      <TroveCardFooter
        trove={trove}
        showViewButton={showViewButton}
        dateText={`Opened ${formatDate(trove.activity.created)}`}
      />
    </div>
  );
}
