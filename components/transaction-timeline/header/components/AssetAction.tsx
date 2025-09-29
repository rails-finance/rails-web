"use client";

import { TokenIcon } from "@/components/icons/tokenIcon";
import { useHover, ValueType, shouldHighlight } from "../../context/HoverContext";
import { toLocaleStringHelper } from "@/lib/utils/format";

interface AssetActionProps {
  action: string;
  asset: string;
  amount?: number;
  className?: string;
  alwaysShowAmount?: boolean;
  valueType?: ValueType; // 'debt' | 'collateral' | etc.
}

export function AssetAction({ action, asset, amount, alwaysShowAmount = false, valueType }: AssetActionProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  const isHighlighted = hoverEnabled && valueType && amount && shouldHighlight(hoveredValue, valueType, "change");

  return (
    <div className="flex items-center space-x-1">
      <span className="text-slate-400 mr-1">{action}</span>
      {amount && (
        <span
          className={`font-medium ${alwaysShowAmount ? "" : "sm:hidden"} ${
            hoverEnabled && valueType ? "cursor-pointer transition-all" : ""
          } ${isHighlighted ? "-mx-1 px-1 -my-0.5 py-0.5 bg-blue-900 rounded" : ""}`}
          onMouseEnter={
            hoverEnabled && valueType
              ? () => setHoveredValue({ type: valueType, state: "change", value: amount })
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
