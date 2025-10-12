"use client";

import { TokenIcon } from "@/components/icons/tokenIcon";
import { StateMetric } from "../components/StateMetric";
import { StateTransition, TransitionArrow } from "../components/StateTransition";
import { ClosedStateLabel } from "../components/ClosedStateLabel";
import { useHover, shouldHighlight } from "../../context/HoverContext";
import { formatUsdValue } from "@/lib/utils/format";
import { HighlightableValue } from "../../explanation/HighlightableValue";
import { ExternalLink } from "lucide-react";

interface CollateralMetricProps {
  collateralType: string;
  before: number;
  after: number;
  beforeInUsd: number;
  afterInUsd: number;
  isCloseTrove: boolean;
  isLiquidation: boolean;
  collSurplus?: number;
}

export function CollateralMetric({ collateralType, before, after, beforeInUsd, afterInUsd, isCloseTrove, isLiquidation, collSurplus }: CollateralMetricProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();
  // For closeTrove, always show transition even if before is 0
  const hasChange = isCloseTrove ? before !== after : before != 0 && before !== after;
  // Note: collSurplus is only passed when it's actually claimable (not in full redistribution cases)
  const hasSurplus = collSurplus !== undefined && collSurplus > 0;

  // Only highlight when hover is enabled
  const isBeforeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateral", "before");
  const isAfterHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateral", "after");
  const isChangeHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateral", "change");
  const isBeforeUsdHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateralUsd", "before");
  const isCollateralUsdHighlighted = hoverEnabled && shouldHighlight(hoveredValue, "collateralUsd", "after");
  return (
    <StateMetric label="Collateral" icon={<TokenIcon assetSymbol={collateralType} className="mr-2 w-5 h-5" />}>
      <StateTransition>
        {hasChange && (
          <>
            <div className="flex items-center space-x-1">
              <span
                className={`font-bold text-slate-400 dark:text-slate-600 ${hoverEnabled ? "cursor-pointer" : ""} ${
                  isBeforeHighlighted
                    ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                    : ""
                }`}
                onMouseEnter={
                  hoverEnabled ? () => setHoveredValue({ type: "collateral", state: "before", value: before }) : undefined
                }
                onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
              >
                {before.toFixed(4)}
              </span>
              {isLiquidation && beforeInUsd > 0 && (
                <span
                  className={`text-xs font-bold text-slate-300 dark:text-slate-600 ${hoverEnabled ? "cursor-pointer" : ""} ${
                    isBeforeUsdHighlighted
                      ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                      : ""
                  }`}
                  onMouseEnter={
                    hoverEnabled
                      ? () => setHoveredValue({ type: "collateralUsd", state: "before", value: beforeInUsd })
                      : undefined
                  }
                  onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
                >
                  ({formatUsdValue(beforeInUsd)})
                </span>
              )}
            </div>
            <TransitionArrow />
          </>
        )}
        {isCloseTrove ? (
          <ClosedStateLabel />
        ) : (
          <div className="flex items-center">
            <span
              className={`text-sm font-bold text-slate-600 dark:text-slate-300 ${hoverEnabled ? "cursor-pointer" : ""} ${
                isAfterHighlighted
                  ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
                  : ""
              }`}
              onMouseEnter={
                hoverEnabled ? () => setHoveredValue({ type: "collateral", state: "after", value: after }) : undefined
              }
              onMouseLeave={hoverEnabled ? () => setHoveredValue(null) : undefined}
            >
              {after === 0 ? "0" : after.toFixed(4)}
            </span>
            {after > 0 && (
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
            )}
          </div>
        )}
      </StateTransition>
      {hasSurplus && (
        <div className="">
          <a
            href="https://www.liquity.org/frontend-v2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-green-600  font-bold text-xs transition-colors"
          >
            Claim surplus
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </StateMetric>
  );
}
