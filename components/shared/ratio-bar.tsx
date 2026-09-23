"use client";

// <RatioBar> — the shared horizontal risk-ratio bar behind every per-protocol
// LTV / CR / borrow-capacity card. One axis, one grammar (chart grammar,
// rails-ops 0010 addendum: horizontal = a relationship at an instant):
//
//   · The axis is a 0..1 fraction of the card's own capacity measure
//     (collateral value, liquidation capacity, CF-weighted capacity …) —
//     the CARD decides the axis and states it in its prose.
//   · Blue fill = the borrowed share (the structural collateral cue, shared
//     with PriceRunway's FILL).
//   · Hairline ticks mark thresholds: `neutral` for reference lines (borrow
//     cap, recovery-mode line), `liquidation` for the one factual red. No
//     safe/caution gradient — the no-opinionated-colour principle.
//
// The track/fill colours and the h-2.5 bar height are PriceRunway's — the two
// horizontal instruments deliberately share a vocabulary.
//
// <AllocationBar> below is the SAME instrument with n segments instead of one
// fill — same track, same height, same helpers, so a later change to either
// moves both. It is an extension rather than a fork for that reason. It takes
// no ticks: a tick in this grammar is a threshold, and a split of one quantity
// across several places has none.

import type { ReactNode } from "react";

export const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
export const clampPct = (f: number) => Math.max(0, Math.min(100, f * 100));

const FILL = "bg-blue-500";
const TRACK = "bg-rb-200 dark:bg-rb-500/30";
const TICK_NEUTRAL = "bg-foreground/40";
const TICK_LIQUIDATION = "bg-red-500";

export interface RatioBarTick {
  /** Position on the bar, a 0..1 fraction of the card's axis. */
  f: number;
  /** `neutral` = a reference threshold; `liquidation` = the red line. */
  kind: "neutral" | "liquidation";
  /** Hover caption naming the threshold and its value. */
  title: string;
}

/** The bar itself: track, blue fill to `fill` (a 0..1 fraction), hairline
 *  ticks. Carries the standard mt-2.5 offset from the card's header row. */
export function RatioBar({ fill, ticks }: { fill: number; ticks: RatioBarTick[] }) {
  return (
    <div className={`relative mt-2.5 h-2.5 rounded-full ${TRACK}`}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${FILL}`} style={{ width: `${clampPct(fill)}%` }} />
      {ticks.map((t, i) => (
        <div
          key={i}
          title={t.title}
          className={`absolute -inset-y-1 w-0.5 rounded-full ${t.kind === "liquidation" ? TICK_LIQUIDATION : TICK_NEUTRAL}`}
          style={{ left: `${clampPct(t.f)}%`, transform: "translateX(-50%)" }}
        />
      ))}
    </div>
  );
}

/* ── AllocationBar ─────────────────────────────────────────────────────────
   One quantity split across several places, at one instant. RatioBar's track,
   RatioBar's height, RatioBar's helpers — the difference is n segments rather
   than one fill, and no ticks.

   THE COLOUR RULE, AND WHY IT IS A RAMP AND NOT A PALETTE. Rails chooses which
   market is which segment, so a segment carries no colour that could be read as
   a judgement about it: no hue per market, no green for large and amber for
   small, nothing an eye would rank. What the segments carry instead is the
   page's own ink at descending strength, stepped by the SOURCE's own ordering —
   an index the contract publishes, not one Rails invented. The ramp separates
   neighbours and says nothing else. A saturated hue anywhere in this bar would
   be a claim, so there is none.

   COLLAPSE. A band the width of a panel cannot draw twenty legible segments, so
   a caller may hand in fewer and one COLLECTED segment standing for the rest.
   The collection is always the SMALLEST values — the largest is never
   swept into a group — and it always draws last. The bar does not decide that; the
   caller does, because only the caller knows what the values mean and how wide
   the panel is. What the bar guarantees is that a collected segment reads as
   one: it takes the faintest step of the ramp regardless of index. */

/** The ink ramp, faintest last. Stepped by the caller's `rampIndex` and clamped
 *  at the end, so a long queue's tail shares the faintest step rather than
 *  wrapping round to the darkest and reading as a new first market. */
const RAMP = [
  "bg-foreground/75",
  "bg-foreground/62",
  "bg-foreground/52",
  "bg-foreground/44",
  "bg-foreground/36",
  "bg-foreground/30",
  "bg-foreground/25",
  "bg-foreground/20",
  "bg-foreground/[0.16]",
  "bg-foreground/[0.13]",
];
const RAMP_COLLECTED = "bg-foreground/[0.13]";

export interface AllocationSegment {
  /** Stable across renders — the market id, or the collected group's own key. */
  key: string;
  /** This segment's share of the band, 0..1. */
  f: number;
  /** The ordering the SOURCE publishes, which is the only thing the ramp
   *  encodes. Ignored on a collected segment, which takes the faintest step. */
  rampIndex: number;
  /** Hover caption — the segment's own name and figure, in words. */
  title: string;
  /** True for the one segment standing for several. */
  collected?: boolean;
  /** The caller's receipt wrapper. Every segment carries one; the bar does not
   *  know what a receipt is, so the caller hands the wrapping in. */
  wrap?: (bar: ReactNode) => ReactNode;
  /** `data-*` attributes stamped on the segment, so a check can read this
   *  segment's own RAW figure out of the rendered DOM rather than off a
   *  formatted caption. Values a reader never sees and a verifier always can. */
  data?: Record<string, string>;
}

/**
 * The band. `segments` are drawn in the order given; an empty list draws the
 * bare track with `emptyLabel` under it, which is a reading of a real moment
 * (an address holding nothing at that block) and never a hidden row.
 */
export function AllocationBar({
  segments,
  emptyLabel,
  ariaLabel,
}: {
  segments: AllocationSegment[];
  /** Said under the track when there is nothing to divide. */
  emptyLabel?: string;
  ariaLabel?: string;
}) {
  const empty = segments.length === 0;
  return (
    <div className="px-5 pb-1">
      <div
        className={`relative flex h-2.5 gap-px overflow-hidden rounded-full ${TRACK}`}
        data-alloc-bar=""
        data-alloc-segments={segments.length}
        {...(empty ? { "data-alloc-empty": "" } : {})}
        role="img"
        aria-label={ariaLabel ?? emptyLabel ?? "allocation"}
      >
        {segments.map((s) => {
          const shade = s.collected ? RAMP_COLLECTED : RAMP[Math.min(s.rampIndex, RAMP.length - 1)];
          const bar = <span className={`block h-full w-full ${shade}`} title={s.title} />;
          return (
            <span
              key={s.key}
              className="block h-full min-w-px"
              style={{ width: `${clampPct(s.f)}%` }}
              data-alloc-segment={s.key}
              {...(s.collected ? { "data-alloc-collected": "" } : {})}
              {...(s.data ?? {})}
            >
              {s.wrap ? s.wrap(bar) : bar}
            </span>
          );
        })}
      </div>
      {empty && emptyLabel && (
        <p className="mt-1 text-[11px] leading-relaxed text-rb-500" data-alloc-empty-label="">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}
