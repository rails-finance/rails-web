// Lifetime flows over time — the protocol-neutral contract behind the date
// scrubber (components/shared/lifetime-flows-scrubber.tsx, rails-ops
// reference/lifetime-flows-scrubber.md).
// ----------------------------------------------------------------------------
// An adapter hands in one row per active UTC day: the running USD per lifetime
// bucket after the day's last event (each flow valued at the oracle price at
// its block, the tower's rule), the token balances the day's events left, and
// the prices they carried. The scrubber steps by day and a day's state is its
// last event's, so day rows are exact. `daysFromEvents` builds them from a
// page's events; the Aave V3 route (/api/aave-v3/flows/daily) serves them.
//
// Everything the view draws at a date is `stateAt(model, stop)`: a pure
// function of the rows, the prices and the live totals, with no DOM and no
// fetch, so it is tested offline (scripts/verify/verify-lifetime-flows-state.ts).
//
// Prices between events. With a daily series (`dailyPrices`: the last oracle
// price recorded on or before each day's end), a held asset is valued at its
// day's price; a stretch where the series records nothing for more than
// `SERIES_GAP_DAYS` keeps its older price and is marked. Without one, an asset
// keeps the price its last event carried and a price older than `STALE_DAYS`
// is marked. Nothing is interpolated.
//
// Balances between events. Where the timeline carries the reserves' indexes
// (`indexes`: the Aave family's route), a balance on a day after the event
// that recorded it is grown by interest: recorded × the index at the day's
// close ÷ the index at that event, the chain's balance that day. Without them
// it stays as the event recorded it.

export type FlowSide = "collateral" | "debt";

/** How an outflow's hatch reads: an owner's own exit, a liquidation, or
 *  another party's redemption. */
export type FlowTone = "exit" | "liquidation" | "redemption";

/** One lifetime bucket, as the adapter names it. The view draws the buckets
 *  in the order given. */
export interface FlowBucket {
  key: string;
  label: string;
  /** The timeline's name for the event that fills it ("Supply"), for the
   *  event pips' tips. */
  event?: string;
  side: FlowSide;
  dir: "in" | "out";
  /** Outflows: the hatch. Default "exit". */
  tone?: FlowTone;
  /** Buckets sharing a link are one on-chain act seen from both sides (a
   *  repay with collateral, a liquidation): hovering one highlights all. */
  link?: string;
  /** The pattern that tells this line from the side's others
   *  (standards/lexicon.md, lifetime bars' fills). An outflow's is a hatch
   *  (default "reverse"); an inflow's a texture over the side's faded hue
   *  (none: the faded hue alone). No two lines of a side share a fill. */
  hatch?: FlowHatch;
  /** The ledger row's name, where it is not the label (a redemption-toned
   *  line reads "Redeemed" there by default): an f(x) rebalance's. */
  ledgerLabel?: string;
}

/** The outflow hatches: reverse diagonal (a withdrawal or repayment), cross
 *  (withdrawn and swapped), vertical (swapped within the position), dots (sent
 *  to another account), horizontal (the two sides of a repay with collateral),
 *  zigzag (a repay made with aTokens), forward diagonal (a liquidation or a
 *  redemption, in its tone's hue). Dashes are interest, or another amount
 *  that builds between events, on either side of the bar. The inflow
 *  textures: grid (received by transfer), checker (swapped in), rings (what
 *  was held when the window opens). */
export type FlowHatch =
  | "reverse"
  | "cross"
  | "vertical"
  | "dots"
  | "horizontal"
  | "dashes"
  | "zigzag"
  | "forward"
  | "grid"
  | "checker"
  | "rings";

export interface FlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  /** What the event was, for the tick strip under the slider: the side it
   *  moved, or a liquidation, a redemption, another change the owner did not
   *  make ("caution": a force repay, a tick rebalance), or a rate change set by
   *  a delegate or batch manager ("rate-delegate") or by the owner
   *  ("rate-owner"). A day draws its strongest (`tickRank`). */
  tick: FlowTick;
  /** What the event adds to each bucket, in USD, and the asset it moved. */
  legs: { bucket: string; usd: number; symbol?: string }[];
  /** The transaction, and whether the position card counts it (false: a
   *  liquidation or a transfer). Default counted. */
  tx?: string;
  countsTx?: boolean;
  /** Token balances after the event, for the assets it touched; `index` is
   *  the side's reserve index at the event, where the timeline carries indexes. */
  balances: { asset: string; symbol: string; side: FlowSide; amount: number; index?: number }[];
  /** Prices the event carries, USD per token at its block. */
  prices: { asset: string; usd: number }[];
  /** Where the event's figures rest on something the page could not read: a
   *  leg valued without its block's price, or a balance not read at the
   *  block. `held`: the day's held or owed figure rests on it too (the line
   *  is dashed into that day's point); else only the flows (the bars). */
  unsure?: FlowUnsure[];
}

/** A figure the panel draws without its price or its read, and why, in the
 *  words the line's tip and the headline's mark state (rails-ops
 *  reference/lifetime-flows-scrubber.md, "Incomplete stretches"). */
export interface FlowUnsure {
  side: FlowSide;
  why: string;
  /** The asset the reason is about, where a family names several with one
   *  reason: the words then read "WETH and USDC " + `why`. */
  symbol?: string;
  held?: boolean;
  /** The held figure rests on it until the next day with events (a balance
   *  the row did not state, which the next row settles). */
  untilNext?: boolean;
}

export interface FlowLive {
  /** What the position holds and owes now, valued as the Lifetime flows
   *  ledger values them. */
  collateralUsd: number;
  debtUsd: number;
  /** The interest earned now, for a bar that names its balancing item with
   *  `words.rest`: at the live stop that item states this figure. */
  collateralInterestUsd?: number | null;
  /** Each asset held and owed now, as the ledger values it, for the zoom
   *  view; absent, the last day's balances at today's prices. */
  assets?: FlowAssetHeld[];
  /** Flows a live read states that no event has recorded yet, added to their
   *  buckets at the live stop only (a Liquity Trove's pending redistribution
   *  and batch fee, from getLatestTroveData). */
  pending?: { bucket: string; symbol: string; usd: number }[];
}

/** One asset held or owed at a stop. */
export interface FlowAssetHeld {
  side: FlowSide;
  symbol: string;
  /** Token units, where known. */
  amount: number | null;
  usd: number;
  /** Where the model values it on a past day: the UTC day (days since the
   *  epoch) its price was recorded, and whether a daily series recorded it
   *  (else an event's block). */
  priced?: { day: number; series: boolean };
  /** Grown by interest since the event that recorded it (`FlowIndexes`):
   *  `amount` is `recorded` × `index` ÷ `anchor`. */
  grown?: FlowGrowth;
}

/** How a balance between events was grown by interest. */
export interface FlowGrowth {
  /** The balance its last event recorded, and that event's UTC day. */
  recorded: number;
  recordedDay: number;
  /** The side's index at that event and at the close of `indexDay`. */
  anchor: number;
  index: number;
  indexDay: number;
  /** Where the index comes from (`FlowIndexes.basis`). */
  basis: FlowIndexes["basis"];
}

