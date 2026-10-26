"use client";

// The Lifetime flows chart's axis as the panel's HTML reads it, and the parts
// of the chart engine the panel draws (rails-ops
// reference/lifetime-flows-scrubber.md, "The chart engine"): the range
// buttons and the pointer's nearest stop. Kept apart from the chart
// (components/shared/lifetime-flows-lw.tsx), whose code the panel fetches
// only where a family draws on Lightweight Charts.

import { DAY_S } from "@/lib/shared/asset-chart-grid";

/** The window shown, in unix seconds. */
export interface FlowsLwView {
  from: number;
  to: number;
}
/** The chart's time axis as the panel's HTML reads it. */
export interface FlowsLwAxis {
  /** The x of an absolute day's close (the axis's last day at most), in the
   *  chart's px from its left edge. */
  xClose: (day: number) => number;
  /** The plot's width: the chart less its price axis. */
  plotW: number;
  view: FlowsLwView;
  bounds: { t0: number; t1: number };
}
export interface FlowsLwApi {
  /** Brings an absolute day's close into the window, where it lies outside or
   *  near an edge; the chart alone moves. */
  reveal: (day: number) => void;
  /** Sets the window to the last `days` of the axis (null: all of it), moved
   *  to hold `cursorDay`. */
  showSpan: (days: number | null, cursorDay: number) => void;
}

/** The range buttons, in days ("All" the whole axis). */
const RANGES = [
  ["7D", 7],
  ["30D", 30],
  ["1Y", 365],
  ["All", null],
] as const;

/** The range buttons over the chart: the last 7 days, 30 days, a year, or
 *  all of the axis (a span the life does not exceed is not offered). */
export function LwRanges({
  axis,
  api,
  span,
  cursorDay,
}: {
  axis: FlowsLwAxis | null;
  api: React.MutableRefObject<FlowsLwApi | null>;
  span: number;
  cursorDay: number;
}) {
  const w = axis ? axis.view.to - axis.view.from : null;
  const all = axis ? axis.bounds.t1 - axis.bounds.t0 : null;
  const active = (days: number | null) => {
    if (w == null || all == null || !axis) return days == null;
    const want = days == null ? all : days * DAY_S;
    return (
      Math.abs(w - want) <= want * 0.03 && (days == null || Math.abs(axis.view.to - axis.bounds.t1) <= want * 0.03)
    );
  };
  const offered = RANGES.filter(([, d]) => d == null || d < span);
  if (offered.length < 2) return null;
  return (
    <div className="mb-1.5 flex gap-1 text-xs" role="group" aria-label="Span shown" data-anatomy="F22">
      {offered.map(([word, days]) => (
        <button
          key={word}
          type="button"
          aria-pressed={active(days)}
          onClick={() => api.current?.showSpan(days, cursorDay)}
          className={`rounded px-2 py-0.5 tabular-nums pointer-coarse:min-h-9 pointer-coarse:px-3 ${active(days) ? "bg-[var(--surface-sunken)] font-semibold text-foreground" : "text-rb-500 hover:text-foreground"}`}
          data-flow-range={word}
        >
          {word}
        </button>
      ))}
    </div>
  );
}

/** The nearest stop to a pointer's x on the chart's axis, among every stop's
 *  close (one off the window included, so a drag at an edge walks on). */
export function nearestStopAt(xs: number[], px: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  xs.forEach((x, i) => {
    const d = Math.abs(x - px);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
