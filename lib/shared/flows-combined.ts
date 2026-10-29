// The Lifetime flows panel's cursor (rails-ops reference/lifetime-flows-scrubber.md):
// the collateral and debt line as a strip under the bars, one cursor for both.
// ----------------------------------------------------------------------------
// The cursor stands on the line's points (a week's or a month's last day, and
// today) and on every day with events. At a stop the headlines and the bars
// are the scrubber's state at that day, `stateAt`: the balances the day's last
// event left (or the last event before it), each asset at the daily price
// recorded by that day's end. So the headlines and the bars state one figure,
// on an event day and between events alike. Before the bars' window opens the
// bars have no stop: the headlines still take the whole life's state, and the
// bars stand aside.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import { DAY_MS, stateAt, type FlowModel, type FlowState } from "@/lib/shared/flows-timeline";
import type { FlowBinSeries } from "@/lib/shared/flows-series";
import type { FlowChange } from "@/lib/shared/flows-changes";

export interface CombinedStop {
  /** The whole life's stop (day index from the first event; `liveStop` is today). */
  stop: number;
  /** The bars' stop in the windowed model, or null before the window opens. */
  barStop: number | null;
  /** The last stop: today at live prices, or the close. */
  live: boolean;
  /** The line's point that ends on this day, or null for an event day inside a bin. */
  point: number | null;
  /** The day has events. */
  event: boolean;
  /** On a closed position's live stop: the close day's stop, which it stands
   *  for. */
  close?: number;
}

/** A closed position's close day (`model.lastDay`, the last event's day,
 *  after which nothing is held), or null while anything is held. The chart
 *  ends there (rails-ops reference/lifetime-price-chart.md, ruling 14). */
export function closeStop(model: FlowModel): number | null {
  const held = model.heldAt[model.heldAt.length - 1] ?? [];
  return held.some((h) => (h.amount ?? 0) > 0) ? null : model.lastDay;
}

/** What the Lifetime flows panel draws for a life (the one-day rule, rails-ops
 *  standards/detail-page-anatomy.md, "Lifetime flows"): everything; the price
 *  chart alone; or nothing. A life whose events all fall on one UTC day draws
 *  no scrubber: closed, or open and begun today (UTC), it draws nothing; open
 *  and begun before today, the price chart alone. `today` is the UTC day
 *  number. */
export type FlowsLife = "full" | "price" | "none";

export function flowsLife(model: FlowModel, today: number): FlowsLife {
  if (model.eventDays.length > 1) return "full";
  if (closeStop(model) != null) return "none";
  return today > model.start / DAY_MS ? "price" : "none";
}

/** The protocol's changes inside the life, in block order: the list the
 *  events row draws as its diamonds (ruling 10) and the event history draws
 *  as its protocol-change rows (ui-jobs 448). From the first event's day to
 *  the close, or to today while anything is held; none where the panel
 *  draws nothing (`flowsLife`). `today` is the UTC day number. */
export function lifeChanges(model: FlowModel | null, today: number): FlowChange[] {
  if (!model || model.changes.length === 0 || flowsLife(model, today) === "none") return [];
  const start = model.start / DAY_MS;
  const close = closeStop(model);
  const end = start + (close ?? Math.max(model.liveStop, today - start));
  return model.changes.filter((c) => c.day >= start && c.day <= end).sort((a, b) => a.block - b.block);
}

/** The cursor's stops, ascending: every point of the line and every day with
 *  events, one stop per day; the last is the live stop. Without a series, the
 *  event days and the live stop. On a closed position the live stop stands
 *  on the close day, which has no other stop. `from` is the stop the bars' window opens on
 *  (0 where it covers the whole life). `extra` adds one more day (the day
 *  of a cut restored from the address bar) where it has no stop. */
