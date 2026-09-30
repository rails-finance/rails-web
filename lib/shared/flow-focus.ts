// The Lifetime flows panel and the timeline under it, tied together by the day
// (rails-ops TO-DO-ui-jobs 141, reference/lifetime-flows-scrubber.md, "The day
// links the chart and the timeline"): the chart's "View on timeline" shows the
// cursor's day on the timeline, a day header's "View on chart" moves the
// cursor to that day's close. An event card states the side's lifetime sum as
// of that event, from the same day rows the bars read and the legs of the
// events on the page.
//
// Pure, tested offline (scripts/verify/verify-lifetime-flows-state.ts); the
// store at the foot is the one piece of state the panel, the timeline and the
// cards share (components/shared/flow-focus-context.tsx).

import { wholeUsd, sideSumRows, type SideSumRows, type SumLine } from "@/lib/shared/flows-sum";
import {
  DAY_MS,
  sideStateFor,
  stateAt,
  type FlowBucket,
  type FlowModel,
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
  /** Each leg's bucket, its USD, and the token amount it moved. */
  legs: { bucket: string; usd: number | null; amount?: number; symbol?: string }[];
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
    buckets: new Set(ev.legs.map((l) => l.bucket)),
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

/** What a side's line and its held figure have moved to since the event, at
 *  `stop` (the cursor where it stands later than the event, else today). */
export function sinceEvent(
  model: FlowModel,
  side: FlowSide,
  cum: EventCum,
  stop: number,
): { held: number; lines: { key: string; label: string; at: number; now: number }[] } {
  const s = stateAt(model, stop)[side];
  const cumNow = model.rows[rowIndexAt(model, stop)]?.cum ?? {};
  const lines: { key: string; label: string; at: number; now: number }[] = [];
  for (const b of model.buckets as FlowBucket[]) {
    if (b.side !== side) continue;
    const at = cum.after[b.key] ?? 0;
    const now = stop >= model.liveStop ? (model.rows[model.rows.length - 1].cum[b.key] ?? 0) : (cumNow[b.key] ?? 0);
    if (Math.round(now) !== Math.round(at)) lines.push({ key: b.key, label: b.label, at, now });
  }
  return { held: s.now, lines };
}

/** Index of the last row on or before day `stop`. */
function rowIndexAt(m: FlowModel, stop: number): number {
  let found = -1;
  for (let i = 0; i < m.rows.length && m.rows[i].day <= stop; i++) found = i;
  return found;
}

// ── The shared state ────────────────────────────────────────────────────────

export interface FlowFocusState {
  cursor: FlowCursorAt | null;
  /** A day header's "View on chart": the chart's cursor goes to that day's
   *  close and freezes there. */
  move: { ts: number; n: number } | null;
  /** The chart's "View on timeline": the timeline shows that day's header
   *  and opens the day's last event. */
  reveal: { ts: number; n: number } | null;
}

export interface FlowFocusStore {
  get: () => FlowFocusState;
  set: (patch: Partial<FlowFocusState>) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createFlowFocusStore(): FlowFocusStore {
  let state: FlowFocusState = { cursor: null, move: null, reveal: null };
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
