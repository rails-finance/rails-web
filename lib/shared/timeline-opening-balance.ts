// The opening balance — what a windowed timeline brings forward.
// ----------------------------------------------------------------------------
// A position page does not merely LIST a wallet's events, it ADDS THEM UP: the
// lifetime tower, both filter menus' counts, the heatmap, the tenure eyebrow and
// the external-actor verdict are each a reduction over EVERY event. That is why
// the eight index-served timelines fetched a whole history, and why the deepest
// Aave V3 wallet cost 154 MB and 28.3 seconds to draw.
//
// `?recent=N` (rails-server `3847278`) now serves a WINDOW of those events and
// names the block it opens at. Everything below that block is summarised by
// `/timeline/summary?cutoffBlock=` the same number, and this module is the
// client half: the shape that arrives, and the merges that put the two halves
// back together.
//
// THE CUT IS EXCLUSIVE AND IT IS A BLOCK. The summary covers `block_number <
// cutoffBlock`, the rows cover `>= cutoffBlock`; the two partition the history
// with no overlap and no gap, and because a block is atomic every event sharing
// one block lands on the same side. Nothing here may double-count across the
// line, which is why every merge below takes the summary as a SEED and then adds
// the loaded rows, rather than adding two independently-derived totals.
//
// IT IS AN OPENING BALANCE, NOT A HIDDEN PART OF THE LIST. The page states it as
// a balance brought forward, the way a bank statement does. That is what makes
// the model preferable to moving the arithmetic server-side wholesale: the
// reader can still check the arithmetic of every row in front of them, and the
// summarised part is presented AS a summary rather than disguised as a
// derivation. It is also why a filter does NOT re-cut it — a statement does not
// re-filter its brought-forward line when the reader narrows the rows below it.
//
// KEYS ARE THE PAGE'S OWN VOCABULARY BY THE TIME THEY GET HERE. rails-server
// keys its histograms in the INDEX's vocabulary — the raw action verb, the raw
// token address, base-unit integer amounts — because it has no symbol resolver
// and should not grow one. The `/timeline/summary` proxy route resolves the
// asset keys through the SAME resolver its `/timeline` twin uses for the rows,
// so a bucket that reaches this module is already key-for-key with
// `getEventAssetKeys`. A symbol that resolved on one side of the cut and
// degraded to a truncated address on the other would silently split a bucket in
// two, and nothing downstream could tell that from a real second asset.

