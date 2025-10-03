"use client";

import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";
import { formatUsdValue } from "@/lib/utils/format";

interface CollateralMetricProps {
  collateralType: string;
  before: number;
  after: number;
  afterInUsd: number;
  isCloseTrove: boolean;
}

export function CollateralMetric({ collateralType, before, after, afterInUsd, isCloseTrove }: CollateralMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  // For closeTrove, always show transition even if before is 0
  const hasChange = isCloseTrove ? before !== after : before != 0 && before !== after;

  // Only highlight when hover is enabled
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateral", "after");
  const isChangeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateral", "change");
  const isCollateralUsdHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateralUsd", "after");
  return (
    <StateMetric label="Collateral" icon={<TokenIcon assetSymbol={collateralType} className="mr-2 w-5 h-5" />}>
      <StateTransition>
        {hasChange && (
          <>
            <div className="flex items-center space-x-1">
              <span className="font-bold text-slate-400 dark:text-slate-600">{before}</span>
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <div className="flex items-center">
            <span
              className={`text-sm font-bold text-slate-600 milodon dark:text-slate-300 ${hoverEnabled ? "cursor-pointer" : ""} ${
                isAfterHighlighted
                  ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                  : ""
              }`}
              onMouseEnter={
                hoverEnabled ? () => setHoveredValue({ type: "collateral", state: "after", value: after }) : undefined
              }
              onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
            >
              {after}
            </span>
            <span
              className={`text-xs flex font-bold items-center text-slate-300 dark:text-slate-600 border-l-2 border-r-2 ml-2 border-slate-300 dark:border-slate-600 rounded-sm px-1 py-0 ${
                hoverEnabled ? "cursor-pointer" : ""
              } ${
                isCollateralUsdHighlighted
                  ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                  : ""
              }`}
              onMouseEnter={
                hoverEnabled
                  ? () => setHoveredValue({ type: "collateralUsd", state: "after", value: afterInUsd })
                  : undefined
              }
              onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
            >
              {formatUsdValue(afterInUsd)}
            </span>
          </div>
        )}
      </StateTransition>
    </StateMetric>
  );
}
