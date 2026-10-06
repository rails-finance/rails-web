"use client";

import { useContext, useState, type ReactNode } from "react";
import { EventLedgerContext } from "@/components/shared/event-ledger-context";

// Small layout atoms for before→after state displays on event detail cards.
// Factored out so Liquity V2, LUSD, the simulator, and any future protocols
// share the same arrow glyph, label styling, and row spacing.

export function TransitionArrow({ size = "md" }: { size?: "sm" | "md" } = {}) {
  const cls = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <svg className={`${cls} text-rb-500 flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** The before→after arrow doubles as a toggle. Clicking it swaps the muted
 *  `before →` for `+delta =`, so the row reads e.g. `+52,195 = 112,223`;
 *  clicking again reverts, and the state persists until toggled. This is the
 *  one place a state row surfaces the change as a single number — which for
 *  debt is fee-inclusive and thus differs from the principal on the header /
 *  spine. The `after` value and any trailing token icon / USD chip are rendered
 *  by the caller, after this control. Pass `delta={null}` to fall back to a
 *  plain, non-interactive arrow (e.g. when the "after" side has no real value
 *  to diff against, like a ratio that becomes N/A).
 *
 *  `before` and `delta` are ReactNodes (not bare strings) so a chain-state
 *  frontend can pass `<Prov>`-wrapped values: the delta is a *derived* figure
 *  (after − before) and must carry its own provenance / collapse under the
 *  chain-state gate, so the caller supplies the wrapped node rather than a plain string. */
export function DeltaToggle({
  before,
  delta,
  size = "md",
  // The T2 change-colour rule (rails-ops standards/detail-page-anatomy.md, "The
  // disclosure ladder"): a changed pair's BEFORE value is muted, since it is
  // what the event moved away from, not the fact it states, while the after
  // value (drawn by the caller, after this control) and the delta both take
  // the foreground tone.
  beforeClass = "text-sm font-semibold text-rb-500",
  beforeExtra,
}: {
  before: ReactNode;
  delta: ReactNode | null | undefined;
  size?: "sm" | "md";
  beforeClass?: string;
  beforeExtra?: ReactNode;
}) {
  const [showDelta, setShowDelta] = useState(false);

  if (delta == null) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`${beforeClass} tabular-nums`}>{before}</span>
        {beforeExtra}
        <TransitionArrow size={size} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowDelta((v) => !v)}
      aria-pressed={showDelta}
      aria-label={showDelta ? "Show before and after values" : "Show total change"}
      title={showDelta ? "Show before → after" : "Show total change"}
      className="group inline-flex items-center gap-1 cursor-pointer"
    >
      {showDelta ? (
        <>
          <span className="text-sm font-semibold text-foreground tabular-nums">{delta}</span>
          <span className="text-sm font-semibold text-rb-500">=</span>
        </>
      ) : (
        <>
          <span className={`${beforeClass} tabular-nums group-hover:text-rb-700 dark:group-hover:text-rb-300`}>
            {before}
          </span>
          {beforeExtra}
          <TransitionArrow size={size} />
        </>
      )}
    </button>
  );
}

export function ClosedLabel({ text = "CLOSED" }: { text?: string }) {
  return <span className="text-sm font-semibold ">{text}</span>;
}

/** Equal-size surfaced stat card — the shared building block of the
 *  event-detail snapshot grid across protocols. Each section (Collateral,
 *  Debt, LTV, Interest/Borrow Rate) renders as one of these, all sharing a
 *  single CSS grid so they balance in width and — via `sm:auto-rows-fr` on the
 *  grid plus `h-full` here — match the tallest card's height per row. */
export function StatCard({
  label,
  children,
  data,
}: {
  label: ReactNode;
  children: ReactNode;
  /** Data attributes for the cell. */
  data?: Record<string, string>;
}) {
  // On a card whose account cells open into ledgers, every cell is one row
  // as the ledger cells are (components/shared/event-ledger.tsx): its label
  // at the left, its figures at the right with any sub-line under them.
  const right = useContext(EventLedgerContext) != null;
  if (right)
    return (
      <div
        className="flex h-full flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-background px-4 py-3"
        data-stat-row=""
        {...data}
      >
        <div className="flex min-h-5 items-center text-sm font-semibold text-foreground">{label}</div>
        <div className="flex flex-1 basis-36 flex-col items-end text-right">{children}</div>
      </div>
    );
  return (
    <div className="flex h-full flex-col rounded-xl bg-background px-4 py-3" {...data}>
      <div className="mb-1.5 text-xs font-semibold text-rb-500">{label}</div>
      {children}
    </div>
  );
}

/** The T2 change-colour rule (rails-ops standards/detail-page-anatomy.md, "The
 *  disclosure ladder"): in an opened card, a value this event changed renders in
 *  the foreground tone and a value it left as it was renders muted. Every cell
 *  part below takes `changed` and defaults to muted, so a caller states the
 *  change rather than the colour. */
export const changeTone = (changed: boolean): string => (changed ? "text-foreground" : "text-rb-500");

/** The bordered value pill beside an amount (`660.2771 [ $1,033,376 ]`): the
 *  amount's worth at the event's price. Foreground when the value changed. */
export function ValuePill({ changed = false, children }: { changed?: boolean; children: ReactNode }) {
  return (
    <span
      className={`flex items-center rounded-sm border-l-2 border-r-2 border-rb-500 px-1 py-0 text-xs font-bold tabular-nums ${changeTone(changed)}`}
    >
      {children}
    </span>
  );
}

/** A small line under a cell's value ("23,739 BOLD / year", "branch minimum
 *  110%", "incl. +6,206.62 interest"). A qualifier or a reference takes the
 *  tone of what it qualifies; pass `changed` only where this event moved it. */
export function StatSubline({
  changed = false,
  className = "mt-0.5",
  children,
}: {
  changed?: boolean;
  /** Layout classes; replaces the default top margin. */
  className?: string;
  children: ReactNode;
}) {
  return <div className={`text-xs tabular-nums ${changeTone(changed)} ${className}`}>{children}</div>;
}

/** The price chip at the foot of an opened card. A regular card's single price
 *  is context the event did not change, so it is muted by default; a market
 *  note's "$1,565 → $2,709" is the change and passes `changed`. */
export function PriceChipShell({
  changed = false,
  title,
  marker,
  children,
}: {
  changed?: boolean;
  title?: string;
  /** Stamped as `data-note-price-chip` where a verifier reads the chip. */
  marker?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`ml-auto inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-xs font-bold ${changeTone(changed)}`}
      title={title}
      data-note-price-chip={marker ? "" : undefined}
    >
      {children}
    </span>
  );
}

export function StateTransition({ children }: { children: ReactNode }) {
  // gap, not space-x: space-x stamps margins onto the children, which would
  // fight the locator pill's negative-margin box (.prov-locate-box) on any
  // <Prov>-wrapped value sitting directly in this row.
  const right = useContext(EventLedgerContext) != null;
  return <div className={`flex flex-wrap items-center gap-1${right ? " justify-end" : ""}`}>{children}</div>;
}
