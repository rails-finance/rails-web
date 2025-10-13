"use client";

import { TokenIcon } from "@/components/icons/tokenIcon";
import { useHover, ValueType, ValueState, shouldHighlight } from "../../context/HoverContext";
import { toLocaleStringHelper } from "@/lib/utils/format";

interface AssetActionProps {
  action: string;
  asset: string;
  amount?: number;
  className?: string;
  alwaysShowAmount?: boolean;
  valueType?: ValueType; // 'debt' | 'collateral' | etc.
  valueState?: ValueState; // 'change' | 'fee' | etc. (defaults to 'change')
}

export function AssetAction({ action, asset, amount, alwaysShowAmount = false, valueType, valueState = "change" }: AssetActionProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  const isHighlighted = hoverEnabled && valueType && amount && shouldHighlight(hoveredValue, valueType, valueState);

  return (
    <div className="flex items-center space-x-1">
      <span className="font-bold text-slate-400 mr-1">{action}</span>
      {amount && (
        <span
          className={`font-bold ${alwaysShowAmount ? "" : "sm:hidden"} ${
            hoverEnabled && valueType ? "cursor-pointer" : ""
          } ${
            isHighlighted
              ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse'
              : ""
          }`}
          onMouseEnter={
            hoverEnabled && valueType
              ? () => setHoveredValue({ type: valueType, state: valueState, value: amount })
              : undefined
          }
          onMouseLeave={hoverEnabled && valueType ? () => setHoveredValue(null) : undefined}
        >
          {toLocaleStringHelper(amount)}
        </span>
      )}
      <TokenIcon assetSymbol={asset} />
    </div>
  );
}