export function combinedStops(
  model: FlowModel,
  series: FlowBinSeries | null,
  from: number,
  extra: number | null = null,
): CombinedStop[] {
  const startDay = model.start / DAY_MS;
  const close = closeStop(model);
  const end = close ?? model.liveStop;
  const byStop = new Map<number, { point: number | null; event: boolean }>();
  const n = series?.points.length ?? 0;
  for (let i = 0; i < n - 1; i++) {
    const stop = Math.max(0, Math.min(model.liveStop, series!.points[i][1] - startDay));
    if (stop < end) byStop.set(stop, { point: i, event: false });
  }
  for (const d of model.eventDays) {
    if (d >= end) continue;
    const had = byStop.get(d);
    byStop.set(d, { point: had?.point ?? null, event: true });
  }
  if (extra != null && extra >= 0 && extra < end && !byStop.has(extra))
    byStop.set(extra, { point: null, event: false });
  const out: CombinedStop[] = [...byStop]
    .sort((a, b) => a[0] - b[0])
    .map(([stop, { point, event }]) => ({
      stop,
      barStop: stop >= from ? stop - from : null,
      live: false,
      point,
      event,
    }));
  out.push({
    stop: model.liveStop,
    barStop: model.liveStop - from,
    live: true,
    point: n > 0 ? n - 1 : null,
    event: model.eventDays.includes(close ?? model.liveStop),
    ...(close != null ? { close } : {}),
  });
  return out;
}

/** The line strip's time axis spans at least this many days (a week, the
 *  line's shortest bin). */
export const AXIS_MIN_DAYS = 7;

/** The time axis's last day (absolute UTC): a closed position's close day,
 *  otherwise `today`. */
export function axisEndDay(model: FlowModel, today: number): number {
  const close = closeStop(model);
  return close == null ? today : model.start / DAY_MS + close;
}

/** The days the line strip's time axis spans, from the first event's day
 *  (`startDay`) to the end of `today` (absolute UTC days): the life, or
 *  AXIS_MIN_DAYS where the life is shorter, so a life shorter than a week
 *  takes its days' share of a week and the strip past today's close stays
 *  empty. */
export function axisSpanDays(startDay: number, today: number): number {
  return Math.max(AXIS_MIN_DAYS, today + 1 - startDay);
}

/** The chart's lead-in before the first event's day, a share of the axis's days. */
const LEAD_SHARE = 0.06;
const DAY_S = 86_400;

/** The chart's whole time axis in unix seconds: a lead-in before the first
 *  event's day (`startDay`), then `span` days (`axisSpanDays`). */
export function flowsBounds(startDay: number, span: number): { t0: number; t1: number } {
  const lead = Math.max(1, Math.round(span * LEAD_SHARE));
  return { t0: (startDay - lead) * DAY_S, t1: (startDay + span) * DAY_S };
}

/** Where an absolute day's close sits on the whole axis `w` px wide, as the
 *  chart draws it at All: the events row's axis while the charts are hidden
 *  or not yet drawn. */
export function lifeAxis(w: number, startDay: number, span: number): (day: number) => number {
  const { t0, t1 } = flowsBounds(startDay, span);
  return (day) => ((Math.min((day + 1) * DAY_S, t1) - t0) / (t1 - t0)) * w;
}

/** The stop a step back (-1) or forward (+1) from `at` lands on, where the
 *  steps go by days with events (the timeline's day marks): the nearest day
 *  with events that way, or the live stop going forward; `at` where there is
 *  none. */
export function eventStep(stops: CombinedStop[], at: number, dir: -1 | 1): number {
  for (let i = at + dir; i >= 0 && i < stops.length; i += dir) if (stops[i].event || stops[i].live) return i;
  return at;
}

/** The stop for a day's close (`stop`, the whole life's day index): that
 *  day's stop, the live stop for today or later (for a closed position's
 *  close day or later), or null where the day has no stop. */
export function stopForDay(stops: CombinedStop[], stop: number): number | null {
  const last = stops.length - 1;
  if (last >= 0 && stop >= (stops[last].close ?? stops[last].stop)) return last;
  const i = stops.findIndex((x) => !x.live && x.stop === stop);
  return i >= 0 ? i : null;
}

/** The index of the stop nearest `stop` (the later one on a tie). */
export function nearestStop(stops: CombinedStop[], stop: number): number {
  let lo = 0;
  let hi = stops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stops[mid].stop < stop) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && stop - stops[lo - 1].stop < stops[lo].stop - stop) return lo - 1;
  return lo;
}

/** The headlines' state (the whole life's) and the bars' (the window's, or
 *  null before it opens) at a cursor stop. Both hold the same `now` on each
 *  side wherever the bars have a stop. */
export function combinedAt(
  model: FlowModel,
  bars: FlowModel,
  at: Pick<CombinedStop, "stop" | "barStop">,
): { head: FlowState; bars: FlowState | null } {
  return {
    head: stateAt(model, at.stop),
    bars: at.barStop == null ? null : stateAt(bars, at.barStop),
  };
}
