"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { TroveSummary } from "@/types/api/trove";
import {
  DebtInFrontCalculator,
  DebtInFrontResult,
  TroveWithCalculatedDebt,
} from "@/lib/utils/debt-in-front-calculator";
import { InterestCalculator } from "@/lib/utils/interest-calculator";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";
import { Icon } from "@/components/icons/icon";
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  BringToFront,
  ShieldEllipsis,
  RotateCw,
  BetweenHorizontalStart,
} from "lucide-react";
import Link from "next/link";

interface DebtInFrontDisplayProps {
  trove: TroveSummary;
  className?: string;
  showAsButton?: boolean;
  autoCalculate?: boolean;
  onCalculated?: (result: DebtInFrontResult) => void;
}

export function DebtInFrontDisplay({
  trove,
  className = "",
  showAsButton = true,
  autoCalculate = false,
  onCalculated,
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
      trove.batch.manager || undefined,
    );

    return {
      recordedDebt,
      accruedInterest: interestInfo.accruedInterest,
      managementFees: interestInfo.accruedManagementFees || 0,
      totalDebt: interestInfo.entireDebt,
      interestRate: trove.metrics.interestRate,
    };
  }, [trove]);

  const calculateDebtInFront = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await calculator.calculateDebtInFront(trove);
      setDebtData(result);
      if (!autoCalculate) {
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
  }, [trove, calculator, autoCalculate, onCalculated]);

  // Auto-calculate on mount if requested
  useEffect(() => {
    if (autoCalculate && !debtData && !isLoading) {
      calculateDebtInFront();
    }
  }, [autoCalculate, debtData, isLoading, calculateDebtInFront]);

  // Common display component for debt and position info
  const renderDebtPositionInfo = () => {
    if (isLoading) {
      return "Calculating...";
    }

    if (!debtData) {
      return "Calculate Position";
    }

    return (
      <div className="flex items-center">
        <div className="flex items-center gap-1">
          <span className="text-slate-600 dark:text-slate-500">Debt in front</span>
          <span className="font-bold">{calculator.formatDebtAmount(debtData.debtInFront)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              calculateDebtInFront();
            }}
            disabled={isLoading}
            className="ml-1 p-0.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RotateCw className={`h-2.5 w-2.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    );
  };

  const renderTroveTable = (troves: TroveWithCalculatedDebt[], troveBehind?: TroveWithCalculatedDebt) => {
    const allTroves = [...troves];

    if (troves.length === 0 && !troveBehind) {
      return <p className="text-sm text-slate-600 dark:text-slate-400 italic">No other troves found</p>;
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

      [...highRiskTroves, ...nearbyTroves].forEach((t) => {
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
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-2 py-1.5 text-left">#</th>
              <th className="px-2 py-1.5 text-left">
                <span className=" inline-flex items-center gap-1">
                  <Icon name="trove-id" size={12} className="inline" />
                </span>
              </th>
              <th className="px-2 py-1.5 text-left">
                <span className=" inline-flex items-center gap-1">
                  <Icon name="user" size={12} className="inline" />
                </span>
              </th>
              <th className="px-2 py-1.5 text-right">Interest Rate</th>
              <th className="px-2 py-1.5 text-right">Debt</th>
            </tr>
          </thead>
          <tbody>
            {trovesToDisplay.map((item, index) => {
              const actualPosition = allTroves.findIndex((t) => t.trove.id === item.trove.id) + 1;
              const prevItem = index > 0 ? trovesToDisplay[index - 1] : null;
              const prevPosition = prevItem ? allTroves.findIndex((t) => t.trove.id === prevItem.trove.id) + 1 : 0;

              // Check if there's a gap between positions (hidden troves)
              const shouldShowHiddenIndicator = !showAllTroves && prevItem && actualPosition - prevPosition > 1;
              const hiddenBetween = shouldShowHiddenIndicator ? actualPosition - prevPosition - 1 : 0;

              return (
                <React.Fragment key={item.trove.id}>
                  {shouldShowHiddenIndicator && (
                    <tr className="bg-slate-950">
                      <td colSpan={5} className="px-2 py-2">
                        <button
                          onClick={() => setShowAllTroves(true)}
                          className="text-xs text-blue-200 hover:text-white transition-colors cursor-pointer rounded px-1.5 py-0.25 bg-blue-600"
                        >
                          +{hiddenBetween} more Trove{hiddenBetween > 1 ? "s" : ""}
                        </button>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-200 dark:hover:bg-slate-900 transition-colors">
                    <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">{actualPosition}</td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/trove/${item.trove.collateralType}/${item.trove.id}`}
                        className="text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-400 inline-flex items-center gap-1"
                      >
                        {item.trove.id ? `${item.trove.id.substring(0, 8)}...` : "n/a"}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">
                      {item.trove.owner
                        ? item.trove.ownerEns || `${item.trove.owner.slice(0, 6)}...${item.trove.owner.slice(-4)}`
                        : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-right">{item.trove.metrics.interestRate.toFixed(2)}%</td>
                    <td className="px-2 py-1.5 text-right font-semibold group relative">
                      {formatPrice(item.totalDebt)}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Current trove (this trove) */}
            <tr>
              <td className="px-2 py-1.5">
                <span className="text-white font-extrabold flex items-center">
                  <ChevronRight className="h-3 w-3 -ml-3" /> {allTroves.length + 1}
                </span>
              </td>
              <td className="px-2 py-1.5">
                <span className="text-white font-extrabold">{trove.id ? `${trove.id.substring(0, 8)}...` : "n/a"}</span>
              </td>
              <td className="px-2 py-1.5">
                <span className="text-white font-extrabold">
                  {trove.owner ? trove.ownerEns || `${trove.owner.slice(0, 6)}...${trove.owner.slice(-4)}` : "-"}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right">
                <span className="text-white font-extrabold">{currentTroveCalculated.interestRate.toFixed(2)}%</span>
              </td>
              <td className="px-2 py-1.5 text-right font-semibold group relative">
                <span className="text-white font-extrabold">{formatPrice(currentTroveCalculated.totalDebt)}</span>
              </td>
            </tr>

            {/* Trove behind (next in line) */}
            {troveBehind && (
              <tr className="hover:bg-slate-50 hover:bg-slate-900 transition-colors">
                <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">{allTroves.length + 2}</td>
                <td className="px-2 py-1.5">
                  <Link
                    href={`/trove/${troveBehind.trove.collateralType}/${troveBehind.trove.id}`}
                    className="text-slate-600 dark:text-slate-500 hover:text-blue-600 inline-flex items-center gap-1"
                  >
                    {troveBehind.trove.id ? `${troveBehind.trove.id.substring(0, 8)}...` : "n/a"}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">
                  {troveBehind.trove.owner
                    ? troveBehind.trove.ownerEns ||
                      `${troveBehind.trove.owner.slice(0, 6)}...${troveBehind.trove.owner.slice(-4)}`
                    : "-"}
                </td>
                <td className="px-2 py-1.5 text-right">{troveBehind.trove.metrics.interestRate.toFixed(2)}%</td>
                <td className="px-2 py-1.5 text-right font-semibold group relative">
                  {formatPrice(troveBehind.totalDebt)}
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
          <span className="text-sm text-slate-600 dark:text-slate-400">Calculating debt position...</span>
        </div>
      );
    }

    if (error) {
      return <div className="text-sm text-red-500">Error: {error}</div>;
    }

    if (!debtData) {
      return null;
    }

    return (
      <div className="space-y-3">
        {/* Trove Table - Always show when expanded */}
        <div>{renderTroveTable(debtData.troveDetails, debtData.troveBehind)}</div>

        {/* Information Note */}
        <div className="py-2 text-xs text-slate-600 dark:text-slate-400">
          {showAllTroves && debtData && debtData.troveDetails.length > 8 && (
            <button
              onClick={() => setShowAllTroves(false)}
              className="text-xs text-blue-200 hover:text-white transition-colors cursor-pointer rounded px-1.5 py-0.25 bg-blue-600"
            >
              Show less
            </button>
          )}
        </div>
      </div>
    );
  };

  // Show button when not expanded (either before or after calculation)
  if (showAsButton && !isExpanded) {
    return (
      <div
        className={`w-full flex items-center gap-2 text-sm font-medium rounded text-slate-700 dark:text-slate-300 ${className}`}
      >
        <div className="flex-1 inline-flex items-center gap-2">
          <button
            onClick={debtData ? () => setIsExpanded(true) : calculateDebtInFront}
            disabled={isLoading}
            className="py-1 px-2 flex gap-1 items-center cursor-pointer bg-slate-50 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={debtData ? "Show details" : "Calculate position"}
          >
            <BetweenHorizontalStart className="h-4 w-4" />
            {debtData ? debtData.trovesAhead + 1 : "?"}
          </button>
          {renderDebtPositionInfo()}
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Button/Header - always visible */}
      <div
        className={`w-full flex items-center gap-2 text-sm font-medium rounded bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 ${className}`}
      >
        <div className="flex-1 inline-flex items-center gap-2">
          <button
            onClick={
              isExpanded ? () => setIsExpanded(false) : debtData ? () => setIsExpanded(true) : calculateDebtInFront
            }
            disabled={isLoading}
            className="py-1 px-2 flex gap-1 items-center cursor-pointer hover:text-blue-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isExpanded ? "Hide details" : debtData ? "Show details" : "Calculate position"}
          >
            <BetweenHorizontalStart className={`h-4 w-4`} />
            {debtData ? debtData.trovesAhead + 1 : "?"}
          </button>
          {renderDebtPositionInfo()}
        </div>
        <button
          onClick={
            isExpanded ? () => setIsExpanded(false) : debtData ? () => setIsExpanded(true) : calculateDebtInFront
          }
          disabled={isLoading}
          className="py-1 px-2 flex gap-1 items-center cursor-pointer rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={isExpanded ? "Hide details" : debtData ? "Show details" : "Calculate position"}
        >
          <X className={`h-4 w-4`} />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && <div className="p-2 rounded-b-lg bg-slate-950">{renderContent()}</div>}
    </div>
  );
}