/** The reserves' indexes at each held day's close, per asset: [UTC day,
 *  supply index, borrow index] (the Aave family's route). The Aave V3 Pool
 *  family's from its ReserveDataUpdated logs (liquidityIndex,
 *  variableBorrowIndex); Aave V4's from the hub (share price, drawn index);
 *  a Comet's base supply and borrow index as the account's rows imply them
 *  (lib/compound/flows.ts); a Compound V2-family account's from its rows (the
 *  exchange rate, and the debt's growth between rows: lib/shared/ctoken-flows.ts);
 *  a Fluid position's exchange prices as its rows imply them (lib/fluid/flows.ts);
 *  a Dolomite market's supply and borrow index as the account's rows state
 *  them (lib/dolomite/flows.ts); a LlamaLend position's debt growth as its
 *  rows imply it (lib/llamalend/flows.ts); an Aave V3 Pool account on Base
 *  as its rows imply it (lib/aave-v3-base/flows.ts). */
export interface FlowIndexes {
  basis:
    | "reserve-data"
    | "hub-state"
    | "comet"
    | "ctoken-rows"
    | "fluid-rows"
    | "dolomite-rows"
    | "llamalend-rows"
    | "aave-rows";
  assets: Record<string, [day: number, supply: number | null, borrow: number | null][]>;
}

/** The side's index for `asset` at the close of `day`, or of the last day
 *  before it that has one; null where none is at or before it. */
export function indexAt(
  indexes: FlowIndexes,
  asset: string,
  side: FlowSide,
  day: number,
): { index: number; day: number } | null {
  const rows = indexes.assets[asset];
  if (!rows || rows.length === 0) return null;
  let lo = 0;
  let hi = rows.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][0] <= day) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  for (let i = hit; i >= 0; i--) {
    const v = rows[i][side === "collateral" ? 1 : 2];
    if (v != null && v > 0) return { index: v, day: rows[i][0] };
  }
  return null;
}

/** A balance recorded on `recordedDay` (with the side's index then) at the
 *  close of `day`: grown by the index where both are known and the index read
 *  is after the event's day; otherwise as recorded. */
export function grownBalance(
  indexes: FlowIndexes | undefined,
  asset: string,
  side: FlowSide,
  recorded: number,
  recordedDay: number,
  anchor: number | undefined,
  day: number,
): { amount: number; grown?: FlowGrowth } {
  if (!indexes || !(recorded > 0) || !(anchor != null && anchor > 0) || day <= recordedDay) return { amount: recorded };
  const at = indexAt(indexes, asset, side, day);
  if (!at || at.day <= recordedDay) return { amount: recorded };
  return {
    amount: (recorded * at.index) / anchor,
    grown: { recorded, recordedDay, anchor, index: at.index, indexDay: at.day, basis: indexes.basis },
  };
}

export type FlowTick =
  | "collateral"
  | "debt"
  | "both"
  | "liquidation"
  | "redemption"
  | "caution"
  | "rate-delegate"
  | "rate-owner";

/** A tick's strength: a day with several events draws the strongest —
 *  liquidation, then a redemption or other caution event, then a rate change
 *  (a delegate's before the owner's), then a movement. */
export function tickRank(t: FlowTick): number {
  switch (t) {
    case "liquidation":
      return 4;
    case "redemption":
    case "caution":
      return 3;
    case "rate-delegate":
      return 2.5;
    case "rate-owner":
      return 2;
    default:
      return 1;
  }
}

/** A rate change's words in the tick's tip. */
const RATE_WORD = { "rate-delegate": "Rate set by the delegate", "rate-owner": "Rate change" } as const;

/** One active UTC day: the position after the day's last event. */
export interface FlowDayRow {
  /** UTC day number (unix seconds / 86400). */
  day: number;
  /** Events on or before this day. */
  events: number;
  /** The day's strongest event for the tick strip (`tickRank`). */
  tick: FlowEvent["tick"];
  /** The day's rate changes, which move no bucket, for the tick's words. */
  rates?: ("rate-delegate" | "rate-owner")[];
  /** Running USD per bucket after the day. */
  cum: Record<string, number>;
  /** Balances the day's events stated, after its last event. */
  balances: FlowEvent["balances"];
  /** Each asset's last at-block price that day, with its block time. */
  prices: { asset: string; usd: number; ts: number }[];
  /** Transactions on or before this day (the position card's count). */
  txs?: number;
  /** The running USD per bucket and symbol, for the cells the day moved. */
  cumAsset?: { bucket: string; symbol: string; usd: number }[];
  /** The day's events' figures that rest on something not read (`FlowEvent.unsure`). */
  unsure?: FlowUnsure[];
}

/** The token a family states its flows in, where it is not USD: every
 *  figure is the token in units of 10^-scale (rails-ops
 *  reference/lifetime-flows-scrubber.md, "Morpho"). */
export interface FlowUnit {
  symbol: string;
  scale: number;
}

export interface FlowTimeline {
  /** Set where the figures are a token's (Morpho's loan token); absent, USD. */
  unit?: FlowUnit;
  /** Set where each side is in its own token and nothing prices one in the
   *  other (Frankencoin: the collateral token and ZCHF). Each side's figures
   *  are its token in grains, and each bar and each side of the line is drawn
   *  on its own axis (`sideAxis`). `unit` names the figures a view cannot
   *  place on a side. */
  sideUnits?: Record<FlowSide, FlowUnit>;
  buckets: FlowBucket[];
  /** Ascending by day. */
  days: FlowDayRow[];
  live: FlowLive;
  /** Today's price per asset, for an asset held while no event has priced it. */
  todayPrices?: Record<string, number>;
  /** Per asset, the days a new daily price was recorded: [day, usd]. The last
   *  oracle price recorded on or before each day's end, across every wallet. */
  dailyPrices?: Record<string, [number, number][]>;
  /** Today's UTC day number. With it the slider runs to today while anything
   *  is still held after the last event; without it, one stop past that event. */
  today?: number;
  /** Events in the history (the last day row's count when absent). */
  totalEvents?: number;
  /** Transactions in the history, where the day rows count them. */
  totalTxs?: number;
  /** The headline words, the position card's: "Collateral" and "Debt" by default. */
  labels?: { collateral: string; debt: string };
  /** A family's own words for the one-sided bar; each unset one keeps the default. */
  words?: FlowWords;
  /** Token addresses by symbol, for an icon a symbol alone does not resolve
   *  (a Pendle PT, whose mark is read through its address). */
  addresses?: Record<string, string>;
  /** The daily series holds prices only on the days a price was recorded (a
   *  family with no daily price lane builds it from its events): a day or a
   *  line's bin between keeps the last one, and a price older than
   *  STALE_DAYS is stated as such. */
  seriesCarry?: boolean;
  /** The reserves' indexes at each held day's close: a balance between events
   *  is grown by interest from the event that recorded it. */
  indexes?: FlowIndexes;
  /** Per asset whose daily prices come from its events alone (no daily price
   *  store answers for it): why a day valued at a price recorded on an
   *  earlier day has none for that day. Such a day's figure is drawn dotted. */
  carriedWhy?: Record<string, string>;
}

/** Per-timeline words for the scrubber. Every field is optional and defaults
 *  to the words every lending family reads. */