/** THE ONE CUT ON EVERY TIMELINE (rails-ops decision 0019, amended
 *  2026-09-10): a position or holder timeline draws its newest 1,000 rows and
 *  the boundary card after them, whichever arm serves it — the windowed
 *  mainnet pages ask the index for this many (`?recent=`), the Base replays
 *  trim their drawn list to it, the vault loaders' draw window is it, and the
 *  Liquity V2 trove page's `limit` is it. One number, one name, so the cut
 *  cannot drift between arms and so a break test is a single edit.
 *
 *  The cut is still a PARAMETER on every hop of the windowed request, because
 *  it is also the natural boundary if deep history is ever tiered — and as of
 *  2026-09-11 the index can be read by a SPAN OF TIME as well as by its newest
 *  end (`/timeline?from=&to=`, unix seconds), which is what a below-cut month
 *  on the activity map will eventually be fetched with.
 *
 *  1,000 keeps the deepest wallet in the product to ~1 MB and 1,002 rows where
 *  its whole history is 154 MB and 28.3 s, and leaves 837,290 of the index's
 *  838k positions entirely unaffected — they hold fewer events than this and
 *  get no cut at all.
 *
 *  ── ⚠️ WHETHER THIS NUMBER SHOULD BE 5,000 — MEASURED 2026-09-11, NOT TAKEN
 *
 *  Three things a windowed page says — "of 1,000 listed", the opening-balance
 *  caption, and an activity map whose older months refuse the click — are all
 *  true statements about this line, and all three stop being drawn on their
 *  own once a position has no opening balance. So where the line sits decides
 *  how many readers meet them, and a reader on an ordinary 4,333-event
 *  position meets all three today.
 *
 *  COUNTED on the onboarding index over its 245,918 Aave V3 (wallet, market)
 *  positions: 426 hold more than 1,000 events, 199 more than 2,000, 82 more
 *  than 5,000, 36 more than 10,000; the largest holds 107,726. At 1,000 the
 *  cut bites 426 positions to protect against the 36 that need it.
 *
 *  MEASURED at 5,000, local dev against the onboarding box:
 *    • a 4,333-event position: whole history 3.76 MB and 1.31 s on the wire,
 *      against 0.87 MB and 1.99 s for the windowed fetch it would replace —
 *      the windowed read is not even faster, because it pays for a cutoff
 *      probe and a second request for the opening balance;
 *    • the deepest position (107,726 events): the window grows from 0.81 MB /
 *      1,000 rows to 4.08 MB / 5,003 rows, and the page's settle time from a
 *      steady 8.9-9.2 s to 9.3 s at best, ~12 s median. Its whole history
 *      stays 50.6 MB and 32.6 s, which is what the cut is for.
 *
 *  WHAT STOPPED IT BEING A ONE-LINE CHANGE, and why the number is Miles's:
 *  raising the line does not merely re-tune the checkpoint model, it EMPTIES
 *  it for whole families. At 5,000 the deepest Fluid position in the index
 *  holds 1,430 events, so no Fluid page windows at all and nothing exercises
 *  the boundary card, the opening balance or the below-cut refusal there. The
 *  same shape applies to several Base arms. That is a decision about decision
 *  0019's machinery, not a constant.
 *
 *  ── ITS UNIT CHANGED, AND SO DID ITS NAME
 *
 *  Decision 0019's EVENING amendment moved the unit: the cut counts ROWS after
 *  grouping, not events, and a folder is one row the index serves. A cut of a
 *  thousand EVENTS is initiator-blind — on a position that is being ACTED
 *  UPON the newest thousand are the actors' and the owner's own story falls
 *  below the line, which is exactly what a budget must never do
 *  (`rails-ops/reference/timeline-attention-budget.md`).
 *
 *  `TIMELINE_WINDOW_ROWS` is that name and is what new code takes.
 *  `TIMELINE_WINDOW_EVENTS` stays beside it, DEPRECATED, with its call sites
 *  untouched: the arms that still serve events read the same thousand, the
 *  rollout is one family at a time, and renaming a hundred call sites is a
 *  cosmetic sweep that belongs in its own change. The two are tied at compile
 *  time — the second's type is the first's literal — so they cannot drift
 *  apart without failing to build. */
export const TIMELINE_WINDOW_ROWS = 1000;

/** @deprecated The cut counts ROWS — use `TIMELINE_WINDOW_ROWS`. Kept for the
 *  arms that still serve events, and tied to it above. */
export const TIMELINE_WINDOW_EVENTS: typeof TIMELINE_WINDOW_ROWS = 1000;

/** ONE PAGE OF ROWS — how many of the cut's thousand the list draws at a time.
 *
 *  It sits here beside the cut because the two are the same family of fact and
 *  the reader meets them as one thing: a thousand rows, fifty at a press.
 *  ChainTruthTimeline's `WINDOW_CHUNK` is this constant.
 *
 *  It was halved on 2026-09-11 (Miles). The first paint is a LANDING, not a
 *  reading list: since the heatmap became the way to move around a life, the
 *  rows under it are where a reader arrives, not where they search. Fifty is
 *  enough to see what kind of position this is, and the rest is one press —
 *  or, far more often now, a day picked on the map. */
export const TIMELINE_PAGE_ROWS = 50;

/** One bar of a histogram: a key in the PAGE's vocabulary, and how many of the
 *  summarised events carried it. */
export interface OpeningBucket {
  key: string;
  count: number;
}

/** The lifetime flow Σ for one asset, in the leg names the protocol's own
 *  client-side reducer uses, so a merge is key-for-key with no translation.
 *  Amounts are exact sums in BASE UNITS as decimal strings — never scaled here,
 *  because summing base units and scaling once at the end is strictly more
 *  precise than scaling each side first and adding the results. */
export interface OpeningFlowBucket {
  key: string;
  /** The index's own key before resolution — a lowercase token address on the
   *  protocols keyed that way. Kept because a symbol does not price: the tower
   *  looks USD up by address, and dropping it would leave every summarised
   *  reserve unpriced while the same reserve prices fine in the window. Absent
   *  where the index's key was never an address. */
  sourceKey?: string;
  /** Decimals for `legs`, filled in by the summary proxy from the same resolver
   *  the rows go through. NULL means the legs cannot be scaled and the bucket
   *  must be treated as unknown rather than as zero. */
  decimals: number | null;
  /** Liquity V1 reduces its lifetime flows per epoch — a redeemed-and-reopened
   *  trove is a new position on the same wallet — so its buckets carry the epoch
   *  to select on. NULL on the protocols with no epoch axis. */
  epoch: number | null;
  legs: Record<string, string>;
}

