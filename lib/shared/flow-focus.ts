// The Lifetime flows panel and the timeline under it, tied together (rails-ops
// TO-DO-ui-jobs 141, reference/lifetime-flows-scrubber.md, "A segment filters
// the timeline"). A segment's click filters the timeline to that flow line's
// events up to the cursor's date; the held segment lists every event up to it.
// An event card states the side's lifetime sum as of that event, from the same
// day rows the bars read and the legs of the events on the page.
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
  legs: { bucket: string; usd: number | null }[];
}

/** A line of the panel a filter can name: a side's held segment, or a bucket. */
export interface FlowLine {
  key: string;
  side: FlowSide;
  label: string;
  kind: "held" | "in" | "out" | "rest";
}

/** The held segment's filter key. */
export const heldKey = (side: FlowSide): string => `${side}-held`;
export const isHeldKey = (key: string): boolean => key.endsWith("-held");

/** The lines of each side a filter can name, in the order the sum prints
 *  them: held first (every event), then each inflow, each outflow, and the
 *  balancing item, which records no events. */
export function flowLines(model: FlowModel): FlowLine[] {
  const out: FlowLine[] = [];
  for (const side of ["collateral", "debt"] as const) {
    const bs = model.buckets.filter((b) => b.side === side);
    if (bs.length === 0) continue;
    out.push({
      key: heldKey(side),
      side,
      label: side === "collateral" ? (model.words.held ?? "Still supplied") : "Still owed",
      kind: "held",
    });
    for (const b of bs.filter((x) => x.dir === "in")) out.push({ key: b.key, side, label: b.label, kind: "in" });
    for (const b of bs.filter((x) => x.dir === "out")) out.push({ key: b.key, side, label: b.label, kind: "out" });
    out.push({
      key: `${side}-market`,
      side,
      label:
        model.words.restBySide?.[side] ??
        (side === "collateral" ? model.words.rest : undefined) ??
        "Market move and interest",
      kind: "rest",
    });
  }
  return out;
}

/** The filter in force: a line's key and its words. */
export interface FlowFocusFilter {
  key: string;
  side: FlowSide;
  label: string;
}

/** Where the panel's cursor stands: the last second its figures cover, the
 *  day in words, and whether it is the live stop. */
export interface FlowCursorAt {
  endTs: number;
  word: string;
  live: boolean;
}

/** The chip over the filtered list: "Showing Withdrawn to 19 Jun '26". */
export function chipText(filter: FlowFocusFilter, cursor: FlowCursorAt): string {
  return `Showing ${isHeldKey(filter.key) ? "every event" : filter.label} to ${cursor.word}`;
}

/** Each event's buckets, by id. */
export function bucketsById(events: FocusEvent[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const e of events) out.set(e.id, new Set(e.legs.map((l) => l.bucket)));
  return out;
}

/** Whether an event (its id and time) is one the filter lists: on or before
 *  the cursor's date, and for a bucket's line, an event that filled it. An
 *  event the flow lines do not read (an e-mode switch) is listed by the held
 *  segment alone. */
export function filterPasses(
  filter: FlowFocusFilter,
  cursor: FlowCursorAt,
  buckets: Map<string, Set<string>>,
  id: string,
  ts: number,
): boolean {
  if (ts > cursor.endTs) return false;
  if (isHeldKey(filter.key)) return true;
  return buckets.get(id)?.has(filter.key) ?? false;
}

/** The event kinds (the timeline's action keys) that can fill a bucket, for
 *  a folder the index served, whose members are not on the page. `exact`
 *  names the buckets whose kind fills nothing else, so a folder's count of
 *  that kind is how many of its members the filter lists. */
export interface FolderKinds {
  kinds: (bucket: string) => string[];
  exact: (bucket: string) => boolean;
}

/** The Aave V3 family's (SparkLend and Aave V4 name their actions the same). */
export const AAVE_FAMILY_KINDS: FolderKinds = (() => {
  const map: Record<string, string[]> = {
    deposited: ["supply"],
    received: ["transfer_in"],
    swappedIn: ["swap"],
    withdrawn: ["withdraw"],
    soldToRepay: ["repay", "swap"],
    withdrawnSwapped: ["swap"],
    swappedOut: ["swap"],
    sent: ["transfer_out"],
    liquidatedCollateral: ["liquidation"],
    borrowed: ["borrow", "swap"],
    repaid: ["repay", "swap"],
    repaidWithCollateral: ["repay", "swap"],
    repaidBySwap: ["swap"],
    liquidatedDebt: ["liquidation"],
    writtenOff: ["bad_debt_written_off"],
  };
  const exact = new Set(["deposited", "received", "withdrawn", "sent", "liquidatedCollateral", "liquidatedDebt"]);
  return { kinds: (b) => map[b] ?? [], exact: (b) => exact.has(b) };
})();

/** A served folder under the filter: whether it stands, and how many of its
 *  members the filter lists, or null where its header cannot say (its
 *  members then answer one by one once read). */
export function folderUnderFilter(
  folder: { firstAt: number; lastAt: number; count: number; counts: { key: string; count: number }[] },
  filter: FlowFocusFilter,
  cursor: FlowCursorAt,
  kinds: FolderKinds,
): { admits: boolean; matched: number | null } {
  if (folder.firstAt > cursor.endTs) return { admits: false, matched: 0 };
  const whole = folder.lastAt <= cursor.endTs;
  if (isHeldKey(filter.key)) return { admits: true, matched: whole ? folder.count : null };
  const ks = kinds.kinds(filter.key);
  const hits = folder.counts.filter((c) => ks.includes(c.key)).reduce((n, c) => n + c.count, 0);
  if (hits === 0) return { admits: false, matched: 0 };
  return { admits: true, matched: whole && kinds.exact(filter.key) ? hits : null };
}

// ── The lifetime sum at one event ───────────────────────────────────────────

/** The running totals per bucket just before and just after one event. */
export interface EventCum {
  before: Record<string, number>;
  after: Record<string, number>;
  /** False where the page does not hold every event of that day, or one had
   *  no price: the totals are then the day's close, and the card says so. */
  exact: boolean;
  /** The event's day, as a stop of the model. */
  stop: number;
  /** The buckets this event filled. */
  buckets: Set<string>;
  /** Events after this one in the position's history. */
  later: boolean;
}

/** A leg's figure agrees with the day row's where it is within a dollar, or
 *  a hundredth of a percent of a larger move. */
const agrees = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-4);

/** The running totals around one event: the day row before its day, plus the
 *  legs of that day's events up to it, where the page holds all of them and
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
    for (const e of sameDay) {
      add(after, e);
      if (e.id === id) break;
    }
  } else for (const k of keys) after[k] = row.cum[k] ?? 0;
  const before = { ...after };
  add(before, ev, -1);
  return {
    before,
    after,
    exact,
    stop,
    buckets: new Set(ev.legs.map((l) => l.bucket)),
    later: at < events.length - 1 || ri < model.rows.length - 1,
  };
}

/** A line of the event card's sum: the panel's line, and on this event's own
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
  filter: FlowFocusFilter | null;
  cursor: FlowCursorAt | null;
  /** Bumped each time a filter is applied, so the timeline opens its latest
   *  event once per application. */
  applied: number;
  /** A card's request that the chart's cursor go to its event's day. */
  move: { ts: number; n: number } | null;
}

export interface FlowFocusStore {
  get: () => FlowFocusState;
  set: (patch: Partial<FlowFocusState>) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createFlowFocusStore(): FlowFocusStore {
  let state: FlowFocusState = { filter: null, cursor: null, applied: 0, move: null };
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