export interface FlowWords {
  /** The solid segment of the supplied side ("Still supplied"). */
  held?: string;
  /** The date label at the last stop ("Today, live prices"). */
  live?: string;
  /** The supplied side's balancing item, for a bar whose dollar axis is a
   *  fixed rate, where everything past what came in is interest. Unset, each
   *  side's balancing item reads "Market move and interest" at every stop:
   *  interest and price change are told apart only at the live stop, so no
   *  stop splits them (rails-ops reference/lifetime-flows-scrubber.md). */
  rest?: string;
  /** Each side's balancing item by name, where a family can say what it
   *  holds (Liquity: "Market move" on the collateral, "Interest since the
   *  last event" on the debt). Signed, the remainder of the printed lines. */
  restBySide?: Partial<Record<FlowSide, string>>;
  /** What each side's balancing item holds, the clause the segment panel
   *  and the receipt close its basis line with. */
  restNote?: Partial<Record<FlowSide, string>>;
  /** The panel's basis line for a side, where it is not "Each flow is
   *  valued at the price on its own day." */
  basis?: Partial<Record<FlowSide, string>>;
  /** How a side's held or owed figure is valued between events, for its
   *  receipt ("each Trove's …"). */
  heldBasis?: Partial<Record<FlowSide, string>>;
  /** The Explanation's clause on the prices the line is drawn at, where it is
   *  not the index's daily prices. */
  linePrices?: string;
  /** The timeline's card for a moment between events (lib/shared/flow-moment.ts). */
  moment?: FlowMomentWords;
  /** The Explanation's words for a mark under the line, where a family's
   *  event of that kind has a name of the family's (Frankencoin's sales, PWN's default
   *  claim under the red triangle). */
  marks?: Partial<Record<FlowTick, string>>;
}

/** A family's words for the card that states the position at a moment
 *  between its events. */
export interface FlowMomentWords {
  /** Sides counted at a $1 face, whose daily price in the model is the
   *  interest built on the recorded balance since the last event: their
   *  token figure is their USD figure (a Liquity Trove's debt). */
  face?: FlowSide[];
  /** Sides stated in their token alone, with no price beside it (a side
   *  whose figures are its own token, `FlowTimeline.sideUnits`). */
  tokensOnly?: FlowSide[];
  /** Why a side states no USD where no price was recorded that day. */
  noPrice?: Partial<Record<FlowSide, string>>;
  /** Lines under the figures, on what the moment leaves out. */
  notes?: string[];
  /** A face side whose interest is a contract's sum by the whole minute from
   *  `start`, stopped at `deadline` (PWN v1.2/v1.3: principal × APR × whole
   *  minutes ÷ 5,256,000,000, `apr` in the terms' hundredths of a percent).
   *  The card states that sum where it would state the rate's straight line. */
  minuteSum?: { start: number; deadline: number | null; principal: number; apr: number };
  /** The year, in seconds, a face side's rate builds over (365.25 days where
   *  unset; Liquity V2 and its forks: 365 days). */
  yearSeconds?: number;
}

/** A held asset whose price, at some date, is older than the gap allowed. */
export interface StalePrice {
  symbol: string;
  side: FlowSide;
  /** Unix seconds of the price used. */
  pricedAt: number;
  usd: number;
}

/** A day that repriced a held asset after a stale stretch. */
export interface Repricing {
  /** Slider stop (day index). */
  day: number;
  symbol: string;
  /** Unix seconds of the previous price. */
  from: number;
}

interface FlowRow {
  /** Slider stop of the active day. */
  day: number;
  events: number;
  /** Transactions through the day, where the day rows count them. */
  txs: number | null;
  cum: Record<string, number>;
  /** The running USD per `${bucket}|${symbol}` the day moved. */
  cells: { bucket: string; symbol: string; usd: number }[];
}

export interface FlowModel {
  /** The timeline's token axis, where it has one; absent, USD. */
  unit?: FlowUnit;
  /** Each side's token, where the sides have no common unit
   *  (`FlowTimeline.sideUnits`), and each bar's axis. */
  sideUnits?: Record<FlowSide, FlowUnit>;
  sideAxes?: Record<FlowSide, { max: number; ticks: number[] }>;
  buckets: FlowBucket[];
  /** One per active day, ascending. */
  rows: FlowRow[];
  /** UTC midnight of the first event's day, ms. */
  start: number;
  /** Day index of the last event's day. */
  lastDay: number;
  /** The final stop: today, at live prices. */
  liveStop: number;
  /** Day indexes that carry at least one event, ascending, unique. */
  eventDays: number[];
  /** The tick strip: one entry per active day, with the timeline's names
   *  for the events that moved a bucket that day. */
  ticks: { day: number; tick: FlowEvent["tick"]; kinds: string[] }[];
  repricings: Repricing[];
  live: FlowLive;
  /** Held and owed, valued, at the end of each stop before the live one. */
  valued: { collateral: number; debt: number }[];
  /** Held assets on an old price, per stop (only stops that have any). */
  stale: Map<number, StalePrice[]>;
  /** Per stop, the held and owed figures that rest on a price or a read the
   *  page does not have, and why (only stops that have any). */
  unsure: Map<number, { side: FlowSide; why: string; symbol?: string }[]>;
  /** The flows that rest on one: each reason's first stop. */
  unsureFlows: { stop: number; side: FlowSide; why: string; symbol?: string }[];
  /** Whether held assets are valued at a daily price series. */
  daily: boolean;
  /** Days a price may age before the asset is on an old price. */
  gapDays: number;
  totalEvents: number;
  /** Transactions in the history, where the day rows count them. */
  totalTxs: number | null;
  /** The headline words. */
  labels: { collateral: string; debt: string };
  words: FlowWords;
  /** Token addresses by symbol, for icons (`FlowTimeline.addresses`). */
  addresses?: Record<string, string>;
  /** Each asset held and owed at the end of each stop before the live one,
   *  and at the live stop. */
  heldAt: FlowAssetHeld[][];
  liveHeld: FlowAssetHeld[];
  /** The shared x-axis, fixed for the position so bars never rescale. */
  axis: { max: number; ticks: number[] };
  /** Each bar's length at the live stop, for the "today" outline. */
  today: { collateral: number; debt: number };
  /** A model cut to a window (`windowModel`): what was held and owed when
   *  the window opens, at the close of the day before, with the counts
   *  through that day. The bars' sources start with it. */
  opening?: {
    /** Unix seconds of the window's first day. */
    ts: number;
    collateral: number;
    debt: number;
    held: FlowAssetHeld[];
    events: number;
    txs: number | null;
  };
}

export interface FlowSegment {
  key: string;
  label: string;
  /** "held" solid and "out" hatched on the bar; "in" an exact source and
   *  "estimate" the balancing item on the line under it. */
  fill: "held" | "out" | "in" | "estimate";
  tone?: FlowTone;
  hatch?: FlowHatch;
  link?: string;
  /** Drawn width in USD (clamped so the strip never overruns its bar). */
  width: number;
  /** The figure the line under the bar states (signed for a balancing item). */
  value: number;
  /** A balancing item that can go either way: its figure carries a sign. */
  signed?: boolean;
  /** A balancing item: what it holds, for the basis line and its receipt. */
  note?: string;
  /** The basis line's opening sentence for the side, and (on the held
   *  segment) how the held figure is valued between events. */
  basis?: string;
}

export interface FlowSideState {
  /** What is still there: the solid segment. */
  now: number;
  /** Everything that came in: the bar's whole length. */
  total: number;
  /** Everything that left. */
  out: number;
  /** The bar: held first, then each outflow. */
  bar: FlowSegment[];
  /** The line under the bar: exact inflows, then the balancing item. They
   *  add up to the bar's length. */
  sources: FlowSegment[];
}

export interface FlowState {
  stop: number;
  isLive: boolean;
  /** Events on or before the stop. */
  count: number;
  /** Transactions on or before the stop, where the day rows count them. */
  txs: number | null;
  collateral: FlowSideState;
  debt: FlowSideState;
  /** Held assets valued at an old price at this stop. */
  stale: StalePrice[];
}

