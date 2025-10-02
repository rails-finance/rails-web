"use client";

import { useHover, ValueType, ValueState } from "../context/HoverContext";

interface HighlightableValueProps {
  children: React.ReactNode;
  type: ValueType;
  state: ValueState;
  value?: number | string;
  className?: string;
  asBlock?: boolean;
  variant?: "explanation" | "card";
}

export function HighlightableValue({
  children,
  type,
  state,
  value,
  className = "text-slate-800 milodon dark:text-slate-300",
  asBlock = false,
  variant = "explanation",
}: HighlightableValueProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  // Skip hover interactions for 'before' states or when hover is disabled
  const shouldEnableHover = hoverEnabled && state !== "before";
  const isHighlighted = shouldEnableHover && hoveredValue?.type === type && hoveredValue?.state === state;

  const Component = asBlock ? "div" : "span";

  // Different highlight styles based on variant
  const getHighlightClass = () => {
    if (!isHighlighted) return "";

    if (variant === "explanation") {
      return 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse';
    } else {
      // Card variant: upward-pointing triangle centered below the value using CSS borders
      return 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-5 before:border-r-5 before:border-b-5 before:border-l-transparent before:border-r-transparent before:border-b-black dark:before:border-b-white before:animate-pulse';
    }
  };

  return (
    <Component
      className={`${asBlock ? "inline-block" : "font-bold"} ${shouldEnableHover ? "cursor-pointer " : ""} ${
        className || "text-slate-800 milodon dark:text-slate-300"
      } ${getHighlightClass()}`}
      onMouseEnter={shouldEnableHover ? () => setHoveredValue({ type, state, value }) : undefined}
      onMouseLeave={shouldEnableHover ? () => setHoveredValue(null) : undefined}
    >
      {children}
    </Component>
  );
}
