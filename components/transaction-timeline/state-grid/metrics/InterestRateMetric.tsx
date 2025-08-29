'use client';

import { StateMetric } from "../components/StateMetric";
import {
  StateTransition,
  TransitionArrow,
} from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";

interface InterestRateMetricProps {
  before?: number;
  after: number;
  isCloseTrove: boolean;
}

export function InterestRateMetric({
  before,
  after,
  isCloseTrove,
}: InterestRateMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  const hasChange = before && before !== after;
  
  // Only highlight when hover is enabled
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, 'interestRate', 'after');
  return (
    <StateMetric label="Interest Rate">
      <StateTransition>
        {hasChange && (
          <>
            <div className="text-slate-600">
              {before}<span className="ml-0.5">%</span>
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <span 
            className={`text-sm font-semibold text-white ${hoverEnabled ? 'cursor-pointer' : ''} transition-all ${isAfterHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
            onMouseEnter={hoverEnabled ? () => setHoveredValue({ type: 'interestRate', state: 'after', value: after }) : undefined}
            onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
          >
            {after}<span className="ml-0.5">%</span>
          </span>
        )}
      </StateTransition>
    </StateMetric>
  );
}
