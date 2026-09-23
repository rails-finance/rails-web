"use client";

import { useState, type ReactNode } from "react";

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
          <span className="text-sm font-semibold text-rb-500 tabular-nums">{delta}</span>
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

export function ClosedLabel() {
  return <span className="text-sm font-semibold ">CLOSED</span>;
}

/** Equal-size surfaced stat card — the shared building block of the
 *  event-detail snapshot grid across protocols. Each section (Collateral,
 *  Debt, LTV, Interest/Borrow Rate) renders as one of these, all sharing a
 *  single CSS grid so they balance in width and — via `sm:auto-rows-fr` on the
 *  grid plus `h-full` here — match the tallest card's height per row. */
export function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-background px-4 py-3">
      <div className="mb-1.5 text-xs font-semibold text-rb-500">{label}</div>
      {children}
    </div>
  );
}

export function StateTransition({ children }: { children: ReactNode }) {
  // gap, not space-x: space-x stamps margins onto the children, which would
  // fight the locator pill's negative-margin box (.prov-locate-box) on any
  // <Prov>-wrapped value sitting directly in this row.
  return <div className="flex items-center gap-1">{children}</div>;
}
