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
  upfrontFee?: number;
}

export function DebtMetric({ assetType, before, after, isCloseTrove, upfrontFee }: DebtMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  // For closeTrove, always show transition even if before is 0
  const hasChange = isCloseTrove ? (before !== after) : (before != 0 && before !== after);

  // Only highlight when hover is enabled
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "debt", "after");
  const isFeeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "upfrontFee", "fee");
  return (
    <StateMetric label="Debt" icon={<TokenIcon assetSymbol={assetType} className="mr-2 w-5 h-5 text-green-400" />}>
      <div>
        <StateTransition>
          {hasChange && (
            <>
              <div className="font-bold text-slate-300 dark:text-slate-600">{toLocaleStringHelper(before)}</div>
              <TransitionArrow />
            </>
          )}
          <div className="flex">
            <div className="flex flex-row">
              {isCloseTrove ? (
                <ClosedStateLabel />
              ) : (
                <div
                  className={`text-sm font-bold text-slate-800 milodon dark:text-slate-300 ${hoverEnabled ? "cursor-pointer" : ""} ${
                    isAfterHighlighted ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse' : ""
                  }`}
                  onMouseEnter={
                    hoverEnabled ? () => setHoveredValue({ type: "debt", state: "after", value: after }) : undefined
                  }
                  onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
                >
                  {toLocaleStringHelper(after)}
                </div>
              )}
            </div>
          </div>
        </StateTransition>
        {upfrontFee !== undefined && upfrontFee > 0 && (
          <div className="text-xs text-slate-500 mt-0.5 block">
            <span
              className={`${hoverEnabled ? "cursor-pointer" : ""} ${
                isFeeHighlighted ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse' : ""
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
            <span className="ml-1">fee</span>
          </div>
        )}
      </div>
    </StateMetric>
  );
}
