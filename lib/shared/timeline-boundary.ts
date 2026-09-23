// The boundary — what a timeline says at the point where it stops drawing rows.
// ----------------------------------------------------------------------------
// Every position and holder timeline that draws fewer rows than the position
// has ends with ONE card, the same card on every protocol, as the last node on
// the spine after the oldest drawn row (rails-ops decision 0019). This module is
// the shape that card takes, and the builders that produce it from the three
// mechanisms that cut a list today:
//
//   window  the index served the newest N events and an opening balance for
//           everything older (lib/shared/timeline-opening-balance.ts) — the
//           eighteen mainnet pages;
//   base    the replay ran over the whole life server-side and trimmed the drawn
//           list to the newest rows (lib/sources/chain/*-events.ts) — the Base
//           explorers, including a heavy wallet whose elided history travelled
//           as a seed, and a HORIZON answer whose earlier history is simply not
//           on the page;
//   vault   the holder loader built every row and serialised the newest
//           VAULT_TIMELINE_DRAW_ROWS of them (lib/shared/vault-holder-timeline.ts);
//   limit   a plain `limit` on the fetch — Liquity V2 trove pages — where the
//           route reports the whole count beside the page it served.
//
// THE COUNTS ARE LITERAL. `omitted` is exactly the number of events before the
// oldest drawn row, `total` is the position's whole count, and the two close on
// the page: the newest row's number is `total`, the oldest drawn row's number is
// `omitted + 1`, and the card's own pill reads `omitted`. Where the total is
// only a floor (a vault lane that refused the whole-range sweep) `lowerBound`
// says so and every sentence reads "at least". Where the count is not on the
// page at all (a horizon) `omitted` is null and nothing is invented.
//
// THE STATE LINES ARE THE ARM'S OWN FIGURES, already formatted in protocol
// units. On the window arm they are the oldest served row's own `*Before`
// fields (lib/shared/timeline-boundary-state.ts); on the Base and vault arms
// the replay captures the state at the trim and sends it beside the count. A
// line the arm cannot state is ABSENT — never a zero, never a dash.

import type { OpeningBucket, TimelineWindow } from "@/lib/shared/timeline-opening-balance";

/** One lane of the position at the cut: a label in the protocol's own words
 *  ("USDC supply", "Debt", "Shares") and the figure as a decimal string in
 *  protocol units, with the unit it is stated in. The card formats the figure
 *  the way the rows above format theirs (compact display, exact on hover). */
export interface BoundaryStateLine {
  label: string;
  value: string;
  unit?: string;
}

/** What a Base replay or a vault loader captured at the trim, beside the
 *  count. Every field is optional on the wire — a reader on a build that
 *  predates it draws the card from the count alone. Histograms are null where
 *  the replay could not count the elided rows by type (a seeded heavy wallet:
 *  the seed carries a count, not a breakdown), so a partial histogram is never
 *  stated as the whole. */
export interface TimelineCutSummary {
  stateAtCut?: BoundaryStateLine[] | null;
  byType?: OpeningBucket[] | null;
  byAsset?: OpeningBucket[] | null;
  /** Unix seconds of the position's first event, when dated. */
  firstAt?: number | null;
  /** Unix seconds of the newest omitted event — the cut's own date. */
  lastAt?: number | null;
}

export type TimelineBoundaryArm = "window" | "base" | "vault" | "limit";

export interface TimelineBoundary {
  arm: TimelineBoundaryArm;
  /** Events before the oldest drawn row. NULL when the page does not hold the
   *  count at all — a horizon, where the record on the page starts at
   *  `cutBlock` and what came before it is not on the page. */
  omitted: number | null;
  /** The position's whole count — omitted plus drawn. 0 beside a null
   *  `omitted`. */
  total: number;
  /** True when `total` (and so `omitted`) is a floor rather than a census. */
  lowerBound: boolean;
  /** The block the drawn rows start at: the newest omitted event's block on
   *  the Base arm, the window's exclusive cutoff on the window arm, the oldest
   *  drawn row's block on the limit and vault arms. */
  cutBlock: number;
  /** Unix seconds of the cut — the newest omitted event's date. */
  cutAt: number | null;
  /** Unix seconds of the position's first event. */
  firstAt: number | null;
  /** Counts of the omitted events by action key — the filter menu's own keys
   *  (`getEventActionKey`), labelled by `actionLabel` on the card. Null where
   *  the arm cannot break them down. */
  byType: OpeningBucket[] | null;
  /** Counts of the omitted events by display symbol. Null on a roster with no
   *  asset axis, and where the arm cannot break them down. */
  byAsset: OpeningBucket[] | null;
  /** The position at the cut, one line per lane. Null where the arm cannot
   *  state it — after-only rows, a horizon, a replay whose drawn rows are not
   *  contiguous with the cut. */
  state: BoundaryStateLine[] | null;
  /** Window arm only — the opening balance has not arrived, or could not be
   *  read. The count is unknown then; the card says so instead of a number. */
  pending?: "reading" | "failed";
}

