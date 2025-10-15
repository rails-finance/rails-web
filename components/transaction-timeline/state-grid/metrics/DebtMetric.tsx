"use client";

import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";
import { toLocaleStringHelper } from "@/lib/utils/format";

interface DebtMetricProps {
  assetType: string;
  before: number;
  after: number;
  isCloseTrove: boolean;
  isLiquidation?: boolean;
  upfrontFee?: number;
  accruedInterest?: number;
  accruedManagementFees?: number;
}

export function DebtMetric({ assetType, before, after, isCloseTrove, isLiquidation = false, upfrontFee, accruedInterest, accruedManagementFees }: DebtMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  // For closeTrove, always show transition even if before is 0
  const hasChange = isCloseTrove ? before !== after : before != 0 && before !== after;

  // Only highlight when hover is enabled
  const isBeforeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "debt", "before");
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "debt", "after");
  const isFeeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "upfrontFee", "fee");
  const isInterestHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "interest", "fee");

  const totalAccruedFees = (accruedInterest || 0) + (accruedManagementFees || 0);
  return (
    <StateMetric label="Debt" icon={<TokenIcon assetSymbol={assetType} className="mr-2 w-5 h-5 text-green-600" />}>
      <div>
        <StateTransition>
          {hasChange && (
            <>
              <span
                className={`font-bold text-slate-400 dark:text-slate-600 ${hoverEnabled ? "cursor-pointer" : ""} ${
                  isBeforeHighlighted
                    ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                    : ""
                }`}
                onMouseEnter={hoverEnabled ? () => setHoveredValue({ type: "debt", state: "before", value: before }) : undefined}
                onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
              >
                {toLocaleStringHelper(before)}
              </span>
              <TransitionArrow />
            </>
          )}
          <div className="flex">
            <div className="flex flex-row">
              {isCloseTrove ? (
                <ClosedStateLabel />
              ) : (
                <div
                  className={`text-sm font-bold text-slate-600 dark:text-slate-300 ${hoverEnabled && !isLiquidation ? "cursor-pointer" : ""} ${
                    isAfterHighlighted && !isLiquidation
                      ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                      : ""
                  }`}
                  onMouseEnter={
                    hoverEnabled && !isLiquidation ? () => setHoveredValue({ type: "debt", state: "after", value: after }) : undefined
                  }
                  onMouseLeave={hoverEnabled && !isLiquidation ? () => setHoveredValue(null) : undefined}
                >
                  {toLocaleStringHelper(after)}
                </div>
              )}
            </div>
          </div>
        </StateTransition>
        {(upfrontFee !== undefined && upfrontFee > 0) || totalAccruedFees > 0.01 ? (
          <div className="text-xs text-slate-500 mt-0.5 block">
            {totalAccruedFees > 0.01 && (
              <>
                <span>incl. +</span>
                <span
                  className={`${hoverEnabled ? "cursor-pointer" : ""} ${
                    isInterestHighlighted
                      ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                      : ""
                  }`}
                  onMouseEnter={
                    hoverEnabled
                      ? () => setHoveredValue({ type: "interest", state: "fee", value: totalAccruedFees })
                      : undefined
                  }
                  onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
                >
                  {totalAccruedFees.toFixed(2)}
                </span>
                <span> interest</span>
              </>
            )}
            {upfrontFee !== undefined && upfrontFee > 0 && (
              <>
                {totalAccruedFees > 0.01 && <span> +</span>}
                <span
                  className={`${hoverEnabled ? "cursor-pointer" : ""} ${
                    isFeeHighlighted
                      ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                      : ""
                  }`}
                  onMouseEnter={
                    hoverEnabled
                      ? () => setHoveredValue({ type: "upfrontFee", state: "fee", value: upfrontFee })
                      : undefined
                  }
                  onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
                >
                  {toLocaleStringHelper(upfrontFee)}
                </span>
                <span> fee</span>
              </>
            )}
          </div>
        ) : null}
      </div>
    </StateMetric>
  );
}
