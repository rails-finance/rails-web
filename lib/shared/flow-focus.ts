// The Lifetime flows panel and the timeline under it, tied together by the day
// (rails-ops TO-DO-ui-jobs 141, reference/lifetime-flows-scrubber.md, "The day
// links the chart and the timeline"): the chart's "Apply to timeline" cuts the
// timeline at its cursor's day close, and a day mark's button on the timeline
// freezes the chart's cursor there. Freezing the chart cuts nothing. An event
// card states the side's lifetime sum as of that event, from the same day rows
// the bars read and the legs of the events on the page.
//
// Pure, tested offline (scripts/verify/verify-lifetime-flows-state.ts); the
// store at the foot is the one piece of state the panel, the timeline and the
// cards share (components/shared/flow-focus-context.tsx).

import {
  apportionSigned,
  wholeUsd,
  sideSumRows,
  type SideSumRows,
  type SumLine,
  type SumSign,
} from "@/lib/shared/flows-sum";
import {
  DAY_MS,
  sideStateFor,
  type FlowBucket,
  type FlowModel,
  type FlowSegment,
  type FlowSide,
} from "@/lib/shared/flows-timeline";

/** One event of the page as the flow lines read it: the buckets its legs
 *  fill, each in USD at the price its event carries (null where no price). */
export interface FocusEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  /** The transaction: a card states the account once its transaction had
   *  run, so the sum runs to the transaction's last event. */
  tx?: string;
  /** Each leg's bucket, its USD, and the token amount it moved. An
   *  `accrual` leg (a Liquity Trove's interest since its last event) is not
   *  the event's act: its line is highlighted only where it comes to a
   *  dollar. */
  legs: { bucket: string; usd: number | null; amount?: number; symbol?: string; accrual?: boolean }[];
  /** Where the family's replay states it (the Liquity family): each side's
   *  USD just before and once the event's transaction had run, at the
   *  transaction's price, its token move, and the tokens held or owed once
   *  the transaction had run (`held`). The Aave family reads these
   *  from the Pool at the block instead. */
  sides?: Record<FlowSide, { before: number; after: number; amount: number; symbol: string; held: number }>;
  /** The annual rate in percent the event left in force on the debt, the
   *  batch's management fee included, where the family records one (the
   *  Liquity family): the state card between events states it. */
  rate?: number;
}

/** Where the panel's cursor stands: the last second its figures cover, the
 *  day in words, and whether it is the live stop. */
export interface FlowCursorAt {
  endTs: number;
  word: string;
  live: boolean;
}

// ── The lifetime sum at one event ───────────────────────────────────────────

/** The running totals per bucket once the event's transaction had run
 *  (`after`), and that less this event's legs (`before`). */
export interface EventCum {
  before: Record<string, number>;
  after: Record<string, number>;
  /** False where the page does not hold every event of that day, or one had
   *  no price: the totals are then the day's close, and the card says so. */
  exact: boolean;
  /** The event's day, as a stop of the model. */
  stop: number;
  /** The buckets this event filled, and its legs. */
  buckets: Set<string>;
  legs: FocusEvent["legs"];
  /** Events after this one in the position's history. */
  later: boolean;
}

/** A leg's figure agrees with the day row's where it is within a dollar, or
 *  a hundredth of a percent of a larger move. */
const agrees = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-4);

/** The running totals around one event: the day row before its day, plus the
 *  legs of that day's events through its transaction (the account the card
 *  states is the transaction's), where the page holds all of them and
 *  they add to the day row's move; else the day's close. `events` ascending;
 *  `model` the whole life (not a window). */
