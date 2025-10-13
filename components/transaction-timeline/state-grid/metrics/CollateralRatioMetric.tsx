"use client";

import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";

interface CollateralRatioMetricProps {
  before: number;
  after: number;
  afterDebt: number;
  isCloseTrove: boolean;
}

export function CollateralRatioMetric({ before, after, afterDebt, isCloseTrove }: CollateralRatioMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  const hasChange = before != 0 && before !== after;

  // Only highlight when hover is enabled
  const isBeforeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collRatio", "before");
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collRatio", "after");
  return (
    <StateMetric label="Collateral Ratio">
      <StateTransition>
        {hasChange && (
          <>
            <span
              className={`font-bold text-slate-400 dark:text-slate-600 ${hoverEnabled ? "cursor-pointer" : ""} ${
                isBeforeHighlighted
                  ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                  : ""
              }`}
              onMouseEnter={hoverEnabled ? () => setHoveredValue({ type: "collRatio", state: "before", value: before }) : undefined}
              onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
            >
              {before.toFixed(2)}
              <span className="ml-0.5">%</span>
            </span>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <span
            className={`text-sm font-bold text-slate-600 dark:text-slate-300 ${hoverEnabled && afterDebt !== 0 ? "cursor-pointer" : ""} ${
              isAfterHighlighted
                ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                : ""
            }`}
            onMouseEnter={
              hoverEnabled && afterDebt !== 0 ? () => setHoveredValue({ type: "collRatio", state: "after", value: after }) : undefined
            }
            onMouseLeave={hoverEnabled && afterDebt !== 0 ? () => setHoveredValue(null) : undefined}
          >
            {afterDebt === 0 ? (
              <span className="text-slate-500">N/A</span>
            ) : (
              <>
                {after.toFixed(2)}
                <span className="ml-0.5">%</span>
              </>
            )}
          </span>
        )}
      </StateTransition>
    </StateMetric>
  );
}