export const DAY_MS = 86_400_000;
const DAY_S = 86_400;
/** Event prices only: a price older than this at a date is stated as such. */
export const STALE_DAYS = 30;
/** Daily series: a stretch longer than this with no recorded price keeps the
 *  older price, stated as such. */
export const SERIES_GAP_DAYS = 7;
/** A held position below this many dollars is not named as stale. */
const STALE_FLOOR_USD = 1;
/** A repricing is marked when it moves its side's value by this share. */
const REPRICE_SHARE = 0.01;

const utcDay = (tsSec: number): number => Math.floor(tsSec / DAY_S);

/** The largest of 1, 2, 2.5 or 5 × 10^k not above `x`. */
function niceStepBelow(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  const f = m >= 5 ? 5 : m >= 2.5 ? 2.5 : m >= 2 ? 2 : 1;
  return f * p;
}

/** The axis for a peak bar length: gridlines at a round step, the end a
 *  little past the peak (on a fifth of that step) so the longest bar never
 *  touches the edge. */
export function axisFor(peak: number): { max: number; ticks: number[] } {
  if (!(peak > 0)) return { max: 1, ticks: [0] };
  const step = niceStepBelow(peak / 3);
  const grain = step / 5;
  const max = Math.ceil((peak * 1.02) / grain) * grain;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max, ticks };
}

/** Whether the axis label at `i` of `count` is drawn below the sm breakpoint.
 *  An axis of more than five labels keeps the first, the last and every other
 *  one between that sits two steps clear of the last ("$12.5M$15.0M" ran
 *  together at 390px). */
export function axisLabelOnPhone(i: number, count: number): boolean {
  const last = count - 1;
  return !(last > 4 && i !== 0 && i !== last && (i % 2 === 1 || last - i < 2));
}

/** A page's events as day rows: each day's running totals, the balances its
 *  events stated, and the prices they carried, as the day's last event left
 *  them. */
export function daysFromEvents(bucketKeys: string[], events: FlowEvent[]): FlowDayRow[] {
  const ordered = [...events].sort((a, b) => a.ts - b.ts || a.block - b.block);
  const cum: Record<string, number> = Object.fromEntries(bucketKeys.map((k) => [k, 0]));
  const cumAsset: Record<string, number> = {};
  const days: FlowDayRow[] = [];
  let cur: {
    day: number;
    sides: Set<"collateral" | "debt">;
    /** The day's strongest event that is not a movement. */
    mark: FlowTick | null;
    rates: Set<"rate-delegate" | "rate-owner">;
    balances: Map<string, FlowEvent["balances"][number]>;
    prices: Map<string, { usd: number; ts: number }>;
    cells: Set<string>;
    unsure: Map<string, FlowUnsure>;
  } | null = null;
  let n = 0;
  let txs = 0;
  let lastTx: string | null = null;
  const close = () => {
    if (!cur) return;
    days.push({
      day: cur.day,
      events: n,
      tick: cur.mark ?? (cur.sides.size === 2 ? "both" : cur.sides.has("debt") ? "debt" : "collateral"),
      ...(cur.rates.size ? { rates: [...cur.rates] } : {}),
      cum: { ...cum },
      balances: [...cur.balances.values()],
      prices: [...cur.prices].map(([asset, p]) => ({ asset, usd: p.usd, ts: p.ts })),
      txs,
      cumAsset: [...cur.cells].map((c) => ({
        bucket: c.slice(0, c.indexOf("|")),
        symbol: c.slice(c.indexOf("|") + 1),
        usd: cumAsset[c],
      })),
      ...(cur.unsure.size ? { unsure: [...cur.unsure.values()] } : {}),
    });
    cur = null;
  };
  for (const ev of ordered) {
    const day = utcDay(ev.ts);
    if (cur && cur.day !== day) close();
    cur ??= {
      day,
      sides: new Set(),
      mark: null,
      rates: new Set(),
      balances: new Map(),
      prices: new Map(),
      cells: new Set(),
      unsure: new Map(),
    };
    n += 1;
    // A transaction's events are consecutive; the card leaves some out.
    if (ev.countsTx !== false) {
      const tx = ev.tx ? ev.tx.toLowerCase() : null;
      if (tx == null || tx !== lastTx) {
        txs += 1;
        lastTx = tx;
      }
    }
    for (const p of ev.prices) if (p.usd > 0) cur.prices.set(p.asset, { usd: p.usd, ts: ev.ts });
    for (const leg of ev.legs) {
      if (!(leg.bucket in cum) || !Number.isFinite(leg.usd)) continue;
      cum[leg.bucket] += leg.usd;
      if (leg.symbol) {
        const cell = `${leg.bucket}|${leg.symbol}`;
        cumAsset[cell] = (cumAsset[cell] ?? 0) + leg.usd;
        cur.cells.add(cell);
      }
    }
    for (const b of ev.balances) cur.balances.set(`${b.side}:${b.asset}`, b);
    for (const u of ev.unsure ?? []) {
      const k = `${u.side}|${u.symbol ?? ""}|${u.why}`;
      const had = cur.unsure.get(k);
      cur.unsure.set(k, had ? { ...had, held: had.held || u.held, untilNext: had.untilNext || u.untilNext } : u);
    }
    if (ev.tick === "both") {
      cur.sides.add("collateral");
      cur.sides.add("debt");
    } else if (ev.tick === "collateral" || ev.tick === "debt") cur.sides.add(ev.tick);
    else {
      if (ev.tick === "rate-delegate" || ev.tick === "rate-owner") cur.rates.add(ev.tick);
      if (cur.mark == null || tickRank(ev.tick) > tickRank(cur.mark)) cur.mark = ev.tick;
    }
  }
  close();
  return days;
}

/** One asset's price at a stop: the newer of its daily series and its events'. */
interface PriceAt {
  usd: number;
  /** Unix seconds the price was recorded (a series price: its day's start). */
  ts: number;
  /** Stop of the day it was recorded. */
  day: number;
  series: boolean;
}