export function eventCum(model: FlowModel, events: FocusEvent[], id: string): EventCum | null {
  const at = events.findIndex((e) => e.id === id);
  if (at < 0) return null;
  const ev = events[at];
  const startDay = model.start / DAY_MS;
  const stop = Math.floor(ev.ts / 86_400) - startDay;
  const ri = model.rows.findIndex((r) => r.day === stop);
  if (ri < 0) return null;
  const row = model.rows[ri];
  const prev: Record<string, number> = ri > 0 ? model.rows[ri - 1].cum : {};
  const keys = model.buckets.map((b) => b.key);
  const sameDay = events.filter((e) => Math.floor(e.ts / 86_400) - startDay === stop);
  const add = (into: Record<string, number>, e: FocusEvent, sign = 1) => {
    for (const l of e.legs) if (l.usd != null && l.bucket in into) into[l.bucket] += sign * l.usd;
  };
  const priced = sameDay.every((e) => e.legs.every((l) => l.usd != null));
  const dayMove: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const e of sameDay) add(dayMove, e);
  const exact = priced && keys.every((k) => agrees(dayMove[k], (row.cum[k] ?? 0) - (prev[k] ?? 0)));
  const after: Record<string, number> = Object.fromEntries(keys.map((k) => [k, prev[k] ?? 0]));
  if (exact) {
    // Through this event and the rest of its transaction.
    let last = sameDay.findIndex((e) => e.id === id);
    while (ev.tx && last + 1 < sameDay.length && sameDay[last + 1].tx === ev.tx) last++;
    for (let i = 0; i <= last; i++) add(after, sameDay[i]);
  } else for (const k of keys) after[k] = row.cum[k] ?? 0;
  const before = { ...after };
  add(before, ev, -1);
  return {
    before,
    after,
    exact,
    stop,
    buckets: new Set(ev.legs.filter((l) => !(l.accrual && Math.abs(l.usd ?? 0) < 0.5)).map((l) => l.bucket)),
    legs: ev.legs,
    later: at < events.length - 1 || ri < model.rows.length - 1,
  };
}

/** A line of the event card's sum: the panel's line, and on this event's
 *  line what it stood at just before the event. */
export type EventSumLine = SumLine & { hl: boolean; before: string | null };

/** One side's sum as of the event: every line in whole dollars landing on
 *  `held`, what the side holds or owes once the event had run (the card's
 *  figure), the balancing item the remainder of the printed lines. */
export function eventSideSum(
  model: FlowModel,
  side: FlowSide,
  cum: EventCum,
  held: number,
): Omit<SideSumRows, "lines"> & { lines: EventSumLine[] } {
  const st = sideStateFor(model, side, cum.after, held);
  const rows = sideSumRows(st);
  return {
    ...rows,
    lines: rows.lines.map((l) => {
      const hl = cum.buckets.has(l.key);
      return { ...l, hl, before: hl ? wholeUsd(cum.before[l.key] ?? 0) : null };
    }),
  };
}

// ── The sum in the side's token ─────────────────────────────────────────────
// Where the family's replay states each side's tokens (FocusEvent.sides, the
// Liquity family), the card's sum is in the side's token: each line the
// running total of its legs' token amounts, landing on the tokens held or
// owed once the transaction had run. The replay's legs add to its recorded
// balances, so the token lines need no balancing item; the price's effect
// (Market move) exists only in USD.

/** A line of the event card's sum in the side's token. */
export interface TokenSumLine {
  key: string;
  label: string;
  kind: "in" | "out" | "interest";
  /** Signed, in units of the printed last decimal. */
  units: number;
  sign: SumSign;
  /** Unsigned, at the side's decimals: "1.2500". */
  amount: string;
  hl: boolean;
  /** On this event's line, what it stood at just before the event. */
  before: string | null;
}

export interface TokenSum {
  symbol: string;
  decimals: number;
  lines: TokenSumLine[];
  /** What is held or owed, printed; the lines add to `units`. */
  total: { units: number; amount: string };
  /** What was held or owed just before the event's transaction, printed,
   *  where the transaction moved the side; and its signed move. */
  before: string | null;
  move: number;
  /** Each bucket's running total in tokens, unrounded. */
  after: Record<string, number>;
  held: number;
}

/** The decimals a side's token sum prints at: a $1-face side at cents, else
 *  about five significant digits of the largest figure. */
