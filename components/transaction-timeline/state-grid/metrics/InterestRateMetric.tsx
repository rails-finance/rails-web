"use client";

import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";

interface InterestRateMetricProps {
  before: number;
  after: number;
  isCloseTrove: boolean;
}

export function InterestRateMetric({ before, after, isCloseTrove }: InterestRateMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  const hasBeforeValue = before > 0;
  const hasAfterValue = after > 0;
  const hasChange = hasBeforeValue && before !== after;

  // Only highlight when hover is enabled
  const isBeforeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "interestRate", "before");
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "interestRate", "after");
  return (
    <StateMetric label="Interest Rate">
      <StateTransition>
        {hasChange && (
          <>
            <div
              className={`font-bold text-slate-400 dark:text-slate-600 ${hoverEnabled ? "cursor-pointer" : ""} ${
                isBeforeHighlighted
                  ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                  : ""
              }`}
              onMouseEnter={
                hoverEnabled ? () => setHoveredValue({ type: "interestRate", state: "before", value: before }) : undefined
              }
              onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
            >
              {before.toFixed(1)}
              <span className="ml-0.5">%</span>
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : !hasAfterValue ? (
          <div className="text-sm font-bold text-slate-400 dark:text-slate-600">N/A</div>
        ) : (
          <span
            className={`text-sm font-bold text-slate-600 dark:text-slate-300 ${hoverEnabled ? "cursor-pointer" : ""} ${
              isAfterHighlighted
                ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                : ""
            }`}
            onMouseEnter={
              hoverEnabled ? () => setHoveredValue({ type: "interestRate", state: "after", value: after }) : undefined
            }
            onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
          >
            {after.toFixed(1)}
            <span className="ml-0.5">%</span>
          </span>
        )}
      </StateTransition>
    </StateMetric>
  );
}
