// The timeline's Size filter (ui-jobs 752) and the notice a cut page states
// under a Size or Type filter (752, 753).
//
// Size is a KEEP-range over what one event moved, in the asset's unit: the
// listings' Size panel (lib/shared/size-dimensions.ts) with the same params
// (`debt`, `coll`), the same encodeRange values and the same chips, so
// "Debt: ≥ 10K BOLD" reads alike on a listing and a timeline. A page passes a
// figure per side: the amount an event moved on it, null where the event names
// none (it falls out of any bound, `rangeAdmits`). Type gives the direction, so
// a figure has no sign. Never valued in USD.
//
// The notice: a page holding the latest N of a longer history searches those N
// alone, in the browser. Under a Size or Type filter it says so, with the
// real numbers, so an empty or short result is never read as the whole
// history's answer.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { debtRangeFromUrl, rangeAdmits } from "@/lib/shared/size-dimensions";
import { normalizeRange } from "@/components/shared/filter-bar/types";

/** Each side is its URL param: the listings' `debt` and `coll`, and `deposit`
 *  for a Stability Pool deposit (the Trove listing's `coll` is in USD). */
export type SizeSide = "debt" | "coll" | "deposit";

/** One Size range a timeline offers. */
export interface TimelineSizeDim {
  /** The range's URL param: `?debt=`, `?coll=`, `?deposit=`. */
  side: SizeSide;
  /** The range's word: "Debt", "Collateral", "Deposited". */
  word: string;
  /** The unit the figures are in: "BOLD", "rETH". */
  unit: string;
  /** The sliders' top, in the unit. */
  top: number;
  /** What the event moved on this side, in the unit; null where it names none. */
  figure: (e: BaseActivityEvent) => number | null;
}

/** Each side's selection, one encodeRange value or []; a side absent is open. */
export type SizeRanges = Partial<Record<SizeSide, string[]>>;

export const NO_SIZE: SizeRanges = {};

/** Is any side bounded? */
export function sizeActive(ranges: SizeRanges): boolean {
  return Object.values(ranges).some((v) => (v?.length ?? 0) > 0);
}

/** Does the event sit inside every bounded side? */
export function sizePasses(e: BaseActivityEvent, dims: readonly TimelineSizeDim[], ranges: SizeRanges): boolean {
  for (const d of dims) {
    const values = ranges[d.side];
    if (!values || values.length === 0) continue;
    if (!rangeAdmits(values, d.figure(e))) return false;
  }
  return true;
}

/** The sides' selections out of the URL, as the listings read them: `debt`
 *  takes the old dropdown values too (`debtRangeFromUrl`). A side the page
 *  does not offer is not read. */
export function readSizeParams(sp: URLSearchParams, sides: readonly SizeSide[]): SizeRanges {
  const out: SizeRanges = {};
  for (const side of sides) {
    const raw = sp.get(side);
    if (raw == null) continue;
    const values = side === "debt" ? debtRangeFromUrl([raw]) : normalizeRange([raw]);
    if (values.length > 0) out[side] = values;
  }
  return out;
}

/** The selections into `sp`, each offered side set or deleted. */
export function writeSizeParams(sp: URLSearchParams, sides: readonly SizeSide[], ranges: SizeRanges): void {
  for (const side of sides) {
    const values = ranges[side] ?? [];
    if (values.length > 0) sp.set(side, values[0]);
    else sp.delete(side);
  }
}

/** The sum of an event's flows in one unit, or null where it has none (a flow
 *  whose decimals did not load is left out). */
export function flowAmountIn(e: BaseActivityEvent, symbols: readonly string[]): number | null {
  const want = new Set(symbols.map((s) => s.toLowerCase()));
  let sum: number | null = null;
  for (const f of e.flows ?? []) {
    if (f.decimalsUnread || !want.has(f.tokenSymbol.toLowerCase())) continue;
    sum = (sum ?? 0) + Math.abs(f.amountFormatted);
  }
  return sum;
}

/** What the page searched, where it holds less than the history. */
export interface SearchedNotice {
  /** The events the page holds, folder members included. */
  searched: number;
  /** The older events it does not hold; null where the page holds a window
   *  whose opening read is pending or failed, so their count is unknown. */
  older: number | null;
  /** `older` is a lower bound. */
  atLeast: boolean;
}

/**
 * The notice's numbers, or null where it does not apply: no Size or Type
 * filter on, or the page holds the whole history. A window whose opening read
 * is pending or failed (`windowUnread`) holds older events it cannot count:
 * the notice stands with `older` null.
 */
export function searchedNotice(s: {
  narrowed: boolean;
  totalCount: number;
  servedEventCount: number;
  totalKnown: boolean;
  totalIsFloor: boolean;
  windowUnread: boolean;
}): SearchedNotice | null {
  if (!s.narrowed) return null;
  if (s.windowUnread) return { searched: s.servedEventCount, older: null, atLeast: false };
  if (!s.totalKnown) return null;
  const older = s.totalCount - s.servedEventCount;
  if (older <= 0) return null;
  return { searched: s.servedEventCount, older, atLeast: s.totalIsFloor };
}

/** "Searched the latest 1,000 events. 27,179 older ones not searched.", or
 *  "Older ones not searched." where their count is unknown. */
export function searchedNoticeText(n: SearchedNotice): string {
  const f = (v: number) => v.toLocaleString("en-US");
  const head = n.searched === 1 ? "Searched the latest event." : `Searched the latest ${f(n.searched)} events.`;
  if (n.older == null) return `${head} Older ones not searched.`;
  const count = `${n.atLeast ? "At least " : ""}${f(n.older)}`;
  return `${head} ${count} older ${n.older === 1 ? "one" : "ones"} not searched.`;
}

/** The page's path to the events past its cut, where it has one: the notice's
 *  control runs `load`, and the filters apply to what lands. */
export interface TimelineLoadOlder {
  state: "idle" | "loading" | "failed";
  load: () => void;
}

/** What a timeline with no month reads says when a cut ("Sync to chart", a
 *  `?to=` link) leaves no loaded row (ui-jobs 762). With a path to the older
 *  rows: they are not loaded yet, and the control loads them (`load`). With
 *  none, the page holding a capped history: the oldest day it holds. With
 *  none and the whole history held: there are none. */
export function cutUnloadedWords(o: {
  word: string;
  /** The oldest loaded row's day in words, or null with none. */
  oldest: string | null;
  loadOlder: TimelineLoadOlder["state"] | null;
  /** The page holds the whole history: no boundary card, no older rows. */
  whole: boolean;
}): { text: string; load?: "idle" | "loading" | "failed" } {
  if (o.loadOlder) return { text: `Events on or before ${o.word} are not loaded yet.`, load: o.loadOlder };
  if (o.whole || o.oldest == null) return { text: `No events on or before ${o.word}.` };
  return { text: `This page holds events back to ${o.oldest}.` };
}
