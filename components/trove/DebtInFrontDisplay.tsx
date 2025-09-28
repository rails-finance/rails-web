"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { TroveSummary } from "@/types/api/trove";
import { DebtInFrontCalculator, DebtInFrontResult, TroveWithCalculatedDebt } from "@/lib/utils/debt-in-front-calculator";
import { InterestCalculator } from "@/lib/utils/interest-calculator";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { Icon } from "@/components/icons/icon";
import { BringToFront, SquareStack, ShieldEllipsis, RotateCw } from "lucide-react";
import Link from "next/link";

interface DebtInFrontDisplayProps {
  trove: TroveSummary;
  className?: string;
  showAsButton?: boolean;
  autoCalculate?: boolean;
  onCalculated?: (result: DebtInFrontResult) => void;
  compactView?: boolean;
}

export function DebtInFrontDisplay({
  trove,
  className = "",
  showAsButton = true,
  autoCalculate = false,
  onCalculated,
  compactView = false
}: DebtInFrontDisplayProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [debtData, setDebtData] = useState<DebtInFrontResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllTroves, setShowAllTroves] = useState(false);

  const calculator = useMemo(() => new DebtInFrontCalculator(), []);

  // Calculate current trove's debt details
  const currentTroveCalculated = useMemo(() => {
    const recordedDebt = parseFloat(trove.debt.currentRaw) / 1e18;
    const lastUpdateTime = trove.activity.lastActivityAt;
    const interestCalc = new InterestCalculator();

    const interestInfo = interestCalc.generateInterestInfo(
      recordedDebt,
      trove.metrics.interestRate,
      lastUpdateTime,
      trove.batch.isMember,
      trove.batch.managementFee,
      trove.batch.manager || undefined
    );

    return {
      recordedDebt,
      accruedInterest: interestInfo.accruedInterest,
      managementFees: interestInfo.accruedManagementFees || 0,
      totalDebt: interestInfo.entireDebt,
      interestRate: trove.metrics.interestRate
    };
  }, [trove]);

  const calculateDebtInFront = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await calculator.calculateDebtInFront(trove);
      setDebtData(result);
      if (!autoCalculate && !compactView) {
        setIsExpanded(true);
      }
      if (onCalculated) {
        onCalculated(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate debt in front");
      console.error("Error calculating debt in front:", err);
    } finally {
      setIsLoading(false);
    }
  }, [trove, calculator, autoCalculate, compactView, onCalculated]);


  // Auto-calculate on mount if requested
  useEffect(() => {
    if (autoCalculate && !debtData && !isLoading) {
      calculateDebtInFront();
    }
  }, [autoCalculate, debtData, isLoading, calculateDebtInFront]);

  const renderTroveTable = (troves: TroveWithCalculatedDebt[], troveBehind?: TroveWithCalculatedDebt) => {
    const allTroves = [...troves];

    if (troves.length === 0 && !troveBehind) {
      return (
        <p className="text-sm text-slate-400 italic">No other troves found</p>
      );
    }

    // Determine which troves to show
    let trovesToDisplay = allTroves;
    let hiddenCount = 0;
    let currentPosition = allTroves.length;

    if (!showAllTroves && allTroves.length > 8) {
      // Show strategic subset:
      // - Top 3 highest risk (lowest rates)
      const highRiskTroves = allTroves.slice(0, 3);

      // - 2-3 troves immediately before current position
      const startNearby = Math.max(0, currentPosition - 3);
      const endNearby = currentPosition;
      const nearbyTroves = allTroves.slice(startNearby, endNearby);

      // Combine and deduplicate
      const uniqueTroveIds = new Set<string>();
      trovesToDisplay = [];

      [...highRiskTroves, ...nearbyTroves].forEach(t => {
        if (!uniqueTroveIds.has(t.trove.id)) {
          uniqueTroveIds.add(t.trove.id);
          trovesToDisplay.push(t);
        }
      });

      // Sort by interest rate
      trovesToDisplay.sort((a, b) => {
        const rateDiff = a.trove.metrics.interestRate - b.trove.metrics.interestRate;
        if (Math.abs(rateDiff) < 0.0001) {
          return a.trove.id.localeCompare(b.trove.id);
        }
        return rateDiff;
      });

      hiddenCount = allTroves.length - trovesToDisplay.length;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-2 py-1.5 text-left">Position</th>
              <th className="px-2 py-1.5 text-left flex align-center gap-1"><Icon name="trove-id" size={12} className="inline" />Trove ID</th>
              <th className="px-2 py-1.5 text-left">Owner</th>
              <th className="px-2 py-1.5 text-right">Interest Rate</th>
              <th className="px-2 py-1.5 text-right">Total Debt</th>
            </tr>
          </thead>
          <tbody>
            {trovesToDisplay.map((item, index) => {
              const actualPosition = allTroves.findIndex(t => t.trove.id === item.trove.id) + 1;
              const prevItem = index > 0 ? trovesToDisplay[index - 1] : null;
              const prevPosition = prevItem ? allTroves.findIndex(t => t.trove.id === prevItem.trove.id) + 1 : 0;

              // Check if there's a gap between positions (hidden troves)
              const shouldShowHiddenIndicator = !showAllTroves && prevItem && (actualPosition - prevPosition > 1);
              const hiddenBetween = shouldShowHiddenIndicator ? (actualPosition - prevPosition - 1) : 0;

              return (
                <>
                  {shouldShowHiddenIndicator && (
                    <tr key={`hidden-${index}`} className="bg-slate-900/50">
                      <td colSpan={5} className="px-2 py-2 text-center">
                        <button
                          onClick={() => setShowAllTroves(true)}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          ... {hiddenBetween} more trove{hiddenBetween > 1 ? 's' : ''} ...
                        </button>
                      </td>
                    </tr>
                  )}
                  <tr
                    key={item.trove.id}
                    className="hover:bg-slate-50 hover:bg-slate-900 transition-colors"
                  >
                    <td className="px-2 py-1.5 text-slate-400">{actualPosition}</td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/trove/${item.trove.collateralType}/${item.trove.id}`}
                        className="text-blue-500 hover:text-blue-600 font-mono inline-flex items-center gap-1"
                      >
                        {item.trove.id ? `${item.trove.id.substring(0, 8)}...` : "n/a"}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-slate-400">
                      {item.trove.owner ?
                        (item.trove.ownerEns || `${item.trove.owner.slice(0, 6)}...${item.trove.owner.slice(-4)}`) :
                        '-'
                      }
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {item.trove.metrics.interestRate.toFixed(2)}%
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold group relative">
                      <span className="cursor-help">
                        {formatPrice(item.totalDebt)}
                      </span>
                      <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block bg-slate-800 border border-slate-700 rounded p-2 text-xs whitespace-nowrap">
                        <div className="text-slate-400">Principal: {formatPrice(item.recordedDebt)}</div>
                        <div className="text-orange-400">Interest: +{formatPrice(item.accruedInterest)}</div>
                        {item.managementFees > 0 && (
                          <div className="text-purple-400">Mgmt Fee: +{formatPrice(item.managementFees)}</div>
                        )}
                      </div>
                    </td>
                  </tr>
                </>
              );
            }
            )}

            {/* Current trove (this trove) */}
            <tr className="bg-green-950 text-green-400">
              <td className="px-2 py-1.5">{allTroves.length + 1}</td>
              <td className="px-2 py-1.5">
                <Link
                  href={`/trove/${trove.collateralType}/${trove.id}`}
                  className="text-green-400 hover:text-green-300 font-mono inline-flex items-center gap-1"
                >
                  {trove.id ? `${trove.id.substring(0, 8)}...` : "n/a"}
                </Link>
              </td>
              <td className="px-2 py-1.5 font-mono">
                {trove.owner ?
                  (trove.ownerEns || `${trove.owner.slice(0, 6)}...${trove.owner.slice(-4)}`) :
                  '-'
                }
              </td>
              <td className="px-2 py-1.5 text-right font-mono">
                {currentTroveCalculated.interestRate.toFixed(2)}%
              </td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold group relative">
                <span className="cursor-help">
                  {formatPrice(currentTroveCalculated.totalDebt)}
                </span>
                <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block bg-slate-800 border border-slate-700 rounded p-2 text-xs whitespace-nowrap">
                  <div className="text-slate-400">Principal: {formatPrice(currentTroveCalculated.recordedDebt)}</div>
                  <div className="text-orange-400">Interest: +{formatPrice(currentTroveCalculated.accruedInterest)}</div>
                  {currentTroveCalculated.managementFees > 0 && (
                    <div className="text-purple-400">Mgmt Fee: +{formatPrice(currentTroveCalculated.managementFees)}</div>
                  )}
                </div>
              </td>
            </tr>

            {/* Trove behind (next in line) */}
            {troveBehind && (
              <tr className="hover:bg-slate-50 hover:bg-slate-900 transition-colors">
                <td className="px-2 py-1.5 text-slate-400">{allTroves.length + 2}</td>
                <td className="px-2 py-1.5">
                  <Link
                    href={`/trove/${troveBehind.trove.collateralType}/${troveBehind.trove.id}`}
                    className="text-blue-500 hover:text-blue-600 font-mono inline-flex items-center gap-1"
                  >
                    {troveBehind.trove.id ? `${troveBehind.trove.id.substring(0, 8)}...` : "n/a"}
                  </Link>
                </td>
                <td className="px-2 py-1.5 font-mono text-slate-400">
                  {troveBehind.trove.owner ?
                    (troveBehind.trove.ownerEns || `${troveBehind.trove.owner.slice(0, 6)}...${troveBehind.trove.owner.slice(-4)}`) :
                    '-'
                  }
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {troveBehind.trove.metrics.interestRate.toFixed(2)}%
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold group relative">
                  <span className="cursor-help">
                    {formatPrice(troveBehind.totalDebt)}
                  </span>
                  <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block bg-slate-800 border border-slate-700 rounded p-2 text-xs whitespace-nowrap">
                    <div className="text-slate-400">Principal: {formatPrice(troveBehind.recordedDebt)}</div>
                    <div className="text-orange-400">Interest: +{formatPrice(troveBehind.accruedInterest)}</div>
                    {troveBehind.managementFees > 0 && (
                      <div className="text-purple-400">Mgmt Fee: +{formatPrice(troveBehind.managementFees)}</div>
                    )}
                  </div>
                </td>
              </tr>
            )}

            
          </tbody>
        </table>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 ">
          <div className="animate-spin h-4 w-4 rounded-full" />
          <span className="text-sm text-slate-400">Calculating debt position...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-sm text-red-500">
          Error: {error}
        </div>
      );
    }

    if (!debtData) {
      return null;
    }

    return (
      <div className="space-y-3">
        {/* Trove Table - Always show when expanded */}
        <div>
          {renderTroveTable(debtData.troveDetails, debtData.troveBehind)}
        </div>

        {/* Information Note */}
        <div className="py-2 text-xs text-slate-400">
          Troves with lower interest rates are redeemed first. The debt shown above protects your position from redemptions.
          {showAllTroves && debtData && debtData.troveDetails.length > 8 && (
            <button
              onClick={() => setShowAllTroves(false)}
              className="ml-2 text-blue-400 hover:text-blue-300 transition-colors"
            >
              Show less
            </button>
          )}
        </div>

        {/* Last Updated */}
        <div className="text-xs text-slate-400 pt-2">
          <span></span>
        </div>
      </div>
    );
  };

  // Compact view - just show the summary inline
  if (compactView && debtData) {
    return (
      <div className={`flex items-center justify-between text-sm ${className}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <SquareStack className="h-4 w-4 text-slate-400" />
            <span className="text-slate-400">Debt in front:</span>
            <span className="font-mono font-bold">{calculator.formatDebtAmount(debtData.debtInFront)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Position:</span>
            <span className="font-mono">#{debtData.trovesAhead + 1}</span>
          </div>
        </div>
        <a
          href="https://docs.liquity.org/v2-faq/redemptions-and-delegation"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-600 underline whitespace-nowrap"
        >
          Learn about redemptions →
        </a>
      </div>
    );
  }

  // Loading state for compact view
  if (compactView && isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <div className="animate-spin h-4 w-4 rounded-full" />
        <span className="text-slate-400">Calculating debt position...</span>
      </div>
    );
  }

  // Show button when not expanded (either before or after calculation)
  if (showAsButton && !isExpanded) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-800 text-slate-300 ${className}`}>
        <button
          onClick={debtData ? () => setIsExpanded(true) : calculateDebtInFront}
          disabled={isLoading}
          className="flex-1 inline-flex items-center gap-2 hover:text-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <SquareStack className="h-4 w-4" />
          {isLoading ? (
            "Calculating..."
          ) : debtData ? (
            <div className="flex items-center">
                <span className="font-mono font-bold">{calculator.formatDebtAmount(debtData.debtInFront)} debt in front, position {debtData.trovesAhead + 1}</span>
            </div>
          ) : (
            "Calculate Position"
          )}
        </button>
        {debtData && (
          <>
            <span className="text-xs text-slate-500">Last updated: {debtData.lastCalculated.toLocaleTimeString()}</span>
            <button
              onClick={calculateDebtInFront}
              disabled={isLoading}
              className="cursor-pointer p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </>
        )}

      </div>
    );
  }


  return (
    <div className={`${className}`}>
      {/* Button/Header - always visible */}
      <div className={`
        w-full inline-flex items-center justify-between gap-2 px-3 py-1.5
        text-sm font-medium rounded-lg
        bg-slate-800
        text-slate-300
        ${isExpanded ? 'rounded-b-none' : ''}
      `}>
        <button
          onClick={isExpanded ? () => setIsExpanded(false) : (debtData ? () => setIsExpanded(true) : calculateDebtInFront)}
          disabled={isLoading}
          className="cursor-pointer flex-1 inline-flex items-center gap-2 hover:text-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SquareStack className="h-4 w-4" />
          {isLoading ? (
            "Calculating..."
          ) : debtData ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold">{calculator.formatDebtAmount(debtData.debtInFront)} debt in front, position {debtData.trovesAhead + 1} Last updated: {debtData.lastCalculated.toLocaleTimeString()}</span> 
              </div>
            </div>
          ) : (
            "Calculate Position"
          )}
        </button>
        <div className="flex items-center gap-2">
 
          {debtData && (
            <button
              onClick={calculateDebtInFront}
              disabled={isLoading}
              className="cursor-pointer p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {isExpanded && debtData && (
            <Icon name="chevron-up" className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 rounded-b-lg bg-slate-900 border border-t-0 border-slate-700">
          {renderContent()}
        </div>
      )}
    </div>
  );
}