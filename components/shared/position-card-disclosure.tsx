"use client";

// The position card's summary face (rails-ops TO-DO-position-card 270, 322).
// A card whose shell is given `positionSummary` draws a "Position summary"
// heading over its headline rows. The card has no open or closed state: every
// line under a headline is drawn, and a card that moves its additive lines into
// the right-hand panel (322) does so in its layout. The (i) Explanation row
// stays a toggle, since it opens an explanation and not a card state.
//
// `PositionCardRow`, `PositionCardDetail` and `riskColumns` keep their names
// for the families that still draw their lines under the headlines (323).

import { createContext, useContext, type ReactNode } from "react";
import { TipLabel } from "@/components/shared/tip-label";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";

const SummaryContext = createContext(false);

/** Whether the card draws the summary face. */
export function usePositionSummary(): boolean {
  return useContext(SummaryContext);
}

export function PositionSummaryProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

/** One headline: its heading, then the figures and the lines under them. */
export function PositionCardRow({
  index,
  label,
  labelTip,
  headerIcon,
  className,
  children,
}: {
  index: number;
  /** Retired with the open and closed card; ignored. */
  defaultOpen?: boolean;
  label: string;
  labelTip?: string;
  headerIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-card-row={index}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rb-500">
        <TipLabel text={label} tip={labelTip} />
        {headerIcon}
      </div>
      {children}
    </div>
  );
}

/** The card's top row: the "Position summary" heading (`PositionSummaryHeading`)
 *  on the left, the card's ⋮ or the activity meta at the right end. */
export function PositionCardHeader({
  className,
  spacing,
  anatomy,
  children,
}: {
  /** The row's layout (flex and gaps). */
  className: string;
  /** The row's outer margin. */
  spacing?: string;
  anatomy?: string;
  children: ReactNode;
}) {
  const summary = usePositionSummary();
  return (
    <div
      className={`${className} ${spacing ?? ""}`}
      data-anatomy={anatomy}
      {...(summary ? { "data-card-header": "" } : {})}
    >
      {children}
    </div>
  );
}

/** The words "Position summary"; nothing on a card without the summary face. */
export function PositionSummaryHeading() {
  if (!usePositionSummary()) return null;
  return (
    <h2 className={`${OVERLAY_HEADING} text-rb-500`} data-position-summary="">
      Position summary
    </h2>
  );
}

/** The card's figures. */
export function PositionCardRegion({
  className,
  anatomy,
  children,
}: {
  className: string;
  anatomy?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-anatomy={anatomy}>
      {children}
    </div>
  );
}

/** A card's risk headline drawn from the page's live read (Compound V2,
 *  Moonwell, Compound V3): the label, the figure, and the lines beneath it. */
export interface CardRiskColumn {
  label: string;
  labelTip?: string;
  value: ReactNode;
  detail?: ReactNode;
}

/** The risk headline as an `OpenPositionStats` column; none where the card
 *  does not draw the summary face or has no risk. */
export function riskColumns(risk: CardRiskColumn | null | undefined, summary: boolean) {
  if (!summary || !risk) return [];
  return [
    {
      label: risk.label,
      labelTip: risk.labelTip,
      value: risk.value,
      footnote: risk.detail,
    },
  ];
}

/** The lines beneath a headline. Always drawn; kept as a seam for the
 *  families that pass it as their `detailGate`. */
export function PositionCardDetail({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
