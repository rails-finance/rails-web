// The Combined view's cursor (a trial on Aave V3; rails-ops TO-DO-ui-jobs §141):
// the Over time line as a strip under the Flows bars, one cursor for both.
// ----------------------------------------------------------------------------
// The cursor stands on the line's points (a week's or a month's last day, and
// today). At a point the headlines and the bars are the scrubber's state at
// that day, `stateAt`: the balances the last event left, each asset at the
// daily price recorded by that day's end. So the headlines and the bars state
// one figure; between events that is the last event's makeup at the point's
// prices. Before the Flows window opens the bars have no stop: the headlines
// still take the whole life's state at the point, and the bars stand aside.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import { DAY_MS, stateAt, type FlowModel, type FlowState } from "@/lib/shared/flows-timeline";
import type { FlowBinSeries } from "@/lib/shared/flows-series";

export interface CombinedStop {
  /** The whole life's stop (day index from the first event; `liveStop` is today). */
  stop: number;
  /** The bars' stop in the windowed model, or null before the window opens. */
  barStop: number | null;
  /** The last point: today at live prices, or the close. */
  live: boolean;
}

/** One stop per point of the line; the last is the live stop. Without a
 *  series, the live stop alone. `from` is the stop the bars' window opens on
 *  (0 where it covers the whole life). */
export function combinedStops(model: FlowModel, series: FlowBinSeries | null, from: number): CombinedStop[] {
  const startDay = model.start / DAY_MS;
  const n = series?.points.length ?? 0;
  const out: CombinedStop[] = [];
  for (let i = 0; i < n - 1; i++) {
    const stop = Math.max(0, Math.min(model.liveStop, series!.points[i][1] - startDay));
    out.push({ stop, barStop: stop >= from ? stop - from : null, live: stop >= model.liveStop });
  }
  out.push({ stop: model.liveStop, barStop: model.liveStop - from, live: true });
  return out;
}

/** The headlines' state (the whole life's) and the bars' (the window's, or
 *  null before it opens) at a cursor stop. Both hold the same `now` on each
 *  side wherever the bars have a stop. */
export function combinedAt(
  model: FlowModel,
  bars: FlowModel,
  at: CombinedStop,
): { head: FlowState; bars: FlowState | null } {
  return {
    head: stateAt(model, at.stop),
    bars: at.barStop == null ? null : stateAt(bars, at.barStop),
  };
}
