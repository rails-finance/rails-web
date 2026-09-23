import type { ReactNode } from "react";

// One labelled figure inside a card — label above, value below, an optional
// sub-line under that.
//
// This replaces seven copies of the same component that had accumulated across
// the protocol views (frankencoin, f(x), liquity-v1, makerdao, polaris, and the
// two listing-header stats bands). They had drifted into exactly two shapes,
// and the drift turned out to be doing real work rather than being noise: the
// five inside topic cards are compact, because they sit four-to-a-grid in a
// dense card; the two in listing headers are prominent, because they are the
// first figures on the page. So the two densities survive as one named `size`
// rather than as two components nobody knew were different.
//
// Not to be confused with `StatValue` in `stat-value.tsx` — that is the much
// larger position-page figure (text-2xl/3xl), a third density with its own job.
//
// For the head figures at the top of a protocol view surface, reach for
// `VitalsBand` instead; it owns the slots and their order.

export interface StatProps {
  label: string;
  /** The figure itself, unit included. */
  children: ReactNode;
  /** A qualifying sub-line — a cap, an exact figure, a second reading. */
  note?: ReactNode;
  /** `compact` (default) for a figure inside a topic card; `prominent` for the
   *  first figures on a listing, where the band is the page's opening. */
  size?: "compact" | "prominent";
}

const LABEL = {
  compact: "text-[11px] text-rb-500",
  prominent: "text-xs font-semibold text-rb-500",
} as const;

const VALUE = {
  compact: "mt-0.5 text-xs tabular-nums text-foreground",
  prominent: "mt-0.5 text-base font-bold tabular-nums text-foreground/80",
} as const;

const NOTE = {
  compact: "mt-0.5 text-[11px] leading-relaxed text-rb-500",
  prominent: "mt-0.5 text-xs text-rb-500",
} as const;

export function Stat({ label, children, note, size = "compact" }: StatProps) {
  return (
    <div>
      <div className={LABEL[size]}>{label}</div>
      <div className={VALUE[size]}>{children}</div>
      {note && <div className={NOTE[size]}>{note}</div>}
    </div>
  );
}
