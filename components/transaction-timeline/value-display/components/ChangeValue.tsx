"use client";

import { useHover, shouldHighlight, ValueType } from "../../context/HoverContext";
import { toLocaleStringHelper } from "@/lib/utils/format";

interface ChangeValueProps {
  amount: number;
  type?: ValueType;
}

export function ChangeValue({ amount, type }: ChangeValueProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  const isHighlighted = hoverEnabled && type && shouldHighlight(hoveredValue, type, "change");

  if (!type || !hoverEnabled) {
    return (
      <span className="min-h-8 flex items-center">
        <span className="font-medium flex text-white items-center ${isHighlighted ? 'bg-blue-900 rounded' : ''}">
          {toLocaleStringHelper(amount)}
        </span>
      </span>
    );
  }

  return (
    <span className=" min-h-8 flex items-center ">
      <span
        className={`font-medium text-white justify-end cursor-pointer transition-all ${isHighlighted ? "bg-blue-900 rounded" : ""}`}
        onMouseEnter={() => setHoveredValue({ type, state: "change", value: amount })}
        onMouseLeave={() => setHoveredValue(null)}
      >
        {toLocaleStringHelper(amount)}
      </span>
    </span>
  );
}
