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

export type SizeSide = "debt" | "coll";

/** One Size range a timeline offers. */
export interface TimelineSizeDim {
  /** `debt` writes `?debt=`, `coll` writes `?coll=`, the listings' params. */
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
  /** The older events it does not hold. */
  older: number;
  /** `older` is a lower bound. */
  atLeast: boolean;
}

/**
 * The notice's numbers, or null where it does not apply: no Size or Type
 * filter on, the page holds the whole history, or the total is not known yet
 * (a window whose opening balance has not landed, a month read).
 */
export function searchedNotice(s: {
  narrowed: boolean;
  totalCount: number;
  servedEventCount: number;
  totalKnown: boolean;
  totalIsFloor: boolean;
}): SearchedNotice | null {
  if (!s.narrowed || !s.totalKnown) return null;
  const older = s.totalCount - s.servedEventCount;
  if (older <= 0) return null;
  return { searched: s.servedEventCount, older, atLeast: s.totalIsFloor };
}

/** "Searched the latest 1,000 events. 27,179 older ones not searched." */
export function searchedNoticeText(n: SearchedNotice): string {
  const f = (v: number) => v.toLocaleString("en-US");
  const head = n.searched === 1 ? "Searched the latest event." : `Searched the latest ${f(n.searched)} events.`;
  const count = `${n.atLeast ? "At least " : ""}${f(n.older)}`;
  return `${head} ${count} older ${n.older === 1 ? "one" : "ones"} not searched.`;
}

/** The page's path to the events past its cut, where it has one: the notice's
 *  control runs `load`, and the filters apply to what lands. */
export interface TimelineLoadOlder {
  state: "idle" | "loading" | "failed";
  load: () => void;
}
