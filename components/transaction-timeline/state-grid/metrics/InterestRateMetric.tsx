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
  const { hoveredValue, setHoveredValue } = useHover();
  const hasChange = before && before !== after;
  
  const isBeforeHighlighted = shouldHighlight(hoveredValue, 'interestRate', 'before');
  const isAfterHighlighted = shouldHighlight(hoveredValue, 'interestRate', 'after');
  return (
    <StateMetric label="Interest Rate">
      <StateTransition>
        {hasChange && (
          <>
            <div 
              className={`text-slate-600 cursor-pointer transition-all ${isBeforeHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
              onMouseEnter={() => setHoveredValue({ type: 'interestRate', state: 'before', value: before })}
              onMouseLeave={() => setHoveredValue(null)}
            >
              {before}<span className="ml-0.5">%</span>
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <span 
            className={`text-sm font-semibold text-white cursor-pointer transition-all ${isAfterHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
            onMouseEnter={() => setHoveredValue({ type: 'interestRate', state: 'after', value: after })}
            onMouseLeave={() => setHoveredValue(null)}
          >
            {after}<span className="ml-0.5">%</span>
          </span>
        )}
      </StateTransition>
    </StateMetric>
  );
}
