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
  const hasChange = before != 0 && before !== after;

  // Only highlight when hover is enabled
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "interestRate", "after");
  return (
    <StateMetric label="Interest Rate">
      <StateTransition>
        {hasChange && (
          <>
            <div className="font-bold text-slate-400 dark:text-slate-600">
              {before.toFixed(1)}
              <span className="ml-0.5">%</span>
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <span
            className={`text-sm font-bold text-slate-600 milodon dark:text-slate-300 ${hoverEnabled ? "cursor-pointer" : ""} ${
              isAfterHighlighted
                ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
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
