'use client';

import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";

interface DebtMetricProps {
  assetType: string;
  before?: number;
  after: number;
  isCloseTrove: boolean;
  upfrontFee?: number;
}

export function DebtMetric({ assetType, before, after, isCloseTrove, upfrontFee }: DebtMetricProps) {
  const { hoveredValue, setHoveredValue } = useHover();
  const hasChange = before && before !== after;
  
  const isBeforeHighlighted = shouldHighlight(hoveredValue, 'debt', 'before');
  const isAfterHighlighted = shouldHighlight(hoveredValue, 'debt', 'after');
  const isFeeHighlighted = shouldHighlight(hoveredValue, 'upfrontFee', 'fee');
  return (
    <StateMetric label="Debt" icon={<TokenIcon assetSymbol={assetType} className="mr-2 w-5 h-5 text-green-400" />}>
      <div>
        <StateTransition>
          {hasChange && (
            <>
              <div 
                className={`text-slate-600 cursor-pointer transition-all ${isBeforeHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
                onMouseEnter={() => setHoveredValue({ type: 'debt', state: 'before', value: before })}
                onMouseLeave={() => setHoveredValue(null)}
              >
                {before}
              </div>
              <TransitionArrow />
            </>
          )}
          <div className="flex">
            <div className="flex flex-row">
              {isCloseTrove ? <ClosedStateLabel /> : (
                <div 
                  className={`text-sm font-semibold text-white cursor-pointer transition-all ${isAfterHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
                  onMouseEnter={() => setHoveredValue({ type: 'debt', state: 'after', value: after })}
                  onMouseLeave={() => setHoveredValue(null)}
                >
                  {after}
                </div>
              )}
            </div>
          </div>
        </StateTransition>
        {upfrontFee !== undefined && upfrontFee > 0 && (
          <div className="">
            <span 
              className={`text-xs text-slate-500 mt-0.5 block cursor-pointer transition-all ${isFeeHighlighted ? 'underline decoration-dotted underline-offset-2' : ''}`}
              onMouseEnter={() => setHoveredValue({ type: 'upfrontFee', state: 'fee', value: upfrontFee })}
              onMouseLeave={() => setHoveredValue(null)}
            >
              {upfrontFee} fee
            </span>
          </div>
        )}
      </div>
    </StateMetric>
  );
}