/** Replay the day rows into the model the scrubber reads. */
export function buildFlowModel(t: FlowTimeline): FlowModel | null {
  const days = [...t.days].sort((a, b) => a.day - b.day);
  if (days.length === 0) return null;
  const startDay = days[0].day;
  const start = startDay * DAY_MS;
  const daily = !!t.dailyPrices && Object.keys(t.dailyPrices).length > 0;
  const gapDays = daily && !t.seriesCarry ? SERIES_GAP_DAYS : STALE_DAYS;
  const outOf = (side: FlowSide, c: Record<string, number>) =>
    t.buckets.filter((b) => b.side === side && b.dir === "out").reduce((s, b) => s + (c[b.key] ?? 0), 0);

  const rows: FlowRow[] = days.map((d) => ({
    day: d.day - startDay,
    events: d.events,
    txs: d.txs ?? null,
    cum: { ...d.cum },
    cells: d.cumAsset ?? [],
  }));
  const lastDay = rows[rows.length - 1].day;
  // A row whose events equal the row before's holds a balance the protocol set
  // with no event (Aave V3 Core's GHO discount settlement, 3 Jul 2025): the
  // balances read it, but it is not an event day and draws no tick.
  const stepOnly = (i: number) => i > 0 && days[i].events === days[i - 1].events;
  const eventDays = rows.filter((_, i) => !stepOnly(i)).map((r) => r.day);

  // Held balances after the last active day, to see whether the slider runs on.
  const heldEnd = new Map<string, number>();
  for (const d of days) for (const b of d.balances) heldEnd.set(`${b.side}:${b.asset}`, b.amount);
  const stillHeld = [...heldEnd.values()].some((v) => v > 0);
  const liveStop = t.today != null && stillHeld ? Math.max(lastDay + 1, t.today - startDay) : lastDay + 1;

  // Each asset's daily observations as stops, ascending.
  const series = new Map<string, { day: number; usd: number }[]>();
  for (const [asset, obs] of Object.entries(t.dailyPrices ?? {}))
    series.set(
      asset,
      obs
        .map(([d, usd]) => ({ day: d - startDay, usd }))
        .filter((o) => o.usd > 0)
        .sort((a, b) => a.day - b.day),
    );
  const seriesAt = (asset: string, stop: number, from: { i: number }): PriceAt | null => {
    const obs = series.get(asset);
    if (!obs) return null;
    while (from.i + 1 < obs.length && obs[from.i + 1].day <= stop) from.i++;
    const o = obs[from.i];
    return o && o.day <= stop ? { usd: o.usd, ts: (startDay + o.day) * DAY_S, day: o.day, series: true } : null;
  };

  const held = new Map<string, { symbol: string; side: FlowSide; amount: number; index?: number; day: number }>();
  const eventPrice = new Map<string, PriceAt>();
  const seriesCursor = new Map<string, { i: number }>();
  const valued: FlowModel["valued"] = [];
  const heldAt: FlowAssetHeld[][] = [];
  const stale = new Map<number, StalePrice[]>();
  type Reason = { side: FlowSide; why: string; symbol?: string };
  const same = (a: Reason, b: Reason) => a.side === b.side && a.why === b.why && a.symbol === b.symbol;
  const unsure = new Map<number, Reason[]>();
  const unsureFlows: FlowModel["unsureFlows"] = [];
  /** Reasons that stand from an event day until the next one (`untilNext`). */
  let standing: Reason[] = [];
  const repricings: Repricing[] = [];
  let prevPrice = new Map<string, PriceAt>();
  let di = 0;

  for (let stop = 0; stop < liveStop; stop++) {
    const unsureHere: Reason[] = [];
    const note = (r: Reason) => {
      if (!unsureHere.some((u) => same(u, r))) unsureHere.push(r);
    };
    const reason = (u: FlowUnsure): Reason => ({ side: u.side, why: u.why, ...(u.symbol ? { symbol: u.symbol } : {}) });
    if (di < days.length && days[di].day - startDay === stop) {
      const d = days[di++];
      standing = (d.unsure ?? []).filter((u) => u.untilNext).map(reason);
      for (const u of d.unsure ?? []) {
        if (u.held || u.untilNext) note(reason(u));
        if (!unsureFlows.some((f) => same(f, reason(u)))) unsureFlows.push({ stop, ...reason(u) });
      }
      for (const p of d.prices)
        if (p.usd > 0) eventPrice.set(p.asset, { usd: p.usd, ts: p.ts, day: utcDay(p.ts) - startDay, series: false });
      for (const b of d.balances)
        held.set(`${b.side}:${b.asset}`, {
          symbol: b.symbol,
          side: b.side,
          amount: b.amount,
          ...(b.index != null ? { index: b.index } : {}),
          day: d.day,
        });
    } else for (const u of standing) note(u);
    const priceNow = new Map<string, PriceAt>();
    let coll = 0;
    let debt = 0;
    const staleHere: StalePrice[] = [];
    const lines: {
      asset: string;
      h: { symbol: string; side: FlowSide; amount: number };
      usd: number;
      p: PriceAt | undefined;
      grown?: FlowGrowth;
    }[] = [];
    for (const [key, recorded] of held) {
      if (!(recorded.amount > 0)) continue;
      const asset = key.slice(key.indexOf(":") + 1);
      // Interest since the event that recorded it, where the indexes say.
      const g = grownBalance(
        t.indexes,
        asset,
        recorded.side,
        recorded.amount,
        recorded.day,
        recorded.index,
        startDay + stop,
      );
      const h = { symbol: recorded.symbol, side: recorded.side, amount: g.amount };
      let p = priceNow.get(asset);
      if (!p) {
        const cursor = seriesCursor.get(asset) ?? { i: 0 };
        seriesCursor.set(asset, cursor);
        const s = seriesAt(asset, stop, cursor);
        const e = eventPrice.get(asset);
        // The newer of the two; on one day the series (the day's end) wins.
        const best = s && e ? (e.day > s.day ? e : s) : (s ?? e ?? null);
        if (best) {
          p = best;
          priceNow.set(asset, best);
        }
      }
      const usdPer = p?.usd ?? t.todayPrices?.[asset] ?? 0;
      const usd = h.amount * usdPer;
      if (h.side === "collateral") coll += usd;
      else debt += usd;
      lines.push({ asset, h, usd, p, ...(g.grown ? { grown: g.grown } : {}) });
      // A price from an earlier day, where only the events record one.
      const carried = t.carriedWhy?.[asset];
      if (carried && p && p.day < stop && usd >= STALE_FLOOR_USD)
        note({ side: h.side, why: `${h.symbol} is valued at its price of ${dayStampOf(p.ts)}: ${carried}` });
      if (p && usd >= STALE_FLOOR_USD) {
        const old = daily ? stop - p.day > gapDays : (startDay + stop + 1) * DAY_S - p.ts > gapDays * DAY_S;
        if (old) staleHere.push({ symbol: h.symbol, side: h.side, pricedAt: p.ts, usd });
      }
    }
    // A repricing: a held asset whose price was stale at the previous stop
    // gets a newer one, and the step moves its side by REPRICE_SHARE or more.
    if (stop > 0) {
      const before = valued[stop - 1];
      for (const { asset, h } of lines) {
        const was = prevPrice.get(asset);
        const now = priceNow.get(asset);
        if (!was || !now || now.ts <= was.ts) continue;
        const staleBefore = daily
          ? stop - 1 - was.day > gapDays
          : (startDay + stop) * DAY_S - was.ts > gapDays * DAY_S || now.ts - was.ts > gapDays * DAY_S;
        if (!staleBefore) continue;
        const step = Math.abs(h.amount * (now.usd - was.usd));
        const sideUsd = h.side === "collateral" ? before.collateral : before.debt;
        if (
          step >= STALE_FLOOR_USD &&
          step >= sideUsd * REPRICE_SHARE &&
          !repricings.some((r) => r.day === stop && r.symbol === h.symbol)
        )
          repricings.push({ day: stop, symbol: h.symbol, from: was.ts });
      }
    }
    // Only what was held at this stop can be repriced at the next.
    prevPrice = priceNow;
    valued.push({ collateral: coll, debt });
    heldAt.push(
      lines.map(({ h, usd, p, grown }) => ({
        side: h.side,
        symbol: h.symbol,
        amount: h.amount,
        usd,
        ...(p ? { priced: { day: utcDay(p.ts), series: p.series } } : {}),
        ...(grown ? { grown } : {}),
      })),
    );
    if (staleHere.length) stale.set(stop, staleHere);
    if (unsureHere.length) unsure.set(stop, unsureHere);
  }

  const last = rows[rows.length - 1];
  const today = {
    collateral: t.live.collateralUsd + outOf("collateral", last.cum),
    debt: t.live.debtUsd + outOf("debt", last.cum),
  };
  let peak = Math.max(today.collateral, today.debt);
  const sidePeak = { collateral: today.collateral, debt: today.debt };
  let ri = 0;
  for (let stop = 0; stop < liveStop; stop++) {
    while (ri + 1 < rows.length && rows[ri + 1].day <= stop) ri++;
    const c = rows[ri].cum;
    const coll = valued[stop].collateral + outOf("collateral", c);
    const owed = valued[stop].debt + outOf("debt", c);
    peak = Math.max(peak, coll, owed);
    sidePeak.collateral = Math.max(sidePeak.collateral, coll);
    sidePeak.debt = Math.max(sidePeak.debt, owed);
  }
  // An exact inflow can exceed its bar where a price fell; the drill-down
  // strip clamps to the bar, so the axis follows the bars alone.
  return {
    ...(t.unit ? { unit: t.unit } : {}),
    ...(t.sideUnits
      ? {
          sideUnits: t.sideUnits,
          sideAxes: { collateral: axisFor(sidePeak.collateral), debt: axisFor(sidePeak.debt) },
        }
      : {}),
    buckets: t.buckets,
    rows,
    start,
    lastDay,
    liveStop,
    eventDays,
    ticks: days.flatMap((d, i) => {
      if (stepOnly(i)) return [];
      const prev = days[i - 1];
      const kinds: string[] = [];
      for (const b of t.buckets) {
        const word = b.event ?? b.label;
        // An empty event name: a bucket that moves on most events (interest)
        // names none.
        if (!word) continue;
        const now = d.cum[b.key];
        if (now != null && Math.abs(now - (prev?.cum[b.key] ?? 0)) > 1e-9 && !kinds.includes(word)) kinds.push(word);
      }
      for (const r of d.rates ?? []) kinds.push(RATE_WORD[r]);
      return [{ day: d.day - startDay, tick: d.tick, kinds }];
    }),
    repricings,
    live: t.live,
    valued,
    stale,
    unsure,
    unsureFlows,
    daily,
    gapDays,
    totalEvents: t.totalEvents ?? last.events,
    totalTxs: t.totalTxs ?? last.txs ?? null,
    labels: t.labels ?? { collateral: "Collateral", debt: "Debt" },
    words: t.words ?? {},
    ...(t.addresses ? { addresses: t.addresses } : {}),
    heldAt,
    liveHeld: t.live.assets ?? liveHeldFromBalances(held, t.todayPrices, heldAt[heldAt.length - 1] ?? []),
    axis: axisFor(peak),
    today,
  };
}

