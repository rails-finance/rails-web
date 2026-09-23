"use client";

import { useHover, ValueType, ValueState } from "../context/HoverContext";

// Value types that are ALSO surfaced on the position card's main stat area
// (the headline grid + identity row). Per the highlight rule — see <V> in
// liquity-event-explainer and the matching comment in the Aave sibling
// aave-v4-position-explanation — a value in explanation prose renders
// foreground AND bold (the two travel together) ONLY when the same figure is
// shown on the card, so a bold figure in the prose always maps to one the
// reader can locate above it. Derived figures the card never shows (principal,
// accrued interest, daily/annual cost, management fee, spot price, durations,
// …) stay regular-weight in the muted body tone — they're never bold-but-muted.
// Callers can still override with an explicit `className` (the card-side stats
// do, e.g. text-foreground/80, text-green-400); an override implies emphasis,
// so it keeps the bold weight.
const CARD_MIRRORED_TYPES: ReadonlySet<ValueType> = new Set<ValueType>([
  "collateral",
  "collateralUsd",
  "collRatio",
  "debt",
  "interestRate",
  // The trove card's costs line now surfaces the annual base-interest cost
  // ("Costs: ~595.18 year") and the delegate fee rate ("+0.3%"), so both lift
  // to the mirrored bold+foreground style. The per-day and BOLD/yr fee figures
  // the card omits stay muted body tone.
  "annualInterest",
  "managementFeeRate",
  // Chrome twins on the trove card: the "Liquidates at" caption, the
  // troves-ahead pill on the risk row, the compact runway chip's queue share,
  // and the two header count badges (△ redemptions, ⇄ owner transactions) —
  // reverse-completeness (charter §3) states each in the pane, bold.
  "liquidationPrice",
  "trovesAhead",
  "queueShare",
  "redemptionCount",
  "transactionCount",
  "peakDebt",
  "peakCollateral",
  "troveId",
  "nftToken",
  "ownerAddress",
]);

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
  className,
  asBlock = false,
  variant = "explanation",
}: HighlightableValueProps) {
  const { hoveredValue, setHoveredValue, hoverEnabled } = useHover();

  // When no explicit color is passed, derive it from the type: card-mirrored
  // values lift to foreground, everything else stays muted body tone.
  const isMirrored = CARD_MIRRORED_TYPES.has(type);
  const colorClass = className ?? (isMirrored ? "text-foreground" : "text-rb-500");
  // Weight tracks the foreground lift so bold ⟺ foreground: emphasise only
  // mirrored values (or where a caller opts in via className). Derived prose
  // figures stay regular weight — never bold-but-muted.
  const weightClass = asBlock ? "inline-block" : className || isMirrored ? "font-bold" : "font-normal";

  // Enable hover interactions when hover is enabled
  const shouldEnableHover = hoverEnabled;
  const isHighlighted = shouldEnableHover && hoveredValue?.type === type && hoveredValue?.state === state;

  const Component = asBlock ? "div" : "span";

  // Different highlight styles based on variant
  const getHighlightClass = () => {
    if (!isHighlighted) return "";

    if (variant === "explanation") {
      return 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse';
    } else {
      // Card variant: upward-pointing triangle centered below the value using CSS borders
      return 'relative before:content-[""] before:absolute before:-bottom-1.5 before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-black dark:before:border-b-white before:animate-pulse';
    }
  };

  return (
    <Component
      className={`${weightClass} ${shouldEnableHover ? "cursor-pointer " : ""} ${colorClass} ${getHighlightClass()} whitespace-nowrap`}
      onMouseEnter={shouldEnableHover ? () => setHoveredValue({ type, state, value }) : undefined}
      onMouseLeave={shouldEnableHover ? () => setHoveredValue(null) : undefined}
    >
      {children}
    </Component>
  );
}
