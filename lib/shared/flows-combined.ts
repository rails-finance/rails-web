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
}

/** The cursor's stops, ascending: every point of the line and every day with
 *  events, one stop per day; the last is the live stop. Without a series, the
 *  event days and the live stop. `from` is the stop the bars' window opens on
 *  (0 where it covers the whole life). */
export function combinedStops(model: FlowModel, series: FlowBinSeries | null, from: number): CombinedStop[] {
  const startDay = model.start / DAY_MS;
  const byStop = new Map<number, { point: number | null; event: boolean }>();
  const n = series?.points.length ?? 0;
  for (let i = 0; i < n - 1; i++) {
    const stop = Math.max(0, Math.min(model.liveStop, series!.points[i][1] - startDay));
    if (stop < model.liveStop) byStop.set(stop, { point: i, event: false });
  }
  for (const d of model.eventDays) {
    if (d >= model.liveStop) continue;
    const had = byStop.get(d);
    byStop.set(d, { point: had?.point ?? null, event: true });
  }
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
    event: model.eventDays.includes(model.liveStop),
  });
  return out;
}

/** The stop a step back (-1) or forward (+1) from `at` lands on, where the
 *  steps go by days with events (the timeline's day headers): the nearest day
 *  with events that way, or the live stop going forward; `at` where there is
 *  none. */
export function eventStep(stops: CombinedStop[], at: number, dir: -1 | 1): number {
  for (let i = at + dir; i >= 0 && i < stops.length; i += dir) if (stops[i].event || stops[i].live) return i;
  return at;
}

/** The stop for a day's close (`stop`, the whole life's day index): that
 *  day's stop, the live stop for today or later, or null where the day has
 *  no stop. */
export function stopForDay(stops: CombinedStop[], stop: number): number | null {
  const last = stops.length - 1;
  if (last >= 0 && stop >= stops[last].stop) return last;
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