// ── The window arm ──────────────────────────────────────────────────────────

/** The boundary a windowed page owes its reader, from the window it fetched.
 *  Null when the rows ARE the whole history. The state lines come from the
 *  caller (the oldest served row's own before-figures), because this module
 *  must not import the protocol adapters. */
export function boundaryFromWindow(
  win: TimelineWindow,
  listed: number,
  state: BoundaryStateLine[] | null,
): TimelineBoundary | null {
  if (win.state === "whole") return null;
  if (win.state !== "ready") {
    return {
      arm: "window",
      omitted: null,
      total: 0,
      lowerBound: false,
      cutBlock: win.cutoffBlock,
      cutAt: null,
      firstAt: null,
      byType: null,
      byAsset: null,
      state,
      pending: win.state === "pending" ? "reading" : "failed",
    };
  }
  const o = win.opening;
  if (o.totalEvents === 0) return null;
  return {
    arm: "window",
    omitted: o.totalEvents,
    total: o.totalEvents + listed,
    lowerBound: false,
    cutBlock: win.cutoffBlock,
    cutAt: o.lastTimestamp,
    firstAt: o.firstTimestamp,
    byType: o.byAction,
    byAsset: o.byAsset,
    state,
  };
}

// ── The Base arm ────────────────────────────────────────────────────────────

/** The slice of a swept/indexed coverage the boundary reads. Named here so the
 *  builder does not import the fetch client into a shared module. */
export interface ChainCoverageForBoundary {
  fromBlock: number;
  fromDeployment: boolean;
  gaps: { from: number; to: number }[];
  firstEventAt: number | null;
  omitted?: { count: number; upToBlock: number; summary?: TimelineCutSummary };
}

/** The boundary a Base timeline owes its reader, from the coverage the replay
 *  returned beside the rows. A trimmed list names its count; a HORIZON (the
 *  record starts at the cut, nothing earlier on the page) names the block and
 *  no count. Null when the drawn rows are the whole life. */
export function boundaryFromChainCoverage(coverage: ChainCoverageForBoundary, listed: number): TimelineBoundary | null {
  const om = coverage.omitted;
  if (om && om.count > 0) {
    const s = om.summary;
    return {
      arm: "base",
      omitted: om.count,
      total: om.count + listed,
      lowerBound: false,
      cutBlock: om.upToBlock,
      cutAt: s?.lastAt ?? null,
      firstAt: s?.firstAt ?? coverage.firstEventAt,
      byType: s?.byType ?? null,
      byAsset: s?.byAsset ?? null,
      state: s?.stateAtCut ?? null,
    };
  }
  // A horizon: swept or served from a stated block that is not the contract's
  // first, with no holes inside the span (a holed history is a different
  // statement and the footer makes it).
  if (!coverage.fromDeployment && coverage.gaps.length === 0 && listed > 0) {
    return {
      arm: "base",
      omitted: null,
      total: 0,
      lowerBound: false,
      cutBlock: coverage.fromBlock,
      cutAt: null,
      firstAt: null,
      byType: null,
      byAsset: null,
      state: null,
    };
  }
  return null;
}

// ── The vault arm ───────────────────────────────────────────────────────────

export interface VaultDrawnForBoundary {
  rows: number;
  of: number;
  /** The oldest drawn row's block. */
  cutBlock: number;
  summary?: TimelineCutSummary;
}

export function boundaryFromVaultDrawn(
  drawn: VaultDrawnForBoundary | undefined,
  lowerBound: boolean,
): TimelineBoundary | null {
  if (!drawn || drawn.of <= drawn.rows) return null;
  const s = drawn.summary;
  return {
    arm: "vault",
    omitted: drawn.of - drawn.rows,
    total: drawn.of,
    lowerBound,
    cutBlock: drawn.cutBlock,
    cutAt: s?.lastAt ?? null,
    firstAt: s?.firstAt ?? null,
    byType: s?.byType ?? null,
    byAsset: s?.byAsset ?? null,
    state: s?.stateAtCut ?? null,
  };
}

// ── The limit arm ───────────────────────────────────────────────────────────

/** A plain `limit` on the fetch, with the route reporting the whole count. */
export function boundaryFromLimit(p: {
  total: number;
  listed: number;
  cutBlock: number;
  cutAt: number | null;
  state: BoundaryStateLine[] | null;
}): TimelineBoundary | null {
  const omitted = p.total - p.listed;
  if (!(omitted > 0)) return null;
  return {
    arm: "limit",
    omitted,
    total: p.total,
    lowerBound: false,
    cutBlock: p.cutBlock,
    cutAt: p.cutAt,
    firstAt: null,
    byType: null,
    byAsset: null,
    state: p.state,
  };
}

// ── Histogram helper for the server-side arms ───────────────────────────────

/** Count keys into `OpeningBucket[]`, commonest first. */
export function bucketsOf(counts: Map<string, number>): OpeningBucket[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
}
