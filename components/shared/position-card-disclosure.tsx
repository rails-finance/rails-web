"use client";

// The position card's summary face (rails-ops TO-DO-position-card 270, 322).
// A card whose shell is given `positionSummary` draws a "Position summary"
// heading over its headline rows. The card has no open or closed state: every
// line under a headline is drawn, and a card that moves its additive lines into
// the right-hand panel (322) does so in its layout. The (i) Explanation row
// stays a toggle, since it opens an explanation and not a card state.
//
// `PositionCardRow` keeps its name
// for the families that still draw their lines under the headlines (323).

import { createContext, type ReactNode } from "react";
import { TipLabel } from "@/components/shared/tip-label";
import { SECTION_HEADING } from "@/lib/shared/ui-grammar";

const SummaryContext = createContext(false);

export function PositionSummaryProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

/** One headline: its heading, then the figures and the lines under them. */
export function PositionCardRow({
  index,
  head,
  label,
  labelTip,
  headerIcon,
  className,
  children,
}: {
  index: number;
  /** The headline's name (`data-card-head`), on the shared card's rows. */
  head?: string;
  /** Retired with the open and closed card; ignored. */
  defaultOpen?: boolean;
  label: string;
  labelTip?: string;
  headerIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-card-row={index} data-card-head={head}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rb-500">
        <TipLabel text={label} tip={labelTip} />
        {headerIcon}
      </div>
      {children}
    </div>
  );
}

/** The "Position summary" heading, which the shared card draws on
 *  every detail render. */
export function PositionSummaryTitle() {
  return (
    <h2 className={`${SECTION_HEADING} text-rb-500`} data-position-summary="">
      Position summary
    </h2>
  );
}
