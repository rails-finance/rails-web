"use client";

import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";

interface CollateralRatioMetricProps {
  before: number;
  after: number;
  isCloseTrove: boolean;
}

export function CollateralRatioMetric({ before, after, isCloseTrove }: CollateralRatioMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  const hasChange = before != 0 && before !== after;

  // Only highlight when hover is enabled
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collRatio", "after");
  return (
    <StateMetric label="Collateral Ratio">
      <StateTransition>
        {hasChange && (
          <>
            <div className="text-slate-600">
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
            className={`text-sm font-semibold text-slate-900 dark:text-white ${hoverEnabled ? "cursor-pointer" : ""} transition-all ${
              isAfterHighlighted ? "-mx-1 px-1 -my-0.5 py-0.5 bg-blue-200 dark:bg-blue-900 rounded" : ""
            }`}
            onMouseEnter={
              hoverEnabled ? () => setHoveredValue({ type: "collRatio", state: "after", value: after }) : undefined
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