export function tokenDecimals(max: number, face: boolean): number {
  if (face) return 2;
  if (!(max > 0)) return 4;
  if (max >= 1000) return 2;
  if (max >= 100) return 3;
  if (max >= 1) return 4;
  return Math.min(8, 3 + Math.ceil(-Math.log10(max)));
}

/** "1,234.5000": unsigned, at `decimals`. */
export function fmtTokens(v: number, decimals: number): string {
  return Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const isFace = (model: FlowModel, side: FlowSide) => model.words.moment?.face?.includes(side) ?? false;

/** The last event the card's account covers: the event's transaction where
 *  the sum is exact, else the close of its day. */
function lastCovered(model: FlowModel, events: FocusEvent[], at: number, cum: EventCum): number {
  const ev = events[at];
  const startDay = model.start / DAY_MS;
  let last = at;
  if (cum.exact) while (ev.tx && last + 1 < events.length && events[last + 1].tx === ev.tx) last++;
  else while (last + 1 < events.length && Math.floor(events[last + 1].ts / 86_400) - startDay <= cum.stop) last++;
  return last;
}

/** One side's sum as of the event in its token, where the events state the
 *  side's tokens (FocusEvent.sides); null elsewhere. The lines are rounded
 *  together to the side's decimals so they add to the printed total. */
export function eventTokenSum(
  model: FlowModel,
  events: FocusEvent[],
  side: FlowSide,
  cum: EventCum,
  id: string,
): TokenSum | null {
  const at = events.findIndex((e) => e.id === id);
  const ev = events[at];
  if (!ev?.sides) return null;
  const last = lastCovered(model, events, at, cum);
  const buckets = model.buckets.filter((b) => b.side === side);
  const after: Record<string, number> = Object.fromEntries(buckets.map((b) => [b.key, 0]));
  for (let i = 0; i <= last; i++)
    for (const l of events[i].legs) if (l.bucket in after && l.amount != null) after[l.bucket] += l.amount;
  const before = { ...after };
  for (const l of ev.legs) if (l.bucket in before && l.amount != null) before[l.bucket] -= l.amount;
  const s = events[last].sides?.[side] ?? ev.sides[side];
  const held = Math.max(0, s.held);
  const ordered = [...buckets.filter((b) => b.dir === "in"), ...buckets.filter((b) => b.dir === "out")];
  const max = Math.max(held, ...ordered.map((b) => Math.abs(after[b.key])));
  const decimals = tokenDecimals(max, isFace(model, side));
  const scale = 10 ** decimals;
  const signed = ordered.map((b) => (b.dir === "out" ? -1 : 1) * after[b.key] * scale);
  const totalUnits = Math.round(held * scale);
  const parts = apportionSigned(signed, totalUnits);
  const lines: TokenSumLine[] = [];
  ordered.forEach((b, i) => {
    if (parts[i] === 0) return;
    const hl = cum.buckets.has(b.key);
    lines.push({
      key: b.key,
      label: b.label,
      kind: b.dir,
      units: parts[i],
      sign: (lines.length === 0 && parts[i] > 0 ? "" : parts[i] < 0 ? "−" : "+") as SumSign,
      amount: fmtTokens(parts[i] / scale, decimals),
      hl,
      before: hl ? fmtTokens(before[b.key], decimals) : null,
    });
  });
  const move = cum.exact ? ev.sides[side].amount : 0;
  const moved = Math.round(move * scale) !== 0;
  return {
    symbol: ev.sides[side].symbol,
    decimals,
    lines,
    total: { units: totalUnits, amount: fmtTokens(totalUnits / scale, decimals) },
    before: moved ? fmtTokens(Math.max(0, held - move), decimals) : null,
    move: moved ? move : 0,
    after,
    held,
  };
}

// ── The sum by asset (the Aave family) ──────────────────────────────────────
// A side of an Aave-family account can hold several assets, each its own
// token. Each line states its running total per asset; the interest each
// reserve's index added is the asset's balance at the block less every flow
// in it, so each asset's lines add to its balance in its token. A side
// holding one asset reads as the Liquity family's (`assetTokenSum`); with
// several, only the dollars add across them.

/** One asset of a side at the event: its balance once the transaction had
 *  run and just before it, in tokens, and the oracle price at the block. */
export interface AssetBalance {
  symbol: string;
  amount: number;
  before: number;
  price: number | null;
}

export interface AssetSumLine {
  key: string;
  label: string;
  kind: "in" | "out" | "interest";
  /** Per asset, in tokens: a flow's running total (unsigned), or the
   *  interest (signed). */
  parts: { symbol: string; amount: number }[];
  hl: boolean;
}

export interface AssetSum {
  side: FlowSide;
  lines: AssetSumLine[];
  /** Every asset the side's flows or balances name. */
  symbols: string[];
  balances: AssetBalance[];
  /** The interest line's dollars at the block's prices (an asset no longer
   *  held at the price of its latest flow); null where an asset with interest
   *  has no price. */
  interestUsd: number | null;
  /** Running tokens per bucket and asset once the transaction had run, and
   *  less this event's legs. */
  after: Record<string, Record<string, number>>;
  before: Record<string, Record<string, number>>;
}

/** The interest line's key and words. */
export const interestLine = (side: FlowSide) => ({
  key: `${side}-index-interest`,
  label: side === "collateral" ? "Interest earned" : "Interest",
});

/** One side's sum by asset as of the event; null where the page does not
 *  hold every flow before it (its legs do not meet the day rows), so the
 *  tokens cannot be counted. `balances`: the side's assets at the block. */
export function eventAssetSum(
  model: FlowModel,
  events: FocusEvent[],
  side: FlowSide,
  cum: EventCum,
  id: string,
  balances: AssetBalance[],
): AssetSum | null {
  const at = events.findIndex((e) => e.id === id);
  if (at < 0 || model.opening) return null;
  const last = lastCovered(model, events, at, cum);
  const buckets = model.buckets.filter((b) => b.side === side);
  const after: Record<string, Record<string, number>> = Object.fromEntries(buckets.map((b) => [b.key, {}]));
  const usd: Record<string, number> = Object.fromEntries(buckets.map((b) => [b.key, 0]));
  // Each asset's price at its latest flow, for the interest of an asset the
  // side no longer holds (no read at the block prices it).
  const flowPrice: Record<string, number> = {};
  for (let i = 0; i <= last; i++)
    for (const l of events[i].legs) {
      if (!(l.bucket in after)) continue;
      if (l.amount == null || !l.symbol || l.usd == null) return null;
      after[l.bucket][l.symbol] = (after[l.bucket][l.symbol] ?? 0) + l.amount;
      usd[l.bucket] += l.usd;
      if (l.amount > 0) flowPrice[l.symbol] = l.usd / l.amount;
    }
  // The page holds every flow: it holds as many events as the history has,
  // or its legs meet the running totals the card states.
  const holdsAll = model.totalEvents > 0 && events.length >= model.totalEvents;
  for (const b of buckets) {
    const want = cum.after[b.key] ?? 0;
    if (!holdsAll && Math.abs(usd[b.key] - want) > Math.max(1, Math.abs(want) * 1e-3)) return null;
  }
  const before: Record<string, Record<string, number>> = Object.fromEntries(
    buckets.map((b) => [b.key, { ...after[b.key] }]),
  );
  for (const l of events[at].legs)
    if (l.bucket in before && l.symbol && l.amount != null)
      before[l.bucket][l.symbol] = (before[l.bucket][l.symbol] ?? 0) - l.amount;
  const order = [...buckets.filter((b) => b.dir === "in"), ...buckets.filter((b) => b.dir === "out")];
  const symbols: string[] = [];
  const note = (s: string) => {
    if (!symbols.includes(s)) symbols.push(s);
  };
  for (const b of balances) if (b.amount > 0) note(b.symbol);
  for (const b of order) for (const s of Object.keys(after[b.key])) if (Math.abs(after[b.key][s]) > 1e-12) note(s);
  const lines: AssetSumLine[] = [];
  for (const b of order) {
    const parts = symbols
      .filter((s) => Math.abs(after[b.key][s] ?? 0) > 1e-12)
      .map((s) => ({ symbol: s, amount: after[b.key][s] }));
    if (parts.length > 0) lines.push({ key: b.key, label: b.label, kind: b.dir, parts, hl: cum.buckets.has(b.key) });
  }
  // Each asset's interest: its balance less every flow in it.
  const interest = symbols.map((s) => {
    let net = 0;
    for (const b of order) net += (b.dir === "out" ? -1 : 1) * (after[b.key][s] ?? 0);
    const bal = balances.find((x) => x.symbol === s);
    return { symbol: s, amount: (bal?.amount ?? 0) - net, price: bal?.price ?? flowPrice[s] ?? null };
  });
  const earned = interest.filter((p) => Math.abs(p.amount) > 1e-12);
  let interestUsd: number | null = 0;
  for (const p of earned)
    interestUsd = p.price == null || interestUsd == null ? null : interestUsd + p.amount * p.price;
  if (earned.length > 0)
    lines.push({
      ...interestLine(side),
      kind: "interest",
      parts: earned.map(({ symbol, amount }) => ({ symbol, amount })),
      hl: false,
    });
  return { side, lines, symbols, balances, interestUsd, after, before };
}

/** A side by asset that holds one asset, as a sum in that token: the lines
 *  rounded together to its decimals so they add to its balance. Null where
 *  the side names several assets. */
export function assetTokenSum(sum: AssetSum): TokenSum | null {
  if (sum.symbols.length !== 1) return null;
  const symbol = sum.symbols[0];
  const bal = sum.balances.find((b) => b.symbol === symbol);
  const held = Math.max(0, bal?.amount ?? 0);
  const signedOf = (l: AssetSumLine) => (l.kind === "out" ? -1 : 1) * (l.parts[0]?.amount ?? 0);
  const max = Math.max(held, ...sum.lines.map((l) => Math.abs(l.parts[0]?.amount ?? 0)));
  const decimals = tokenDecimals(max, false);
  const scale = 10 ** decimals;
  const totalUnits = Math.round(held * scale);
  const parts = apportionSigned(
    sum.lines.map((l) => signedOf(l) * scale),
    totalUnits,
  );
  const lines: TokenSumLine[] = [];
  sum.lines.forEach((l, i) => {
    if (parts[i] === 0) return;
    lines.push({
      key: l.key,
      label: l.label,
      kind: l.kind,
      units: parts[i],
      sign: (lines.length === 0 && parts[i] > 0 ? "" : parts[i] < 0 ? "−" : "+") as SumSign,
      amount: fmtTokens(parts[i] / scale, decimals),
      hl: l.hl,
      before: l.hl ? fmtTokens(sum.before[l.key]?.[symbol] ?? 0, decimals) : null,
    });
  });
  const move = held - Math.max(0, bal?.before ?? 0);
  const moved = Math.round(move * scale) !== 0;
  const after: Record<string, number> = {};
  for (const l of sum.lines) after[l.key] = l.parts[0]?.amount ?? 0;
  return {
    symbol,
    decimals,
    lines,
    total: { units: totalUnits, amount: fmtTokens(totalUnits / scale, decimals) },
    before: moved ? fmtTokens(Math.max(0, bal?.before ?? 0), decimals) : null,
    move: moved ? move : 0,
    after,
    held,
  };
}

/** The side's dollar lines with the interest by asset on its own line
 *  (`AssetSum.interestUsd`, at the block's prices) before the balancing
 *  item, which then holds the price's effect alone ("Market move"). Where the
 *  interest has no price, the lines are `eventSideSum`'s. */
export function eventSideSumByAsset(
  model: FlowModel,
  sum: AssetSum,
  cum: EventCum,
  held: number,
): ReturnType<typeof eventSideSum> {
  const rows = eventSideSum(model, sum.side, cum, held);
  const il = sum.lines.find((l) => l.kind === "interest");
  if (!il || sum.interestUsd == null) return rows;
  const dollars = Math.round(sum.interestUsd);
  const flows = rows.lines.filter((l) => l.kind !== "rest");
  const rest = rows.lines.find((l) => l.kind === "rest");
  const interest: EventSumLine = {
    key: il.key,
    label: il.label,
    kind: "in",
    seg: { key: il.key, label: il.label, fill: "estimate", width: 0, value: sum.interestUsd },
    dollars,
    sign: dollars < 0 ? "−" : "+",
    amount: wholeUsd(dollars),
    hl: false,
    before: null,
  };
  const lines: EventSumLine[] = dollars !== 0 ? [...flows, interest] : [...flows];
  const restDollars = rows.total.dollars - lines.reduce((a, l) => a + l.dollars, 0);
  const restSeg: FlowSegment = rest?.seg ?? {
    key: `${sum.side}-market`,
    label: "Market move",
    fill: "estimate",
    width: 0,
    value: 0,
  };
  if (restDollars !== 0)
    lines.push({
      key: restSeg.key,
      label: "Market move",
      kind: "rest",
      seg: { ...restSeg, label: "Market move", note: "the change in each asset's price since its flows" },
      dollars: restDollars,
      sign: restDollars < 0 ? "−" : "+",
      amount: wholeUsd(restDollars),
      hl: false,
      before: null,
    });
  if (lines.length > 0 && lines[0].dollars > 0) lines[0] = { ...lines[0], sign: "" };
  return { ...rows, lines };
}

// ── The shared state ────────────────────────────────────────────────────────

export interface FlowFocusState {
  cursor: FlowCursorAt | null;
  /** The chart's frozen day (absolute UTC day; today's at the live stop), or
   *  null while the cursor is not frozen. A card's chart button hides on it. */
  frozenDay: number | null;
  /** A card's "View on chart": the chart's cursor goes to that day's close
   *  and freezes there. The timeline is untouched. */
  move: { ts: number; n: number } | null;
  /** The cut applied to the timeline by the chart's "Apply to timeline": the
   *  list holds every event up to `endTs` (that day's close), named `word`
   *  ("2 Sep '26"). Null where nothing is cut. Freezing or moving the chart
   *  leaves it where it is; the chip's × clears it. The address bar carries
   *  it as `?to=2026-09-02` (`useRewindParam`). */
  rewind: { endTs: number; word: string } | null;
  /** Bumped to bring the cut's top card into view and flash its header (the
   *  chip's text). Apply cuts without it: the page stays where it is. */
  go: number;
  /** A cut restored from the address bar: the chart's cursor goes to its
   *  day (`endTs`, that day's close) and freezes there. */
  restore: { endTs: number; n: number } | null;
}

export interface FlowFocusStore {
  get: () => FlowFocusState;
  set: (patch: Partial<FlowFocusState>) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createFlowFocusStore(): FlowFocusStore {
  let state: FlowFocusState = {
    cursor: null,
    frozenDay: null,
    move: null,
    rewind: null,
    go: 0,
    restore: null,
  };
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      for (const fn of subs) fn();
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// ── The timeline's rewind ───────────────────────────────────────────────────

/** A newest-first list cut to what happened by `cut` (unix seconds); the
 *  list whole where `cut` is null. What goes is always the list's top. */
export function rewindEvents<E extends { timestamp: number }>(events: E[], cut: number | null): E[] {
  return cut == null ? events : events.filter((e) => e.timestamp <= cut);
}

/** Rows over a newest-first flat list, cut to what began by `cut`: a row
 *  stays where its oldest moment (`oldest`) is on or before the cut, and each
 *  kept row's `flatIdx` moves up by the flat events cut before it: the
 *  `removed` newest, less any a straddling row sits above. A row straddling
 *  the cut stays; its members answer the cut. */
export function rewindRows<R extends { flatIdx: number }>(
  rows: R[],
  cut: number | null,
  oldest: (row: R) => number,
  removed: number,
): R[] {
  if (cut == null) return rows;
  return rows
    .filter((r) => oldest(r) <= cut)
    .map((r) => (removed ? { ...r, flatIdx: r.flatIdx - Math.min(r.flatIdx, removed) } : r));
}
