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
        <span className="text-sm font-bold text-slate-600 dark:text-slate-300 items-center">
          {toLocaleStringHelper(amount)}
        </span>
      </span>
    );
  }

  return (
    <span className="min-h-8 flex items-center">
      <span
        className={`text-sm font-bold text-slate-600 dark:text-slate-300 items-center cursor-pointer ${isHighlighted ? 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse' : ""}`}
        onMouseEnter={() => setHoveredValue({ type, state: "change", value: amount })}
        onMouseLeave={() => setHoveredValue(null)}
      >
        {toLocaleStringHelper(amount)}
      </span>
    </span>
  );
}
