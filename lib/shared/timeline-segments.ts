// A heavy timeline is one segment of time, navigated by month (rails-ops
// decision 0019, amendment 2026-09-24). This module is the arithmetic behind
// the picker: the whole life's per-day counts reduced from the three
// contributors the page holds, the months those days fall in, what to ask the
// index for when a month holds more than the preload carries, and the sentence
// the page states about it. The row cap is never a number on the page: the
// page states time.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { OpeningBucket, TimelineOpeningBalance, TimelineSegmentSpan } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";

const DAY = 86_400;

export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A month as one integer, `year * 12 + month`, the key every month cell
 *  shares with the activity map. */
export const monthIdxOf = (ts: number): number => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
export const monthStartTs = (idx: number): number => Math.floor(Date.UTC(Math.floor(idx / 12), idx % 12, 1) / 1000);
export const monthEndTs = (idx: number): number =>
  Math.floor(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 1) / 1000) - 1;
export const monthLabel = (idx: number): string => `${MONTH_LONG[idx % 12]} ${Math.floor(idx / 12)}`;
export const dayStartOf = (ts: number): number => Math.floor(ts / DAY) * DAY;

/** Day-of-month, in UTC, as the page states a day ("3"). */
const dayOfMonth = (ts: number): number => new Date(ts * 1000).getUTCDate();

/** The whole life's events per UTC day, from everything the page holds: the
 *  opening balance below the cut, the served folders' own day histogram and
 *  the ungrouped events. The three partition the history, so the sum is the
 *  life. Keys are day starts in unix seconds. */
export function lifeDayCounts(
  events: readonly { timestamp: number }[],
  folders: readonly ServedFolder[] | null | undefined,
  opening: TimelineOpeningBalance | null | undefined,
): Map<number, number> {
  const days = new Map<number, number>();
  const add = (bucket: OpeningBucket) => {
    const ts = Number(bucket.key);
    if (Number.isFinite(ts)) days.set(ts, (days.get(ts) ?? 0) + bucket.count);
  };
  for (const b of opening?.byDay ?? []) add(b);
  for (const f of folders ?? []) for (const b of f.byDay) add(b);
  for (const e of events) {
    const ts = dayStartOf(e.timestamp);
    days.set(ts, (days.get(ts) ?? 0) + 1);
  }
  return days;
}

/** The same counts per month. */
export function monthCounts(lifeDays: ReadonlyMap<number, number>): Map<number, number> {
  const months = new Map<number, number>();
  for (const [day, count] of lifeDays) {
    const idx = monthIdxOf(day);
    months.set(idx, (months.get(idx) ?? 0) + count);
  }
  return months;
}

/** The first and last day the life touches, or null for an empty one. */
export function lifeExtent(lifeDays: ReadonlyMap<number, number>): { firstAt: number; lastAt: number } | null {
  let first = Infinity;
  let last = -Infinity;
  for (const [day, count] of lifeDays) {
    if (count <= 0) continue;
    if (day < first) first = day;
    if (day > last) last = day;
  }
  return Number.isFinite(first) ? { firstAt: first, lastAt: last + DAY - 1 } : null;
}

/** Events the life holds inside `[from, to]`, by day. Both ends are day
 *  aligned wherever the picker asks, so a day is in or out whole. */
export function eventsWithin(lifeDays: ReadonlyMap<number, number>, from: number, to: number): number {
  let n = 0;
  for (const [day, count] of lifeDays) if (day >= from && day <= to) n += count;
  return n;
}

/** Events the life holds on the days before the day of `ts`. */
export function eventsBefore(lifeDays: ReadonlyMap<number, number>, ts: number): number {
  const day0 = dayStartOf(ts);
  let n = 0;
  for (const [day, count] of lifeDays) if (day < day0) n += count;
  return n;
}

/**
 * What to ask the index for when a month is picked. The month whole where it
 * fits the preload; over it, the month shrinks to the newest week that holds
 * events, then to the newest day (0019, amendment 2026-09-24, rule 5). `cap`
 * is what the page learned the preload carries, in events; null when the
 * position loaded whole and nothing could be over it.
 */
export function planSegmentAsk(
  monthIdx: number,
  lifeDays: ReadonlyMap<number, number>,
  cap: number | null,
): { from: number; to: number } {
  const from = monthStartTs(monthIdx);
  const to = monthEndTs(monthIdx);
  if (cap == null || eventsWithin(lifeDays, from, to) <= cap) return { from, to };
  let newest = -Infinity;
  for (const [day, count] of lifeDays) if (count > 0 && day >= from && day <= to && day > newest) newest = day;
  if (!Number.isFinite(newest)) return { from, to };
  const weekFrom = Math.max(from, newest - 6 * DAY);
  const weekTo = newest + DAY - 1;
  if (eventsWithin(lifeDays, weekFrom, weekTo) <= cap) return { from: weekFrom, to: weekTo };
  return { from: newest, to: newest + DAY - 1 };
}

/** The segment's span for `TimelineWindow`, from a month, the ask and the
 *  life. */
export function segmentSpan(
  monthIdx: number,
  asked: { from: number; to: number },
  cutAt: number | null,
  lifeDays: ReadonlyMap<number, number>,
): TimelineSegmentSpan | null {
  const life = lifeExtent(lifeDays);
  if (!life) return null;
  const from = monthStartTs(monthIdx);
  const to = monthEndTs(monthIdx);
  return {
    month: { from, to, label: monthLabel(monthIdx), holds: eventsWithin(lifeDays, from, to) },
    asked,
    cutAt,
    eventsBefore: eventsBefore(lifeDays, cutAt ?? asked.from),
    life,
  };
}

/** "1 to 3 January", the loaded days inside the month, or "3 January" for
 *  one day: the ask, or what of it the index served when it cut the ask to
 *  the preload. Null when the month is on the page whole. */
export function loadedDaysStatement(span: TimelineSegmentSpan): string | null {
  const from = Math.max(span.asked.from, span.cutAt ?? span.asked.from);
  const to = span.asked.to;
  if (dayStartOf(from) <= span.month.from && to >= dayStartOf(span.month.to)) return null;
  const a = dayOfMonth(from);
  const b = dayOfMonth(to);
  const month = MONTH_LONG[monthIdxOf(span.month.from) % 12];
  return a === b ? `${a} ${month}` : `${a} to ${b} ${month}`;
}

/** The count line on a segment: "January 2026 holds 709 events", and when
 *  less than the month is on the page, "; loaded 1 to 3 January". */
export function segmentStatement(span: TimelineSegmentSpan): string {
  const n = span.month.holds.toLocaleString("en-US");
  const head = `${span.month.label} holds ${n} ${span.month.holds === 1 ? "event" : "events"}`;
  const loaded = loadedDaysStatement(span);
  return loaded ? `${head}; loaded ${loaded}` : head;
}

/** The newest `cap` events of a flat span answer, when the index served the
 *  span whole and the page has to hold the preload's size. Events arrive in
 *  ascending order, so the newest are the tail. Null cap keeps everything. */
export function trimToNewest<E extends BaseActivityEvent>(events: E[], cap: number | null): E[] {
  if (cap == null || events.length <= cap) return events;
  return events.slice(events.length - cap);
}