/** The live stop's assets where the ledger names none: the last balances at
 *  today's price, else at the last stop's. */
function liveHeldFromBalances(
  held: Map<string, { symbol: string; side: FlowSide; amount: number }>,
  todayPrices: Record<string, number> | undefined,
  last: FlowAssetHeld[],
): FlowAssetHeld[] {
  const out: FlowAssetHeld[] = [];
  for (const [key, h] of held) {
    if (!(h.amount > 0)) continue;
    const asset = key.slice(key.indexOf(":") + 1);
    const p = todayPrices?.[asset];
    const prev = last.find((x) => x.side === h.side && x.symbol === h.symbol);
    const usd = typeof p === "number" && p > 0 ? h.amount * p : (prev?.usd ?? 0);
    out.push({ side: h.side, symbol: h.symbol, amount: h.amount, usd });
  }
  return out;
}

/** Each asset's part of the position at a stop: what is held and owed, and
 *  each bucket's running USD by symbol. */
export function assetsAt(
  m: FlowModel,
  stop: number,
): { held: FlowAssetHeld[]; flows: Map<string, { symbol: string; usd: number }[]> } {
  const isLive = stop >= m.liveStop;
  const upto = isLive ? m.rows.length - 1 : rowAt(m, stop);
  const cells = new Map<string, { bucket: string; symbol: string; usd: number }>();
  for (let i = 0; i <= upto; i++) for (const c of m.rows[i].cells) cells.set(`${c.bucket}|${c.symbol}`, c);
  if (isLive)
    for (const p of m.live.pending ?? []) {
      const k = `${p.bucket}|${p.symbol}`;
      const had = cells.get(k);
      cells.set(k, { bucket: p.bucket, symbol: p.symbol, usd: (had?.usd ?? 0) + p.usd });
    }
  const flows = new Map<string, { symbol: string; usd: number }[]>();
  for (const c of cells.values()) {
    if (!(Math.abs(c.usd) >= 0.005)) continue;
    const list = flows.get(c.bucket) ?? [];
    list.push({ symbol: c.symbol, usd: c.usd });
    flows.set(c.bucket, list);
  }
  for (const list of flows.values()) list.sort((a, b) => b.usd - a.usd);
  const held = (isLive ? m.liveHeld : (m.heldAt[Math.max(0, Math.min(stop, m.heldAt.length - 1))] ?? []))
    .filter((h) => h.usd >= 0.005 || (h.amount ?? 0) > 0)
    .sort((a, b) => b.usd - a.usd);
  return { held, flows };
}