/** A part of the shape this protocol's rows cannot answer, and why. The named
 *  field is null above. It renders as a DASH, never a zero: a zero and an
 *  absence are different claims, and only one of them is true here. */
export interface OpeningOmission {
  field: "byAsset" | "actors" | "flows";
  why: string;
}

export interface TimelineOpeningBalance {
  /** Echoed back: this balance covers `block_number < cutoffBlock`. */
  cutoffBlock: number;
  /** Events strictly below the cut. Zero is a real answer. */
  totalEvents: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  firstBlock: number | null;
  lastBlock: number | null;
  /** Counts by action key — the same keys `getEventActionKey` returns. */
  byAction: OpeningBucket[];
  /** Counts by UTC calendar day. The key is the day's start in unix seconds,
   *  `Math.floor(ts / 86400) * 86400` — byte-for-byte the heatmap's own
   *  `startOfUtcDay`. */
  byDay: OpeningBucket[];
  /** Counts by display symbol, or null on a position that is one fixed asset
   *  pair and has no asset axis to filter on. */
  byAsset: OpeningBucket[] | null;
  actors: { external: number; actors: { address: string; count: number }[] } | null;
  flows: OpeningFlowBucket[] | null;
  omitted: OpeningOmission[];
}

/** What the page knows about its own window.
 *
 * The three states a window can be in are three different claims, and a page
 * must not conflate them:
 *  - `whole` — no window was asked for, or the position holds fewer events than
 *    the window, so the rows ARE the history and every figure is complete.
 *  - `pending` — a window is in force and its opening balance has not arrived.
 *    Every whole-history figure is UNKNOWN and must render as unknown. The one
 *    thing that must never happen here is reducing the window alone and
 *    presenting the result as a lifetime figure.
 *  - `failed` — the opening balance could not be fetched. Same rule as
 *    `pending`, but it will not resolve, so the page says so.
 *  - `ready` — the two halves are both in hand and they partition the history.
 *
 * A DISCRIMINATED union, so the two invariants are facts the compiler checks
 * rather than comments a reader has to trust: a window that is not "whole"
 * always names the block it opened at, and only "ready" carries an opening
 * balance. Anything that reads `opening` outside "ready" is reading a null it
 * cannot silently treat as an empty history. */
export type TimelineWindow =
  | { state: "whole"; cutoffBlock: null; opening: null }
  | { state: "pending" | "failed"; cutoffBlock: number; opening: null }
  | { state: "ready"; cutoffBlock: number; opening: TimelineOpeningBalance };

export const WHOLE_HISTORY: TimelineWindow = { state: "whole", cutoffBlock: null, opening: null };

/** True when a whole-history figure can be stated at all. False means the page
 *  owes its reader an unknown rather than a number — see `state` above. */
export function lifetimeFiguresKnown(w: TimelineWindow | undefined): boolean {
  return !w || w.state === "whole" || w.state === "ready";
}

/** Scale an exact base-unit sum into the display units the page's own reducers
 *  work in. Split whole from fractional through BigInt first, so a 30-digit sum
 *  does not lose its low digits to a float before the divide — the same method
 *  `scaleV3` uses per event, restated here because this module must not import
 *  a chain module into a client bundle.
 *
 *  Returns null when `decimals` is unknown. A summarised leg that cannot be
 *  scaled is UNKNOWN, and every caller must treat it as unknown: adding a zero
 *  in its place would state a lifetime total that is short by whatever the
 *  opening balance held. */
export function scaleBaseUnits(raw: string, decimals: number | null): number | null {
  if (decimals == null) return null;
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    return null;
  }
  if (value === BigInt(0)) return 0;
  if (decimals <= 0) return Number(value);
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(value / divisor) + Number(value % divisor) / Number(divisor);
}

/** Seed a count map with an opening histogram, then let the caller add the
 *  loaded rows. Returns a NEW map; the buckets are never mutated. */
export function seedCounts(buckets: OpeningBucket[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of buckets ?? []) m.set(b.key, (m.get(b.key) ?? 0) + b.count);
  return m;
}
