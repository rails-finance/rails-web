"use client";

import { useMemo } from "react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveCardHeader } from "./components/TroveCardHeader";
import { TroveData } from "@/types/api/trove";
import { getBatchManagerInfo } from "@/lib/utils/batch-manager-utils";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { InterestCalculator } from "@/lib/utils/interest-calculator";
import { Zap, ArrowRight, Users, ZapOff, Triangle } from "lucide-react";

interface CompactTroveTableProps {
  troves: TroveData[];
  showViewButton?: boolean;
}

interface CompactTroveRowProps {
  trove: TroveData;
  showViewButton?: boolean;
}

function CompactTroveRow({ trove, showViewButton = false }: CompactTroveRowProps) {
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
  
  // Determine values based on trove status
  const debtValue = trove.status === "closed" ? trove.peakValue : debtWithInterest;

  // Calculate current collateral ratio for open troves
  const currentCollateralRatio = trove.status === "open" && interestInfo && trove.backedBy.valueUsd > 0 
    ? ((trove.backedBy.valueUsd / debtWithInterest) * 100).toFixed(1)
    : trove.metrics.collateralRatio;

  return (
    <tr className={`${trove.status === "closed" ? "bg-slate-700" : "bg-slate-900"} border-b-10 border-t-10 border-slate-800`}>
      {/* Protocol */}
      <td className="pXx-4 pXy-3 bg-slate-800 max-w-[20px] pr-2">
        <TroveCardHeader status={trove.status} assetType={trove.assetType} isDelegated={trove.batchMembership?.isMember} compact={true} />
      </td>

      {/* Status */}
      <td className="pXx-4 pXy-3">
        {trove.status === "open" ? (
          <span className="flex items-center px-1 justify-center py-0.5 bg-green-900 ml-2 text-green-400 rounded-xs w-[30px]">
            <Zap className="w-3 h-3" />
          </span>
        ) : trove.status === "closed" ? (
          <span className="flex items-center px-1 justify-center py-0.5 bg-slate-800 ml-2 text-slate-400 rounded-xs w-[30px]">
            <ZapOff className="w-3 h-3" />
          </span>
        ) : (
          <span className="flex items-center px-2 py-0.5 bg-red-900 text-red-400 rounded-xs">
            <Triangle className="w-3 h-3" />
          </span>
        )}
      </td>

      {/* Debt */}
      <td className="pXx-4 pXy-3 ">
        <div className="flex items-center gap-1">
          {trove.status === "closed" && (
            <span className="text-xs text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-fold-vertical w-3 h-3">
              <path d="M 12 22 L 12 6"></path>
              <path d="M 4 2 L 2 2"></path>
              <path d="M 10 2 L 8 2"></path>
              <path d="M 16 2 L 14 2"></path>
              <path d="M 22 2 L 20 2"></path>
              <path d="M 15 9 L 12 6 L 9 9"></path>
            </svg></span>
          )}
          <span className="text-sm font-medium text-white">
            {formatPrice(debtValue)}
          </span>
          <TokenIcon assetSymbol={trove.assetType} className="w-4 h-4" />
        </div>
      </td>

      {/* Collateral */}
      <td className="pXx-4 pXy-3 ">
        {trove.status === "open" ? (
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-white">
              {formatPrice(trove.backedBy.amount)}
            </span>
            <TokenIcon assetSymbol={trove.collateralType} className="w-4 h-4" />
            <span className="text-xs text-green-400 border border-green-400 rounded px-1 ml-1">
              {formatUsdValue(trove.backedBy.valueUsd)}
            </span>
          </div>
        ) : (
          <span className="text-sm text-slate-500">—</span>
        )}
      </td>

      {/* Collateral Ratio */}
      <td className="pXx-4 pXy-3 ">
        {trove.status === "open" ? (
          <span className="text-sm font-medium text-white">
            {currentCollateralRatio}%
          </span>
        ) : (
          <span className="text-sm text-slate-500">—</span>
        )}
      </td>

      {/* Interest Rate */}
      <td className="pXx-4 pXy-3 ">
        {trove.status === "open" ? (
          <div className="flex items-center gap-1">
            {trove.batchMembership.isMember && (
              <span className="flex items-center px-1 py-0.5 bg-blue-900 text-blue-400 rounded-xs">
                <Users className="w-3 h-3" />
              </span>
            )}
            <span className="text-sm font-medium text-white">
              {trove.metrics.interestRate}%
            </span>
          </div>
        ) : (
          <span className="text-sm text-slate-500">—</span>
        )}
      </td>

      {/* Actions */}
      {showViewButton && (
        <td className="pXx-4 pXy-3 ">
          <div className="flex justify-end">
            <button className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1">
              <span className="hidden">View Trove</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export function CompactTroveTable({ troves, showViewButton = false }: CompactTroveTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-800 border-b border-slate-600">
            <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium max-w-[30px] ">Protocol</th>
            <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium max-w-[20px] ">Status</th>
            <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium">Debt</th>
            <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium">Collateral</th>
            <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium"><span className="hidden lg:inline">Collateral </span>Ratio</th>
            <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium">Interest Rate</th>
            {showViewButton && (
              <th className="pXx-4 pXy-3 text-xs text-slate-400 font-medium text-right ">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {troves.map((trove) => (
            <CompactTroveRow key={trove.troveId} trove={trove} showViewButton={showViewButton} />
          ))}
        </tbody>
      </table>
    </div>
  );
}