/** Index of the last row on or before the end of day `stop`, or -1. */
function rowAt(m: FlowModel, stop: number): number {
  let lo = 0;
  let hi = m.rows.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (m.rows[mid].day <= stop) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Lay exact sources end to end within `total`, then the balancing item.
 *  Each width is clamped to what the bar has left; the value stays signed. */
function sourcesFor(
  exact: FlowSegment[],
  total: number,
  balancing: { key: string; label: string; value: number; signed?: boolean; note?: string; basis?: string },
): FlowSegment[] {
  let left = Math.max(0, total);
  const out: FlowSegment[] = [];
  for (const s of exact) {
    const w = Math.min(Math.max(0, s.value), left);
    left -= w;
    out.push({ ...s, width: w });
  }
  const w = Math.min(Math.max(0, balancing.value), left);
  out.push({ ...balancing, fill: "estimate", width: w });
  return out;
}

function sideState(
  m: FlowModel,
  side: FlowSide,
  cum: Record<string, number>,
  now: number,
  interest: number | null,
): FlowSideState {
  const bs = m.buckets.filter((b) => b.side === side);
  const outs = bs.filter((b) => b.dir === "out");
  const ins = bs.filter((b) => b.dir === "in");
  const heldNow = Math.max(0, now);
  const out = outs.reduce((s, b) => s + Math.max(0, cum[b.key] ?? 0), 0);
  const total = heldNow + out;
  const bar: FlowSegment[] = [
    {
      key: `${side}-held`,
      label: side === "collateral" ? (m.words.held ?? "Still supplied") : "Still owed",
      fill: "held",
      width: heldNow,
      value: heldNow,
      ...(m.words.heldBasis?.[side] ? { basis: m.words.heldBasis[side] } : {}),
    },
    ...outs.map((b) => {
      const v = Math.max(0, cum[b.key] ?? 0);
      return {
        key: b.key,
        label: b.label,
        fill: "out" as const,
        tone: b.tone ?? "exit",
        hatch: b.hatch,
        link: b.link,
        width: v,
        value: v,
      };
    }),
  ];
  const exact: FlowSegment[] = ins.map((b) => {
    const v = cum[b.key] ?? 0;
    return { key: b.key, label: b.label, fill: "in", ...(b.hatch ? { hatch: b.hatch } : {}), width: v, value: v };
  });
  if (m.opening) {
    const v = side === "collateral" ? m.opening.collateral : m.opening.debt;
    exact.unshift({
      key: `${side}-opening`,
      label: `Held on ${longDay(m.opening.ts)}`,
      fill: "in",
      hatch: "rings",
      width: v,
      value: v,
    });
  }
  const rest = total - exact.reduce((s, x) => s + x.value, 0);
  const oneRest = side === "collateral" ? m.words.rest : undefined;
  const named = m.words.restBySide?.[side];
  const words = {
    ...(m.words.restNote?.[side] ? { note: m.words.restNote[side] } : {}),
    ...(m.words.basis?.[side] ? { basis: m.words.basis[side] } : {}),
  };
  const balancing = oneRest
    ? {
        key: interest != null ? `${side}-interest` : `${side}-market`,
        label: oneRest,
        value: interest ?? rest,
        ...words,
      }
    : { key: `${side}-market`, label: named ?? "Market move and interest", value: rest, signed: true, ...words };
  return { now: heldNow, total, out, bar, sources: sourcesFor(exact, total, balancing) };
}

/** One side's bar and sources for a set of running totals and what is held
 *  or owed, as `stateAt` builds each stop's: the event card's lifetime sum
 *  (lib/shared/flow-focus.ts) reads a side at one event with it. */
export function sideStateFor(m: FlowModel, side: FlowSide, cum: Record<string, number>, now: number): FlowSideState {
  return sideState(m, side, cum, now, null);
}

/** The position as of the end of day `stop` (0 = the first event's day), or
 *  at live prices at `m.liveStop`. */
export function stateAt(m: FlowModel, stop: number): FlowState {
  const isLive = stop >= m.liveStop;
  const i = isLive ? m.rows.length - 1 : rowAt(m, stop);
  const row = i >= 0 ? m.rows[i] : null;
  let cum = row?.cum ?? Object.fromEntries(m.buckets.map((b) => [b.key, 0]));
  if (isLive && m.live.pending?.length) {
    cum = { ...cum };
    for (const p of m.live.pending) cum[p.bucket] = (cum[p.bucket] ?? 0) + p.usd;
  }
  const v = !isLive && stop >= 0 ? m.valued[Math.min(stop, m.valued.length - 1)] : undefined;
  const collNow = isLive ? m.live.collateralUsd : (v?.collateral ?? 0);
  const debtNow = isLive ? m.live.debtUsd : (v?.debt ?? 0);
  return {
    stop: Math.min(stop, m.liveStop),
    isLive,
    count: row?.events ?? 0,
    txs: m.totalTxs == null ? null : (row?.txs ?? 0),
    collateral: sideState(m, "collateral", cum, collNow, isLive ? (m.live.collateralInterestUsd ?? null) : null),
    debt: sideState(m, "debt", cum, debtNow, null),
    stale: isLive ? [] : (m.stale.get(stop) ?? []),
  };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Feb '26": the timeline's day stamp. */
const dayStampOf = (tsSec: number): string => {
  const d = new Date(tsSec * 1000);
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(-2)}`;
};

/** The readout's price label at a stop (rails-ops
 *  reference/lifetime-flows-scrubber.md, "Prices"): "Old price" where a held
 *  asset is on an old price, else "Repriced" on a day that gave one a newer
 *  price; `lines` are its tip, naming each asset and its price's day. Null on
 *  other stops and at the live one. */
export function oldPriceAt(m: FlowModel, stop: number): { word: "Old price" | "Repriced"; lines: string[] } | null {
  if (stop < 0 || stop >= m.liveStop) return null;
  const stale = m.stale.get(stop) ?? [];
  const repriced = m.repricings.filter((r) => r.day === stop);
  if (stale.length === 0 && repriced.length === 0) return null;
  const lines = repriced.map((r) => `${r.symbol} repriced on this day, last priced ${dayStampOf(r.from)}.`);
  if (stale.length > 0)
    lines.push(
      `${m.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${stale
        .map((x) => `${x.symbol} from ${dayStampOf(x.pricedAt)}`)
        .join(", ")}.`,
    );
  return { word: stale.length > 0 ? "Old price" : "Repriced", lines };
}

/** What a side's figures at a stop rest on that the page could not read:
 *  `held`, the held or owed figure there (the line dashed into that day);
 *  `flows`, the flows the bar counts by then. At the live stop the figure is
 *  the live read's, and every reason the history has counts for the flows. */
export function unsureAt(m: FlowModel, stop: number, side: FlowSide): { held: string[]; flows: string[] } {
  const live = stop >= m.liveStop;
  const held = live ? [] : (m.unsure.get(stop) ?? []).filter((u) => u.side === side);
  const flows = m.unsureFlows.filter(
    (u) => u.side === side && (live || u.stop <= stop) && !held.some((h) => h.why === u.why && h.symbol === u.symbol),
  );
  return { held: reasonWords(held), flows: reasonWords(flows) };
}

/** One sentence per reason, the assets it names first ("WETH and USDC
 *  priced at the day's close: …"). */
function reasonWords(rs: { why: string; symbol?: string }[]): string[] {
  const by = new Map<string, string[]>();
  for (const r of rs) {
    const list = by.get(r.why) ?? [];
    if (r.symbol && !list.includes(r.symbol)) list.push(r.symbol);
    by.set(r.why, list);
  }
  return [...by].map(([why, syms]) =>
    syms.length === 0
      ? why
      : `${syms.length === 1 ? syms[0] : `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`} ${why}`,
  );
}

/** The headline's mark at a stop: every reason a side's figure or its bar is
 *  not complete, the held figure's first. */
export const partialAt = (m: FlowModel, stop: number, side: FlowSide): string[] => {
  const u = unsureAt(m, stop, side);
  return [...u.held, ...u.flows];
};

/** "3 Mar 2025": the window's dates. */
export function longDay(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The model cut to the stops from `from` (a stop index) to the live one:
 *  each running total less what it stood at when the window opens, the
 *  counts kept whole, and the axis fixed to the window's own bars. What was
 *  held and owed at the close of the day before is `opening`, from the same
 *  replay. `from` at or before 0 returns the model unchanged. */
export function windowModel(m: FlowModel, from: number): FlowModel {
  if (from <= 0 || from >= m.liveStop) return m;
  const base = rowAt(m, from - 1);
  const baseCum: Record<string, number> = base >= 0 ? m.rows[base].cum : {};
  const baseCells = new Map<string, number>();
  for (let i = 0; i <= base; i++) for (const c of m.rows[i].cells) baseCells.set(`${c.bucket}|${c.symbol}`, c.usd);
  const less = (cum: Record<string, number>) =>
    Object.fromEntries(Object.entries(cum).map(([k, v]) => [k, v - (baseCum[k] ?? 0)]));
  const rows = m.rows
    .filter((r) => r.day >= from)
    .map((r) => ({
      ...r,
      day: r.day - from,
      cum: less(r.cum),
      cells: r.cells.map((c) => ({ ...c, usd: c.usd - (baseCells.get(`${c.bucket}|${c.symbol}`) ?? 0) })),
    }));
  if (rows.length === 0) return m;
  const shift = <T extends { day: number }>(xs: T[]) =>
    xs.filter((x) => x.day >= from).map((x) => ({ ...x, day: x.day - from }));
  const outOf = (side: FlowSide, c: Record<string, number>) =>
    m.buckets.filter((b) => b.side === side && b.dir === "out").reduce((s, b) => s + (c[b.key] ?? 0), 0);
  const liveStop = m.liveStop - from;
  const valued = m.valued.slice(from);
  const last = rows[rows.length - 1];
  const today = {
    collateral: m.live.collateralUsd + outOf("collateral", last.cum),
    debt: m.live.debtUsd + outOf("debt", last.cum),
  };
  let peak = Math.max(today.collateral, today.debt);
  const sidePeak = { collateral: today.collateral, debt: today.debt };
  let ri = 0;
  for (let stop = 0; stop < liveStop; stop++) {
    while (ri + 1 < rows.length && rows[ri + 1].day <= stop) ri++;
    const c = rows[ri].day <= stop ? rows[ri].cum : {};
    const coll = valued[stop].collateral + outOf("collateral", c);
    const owed = valued[stop].debt + outOf("debt", c);
    peak = Math.max(peak, coll, owed);
    sidePeak.collateral = Math.max(sidePeak.collateral, coll);
    sidePeak.debt = Math.max(sidePeak.debt, owed);
  }
  const before = m.valued[from - 1];
  const baseRow = base >= 0 ? m.rows[base] : null;
  return {
    ...m,
    rows,
    start: m.start + from * DAY_MS,
    lastDay: m.lastDay - from,
    liveStop,
    eventDays: m.eventDays.filter((d) => d >= from).map((d) => d - from),
    ticks: shift(m.ticks),
    repricings: shift(m.repricings),
    valued,
    stale: new Map([...m.stale].filter(([d]) => d >= from).map(([d, v]) => [d - from, v])),
    unsure: new Map([...m.unsure].filter(([d]) => d >= from).map(([d, v]) => [d - from, v])),
    // A reason before the window stands from its opening: the bars there count what it left.
    unsureFlows: m.unsureFlows.map((u) => ({ ...u, stop: Math.max(0, u.stop - from) })),
    heldAt: m.heldAt.slice(from),
    axis: axisFor(peak),
    ...(m.sideAxes ? { sideAxes: { collateral: axisFor(sidePeak.collateral), debt: axisFor(sidePeak.debt) } } : {}),
    today,
    opening: {
      ts: (m.start + from * DAY_MS) / 1000,
      collateral: before?.collateral ?? 0,
      debt: before?.debt ?? 0,
      held: m.heldAt[from - 1] ?? [],
      events: baseRow?.events ?? 0,
      txs: baseRow?.txs ?? null,
    },
  };
}

/** The event day before `stop`, or 0 when there is none. */
export function prevEventDay(m: FlowModel, stop: number): number {
  let t = 0;
  for (const d of m.eventDays) if (d < stop) t = d;
  return t;
}

/** The event day after `stop`, or the live stop after the last one. */
export function nextEventDay(m: FlowModel, stop: number): number {
  for (const d of m.eventDays) if (d > stop) return d;
  return m.liveStop;
}

/** Unix seconds of the start of day `stop`. */
export const dayStart = (m: FlowModel, stop: number): number => (m.start + stop * DAY_MS) / 1000;

/** "$123k" · "$5.5k" · "$363" · "$1.2M" · "$1.89B" · "−$5k": whole dollars
 *  under $1k, one decimal under $10k, whole thousands under $1M, one decimal
 *  of millions under $1B, then billions to two decimals with a trailing zero
 *  dropped ("$1.0B", "$1.5B", "$1.89B"). */
export function formatFlowUsd(v: number, unit?: FlowUnit): string {
  if (unit) return formatFlowToken(v, unit);
  const a = Math.abs(v);
  const sign = v < 0 && a >= 0.5 ? "−" : "";
  let body: string;
  if (a >= 999_950_000) body = `$${(a / 1e9).toFixed(2).replace(/(\.\d)0$/, "$1")}B`;
  else if (a >= 1_000_000) body = `$${(a / 1_000_000).toFixed(1)}M`;
  else if (a >= 9_999.5) body = `$${Math.round(a / 1_000)}k`;
  else if (a >= 999.5) body = `$${(a / 1_000).toFixed(1)}k`;
  else body = `$${Math.round(a)}`;
  return sign + body;
}

/** "211 thousand dollars" — a figure for a screen reader. */
export function spokenUsd(v: number, unit?: FlowUnit): string {
  if (unit) return spokenToken(v, unit);
  const a = Math.abs(v);
  const sign = v < 0 ? "minus " : "";
  if (a >= 999_950_000) return `${sign}${(a / 1e9).toFixed(2).replace(/(\.\d)0$/, "$1")} billion dollars`;
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)} million dollars`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)} thousand dollars`;
  return `${sign}${Math.round(a)} dollars`;
}

// ── A token axis ────────────────────────────────────────────────────────────
// A family that states its flows in a token (Morpho, in each market's loan
// token) sets `FlowTimeline.unit`: every figure in the model is that token in
// units of 10^-scale (grains), so the whole-unit rounding the sums use
// (lib/shared/flows-sum.ts) rounds to the token's printed decimals and the
// printed lines still add to the printed total.

/** A side's token: its own where the sides have none in common
 *  (`FlowTimeline.sideUnits`), else the model's. */
export const unitOf = (m: Pick<FlowModel, "unit" | "sideUnits">, side: FlowSide): FlowUnit | undefined =>
  m.sideUnits?.[side] ?? m.unit;

/** A side's bar axis: its own where the sides have no common unit, else the
 *  shared one. */
export const sideAxis = (m: Pick<FlowModel, "axis" | "sideAxes">, side: FlowSide): { max: number; ticks: number[] } =>
  m.sideAxes?.[side] ?? m.axis;

/** Grains to the token. */
export const unitAmount = (v: number, unit: FlowUnit): number => v / 10 ** unit.scale;

/** "12.3k USDC" · "4.21 WETH" · "0.0315 WBTC": the token at about three
 *  significant digits, thousands and millions shortened as the dollars are. */
export function formatFlowToken(v: number, unit: FlowUnit, symbol = true): string {
  const x = unitAmount(v, unit);
  const a = Math.abs(x);
  const sign = x < 0 && a >= 0.5 / 10 ** unit.scale ? "−" : "";
  let body: string;
  if (a >= 999_950_000) body = `${(a / 1e9).toFixed(2).replace(/(\.\d)0$/, "$1")}B`;
  else if (a >= 1_000_000) body = `${(a / 1_000_000).toFixed(1)}M`;
  else if (a >= 9_999.5) body = `${Math.round(a / 1_000)}k`;
  else if (a >= 999.5) body = `${(a / 1_000).toFixed(1)}k`;
  else if (a >= 99.95) body = `${Math.round(a)}`;
  else if (a >= 9.995) body = a.toFixed(1);
  else if (a >= 0.9995) body = a.toFixed(2);
  else if (a === 0) body = "0";
  else body = a.toLocaleString("en-US", { maximumSignificantDigits: 3 });
  return `${sign}${body}${symbol ? ` ${unit.symbol}` : ""}`;
}

/** "12 thousand USDC" — a token figure for a screen reader. */
export function spokenToken(v: number, unit: FlowUnit): string {
  const x = unitAmount(v, unit);
  const a = Math.abs(x);
  const sign = x < 0 ? "minus " : "";
  if (a >= 999_950_000) return `${sign}${(a / 1e9).toFixed(2).replace(/(\.\d)0$/, "$1")} billion ${unit.symbol}`;
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)} million ${unit.symbol}`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)} thousand ${unit.symbol}`;
  return `${sign}${formatFlowToken(Math.abs(v), unit, false)} ${unit.symbol}`;
}

/** The scale that prints a token axis at about five significant digits of
 *  its largest figure, `peak` in tokens. */
export function unitScaleFor(peak: number): number {
  if (!(peak > 0)) return 2;
  return Math.max(0, Math.min(8, 4 - Math.floor(Math.log10(peak))));
}
