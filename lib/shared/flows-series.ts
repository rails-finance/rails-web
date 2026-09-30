// Lifetime flows over the whole life, per bin: the Lifetime view's series
// (components/shared/lifetime-flows-over-time.tsx; rails-ops
// reference/lifetime-flows-scrubber.md, "The two views").
// ----------------------------------------------------------------------------
// The Next routes GET /api/{aave-v3,spark,aave-v4}/flows/series?bin=day|week|month
// read the index's day rows (the daily route's replay and price reads) and
// answer with this, at most 366 points by day and about 52 a year by week per
// side, so the browser never needs the whole history for this view. Sky Savings holds its day rows on
// the page and bins them here.
//
// Each bin states what was held and owed at its last day: the balances the
// replay left by then, each asset at the index's daily price on the bin's
// last day that recorded one. Where a held asset records no price inside the
// bin, that side is null and the chart draws a gap.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import type { FlowSide, FlowTimeline } from "@/lib/shared/flows-timeline";

export type SeriesBin = "day" | "week" | "month";

/** The bars cover this many active days (days with events) back from today. */
export const WINDOW_ACTIVE_DAYS = 300;

/** A life of more than three years is drawn by month, else by week.
 *  `spanDays` is today less the first event's day. */
export function lifetimeBinFor(spanDays: number): SeriesBin {
  return spanDays > 3 * 365 ? "month" : "week";
}

/** The longest life the Aave family's line draws by day: today at most this
 *  many days after the first event's day, 366 points at most. */
export const DAILY_LINE_MAX_DAYS = 365;

/** The Aave family's line (the families with a series route): by day up to
 *  DAILY_LINE_MAX_DAYS, then as lifetimeBinFor. */
export function seriesRouteBinFor(spanDays: number): SeriesBin {
  return spanDays <= DAILY_LINE_MAX_DAYS ? "day" : lifetimeBinFor(spanDays);
}

/** The first active day the bars show: the WINDOW_ACTIVE_DAYS-th from the
 *  end, or the first when there are no more than that. `activeDays` ascending. */
export function windowFromDay(activeDays: readonly number[]): number {
  if (activeDays.length === 0) return 0;
  return activeDays[Math.max(0, activeDays.length - WINDOW_ACTIVE_DAYS)];
}

/** What binning reads: the replay's day rows (balances after each active
 *  day), each asset's daily prices ([day, usd] on each day one was recorded),
 *  and the symbols. Days are UTC day numbers. */
export interface BinInput {
  days: { day: number; balances: { side: FlowSide; asset: string; amount: number }[] }[];
  prices: Record<string, [number, number][]>;
  symbols: Record<string, string>;
  today: number;
  /** Prices are recorded only on some days (a family's events): a bin keeps
   *  the last one recorded by its end, however old. */
  carry?: boolean;
}

/** [first day, last day, held, owed]; null where a held asset has no price in the bin. */
export type SeriesPoint = [from: number, to: number, collateral: number | null, debt: number | null];

export interface FlowBinSeries {
  bin: SeriesBin;
  /** The first active day and today (UTC day numbers). */
  first: number;
  today: number;
  /** The bars' window: its first active day and how many active days it holds. */
  window: { from: number; activeDays: number };
  points: SeriesPoint[];
  /** [point index, side, symbol]: a held asset with no price in that bin. */
  gaps: [number, FlowSide, string][];
}

const DAY_MS = 86_400_000;

/** Monday of the UTC week `day` falls in (day 0, 1 Jan 1970, was a Thursday). */
export const weekStart = (day: number): number => day - ((day + 3) % 7);

function monthStart(day: number): number {
  const d = new Date(day * DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY_MS;
}

function nextMonth(day: number): number {
  const d = new Date(day * DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS;
}

/** The calendar bins from the day (week, month) of `first` to today's. The
 *  first bin starts at `first`, the last ends today. */
export function binRanges(first: number, today: number, bin: SeriesBin): [number, number][] {
  const out: [number, number][] = [];
  let from = bin === "day" ? first : bin === "week" ? weekStart(first) : monthStart(first);
  while (from <= today) {
    const next = bin === "day" ? from + 1 : bin === "week" ? from + 7 : nextMonth(from);
    out.push([Math.max(from, first), Math.min(next - 1, today)]);
    from = next;
  }
  return out;
}

// exponent-safe: a wire figure the chart scales, never printed
const round = (v: number) => Number(v.toPrecision(8));

/** Held and owed at the end of each bin, from the open to today. */
export function binSeries(input: BinInput, bin: SeriesBin): FlowBinSeries | null {
  const days = [...input.days].sort((a, b) => a.day - b.day);
  if (days.length === 0) return null;
  const first = days[0].day;
  const today = Math.max(input.today, days[days.length - 1].day);
  const obs = new Map<string, [number, number][]>();
  for (const [asset, list] of Object.entries(input.prices))
    obs.set(
      asset,
      list.filter(([, usd]) => usd > 0).sort((a, b) => a[0] - b[0]),
    );
  const cursor = new Map<string, number>();
  /** The asset's last price recorded in [from, to], or null. */
  const priceIn = (asset: string, from: number, to: number): number | null => {
    const list = obs.get(asset);
    if (!list || list.length === 0) return null;
    let i = cursor.get(asset) ?? -1;
    while (i + 1 < list.length && list[i + 1][0] <= to) i++;
    cursor.set(asset, i);
    return i >= 0 && (input.carry || list[i][0] >= from) ? list[i][1] : null;
  };

  const held = new Map<string, { side: FlowSide; asset: string; amount: number }>();
  const points: SeriesPoint[] = [];
  const gaps: FlowBinSeries["gaps"] = [];
  let di = 0;
  for (const [from, to] of binRanges(first, today, bin)) {
    while (di < days.length && days[di].day <= to) {
      for (const b of days[di].balances) held.set(`${b.side}:${b.asset}`, b);
      di++;
    }
    const sum: Record<FlowSide, number | null> = { collateral: 0, debt: 0 };
    for (const h of held.values()) {
      if (!(h.amount > 0)) continue;
      const p = priceIn(h.asset, from, to);
      if (p == null) {
        sum[h.side] = null;
        gaps.push([points.length, h.side, input.symbols[h.asset] ?? h.asset]);
      } else if (sum[h.side] != null) sum[h.side] = (sum[h.side] as number) + h.amount * p;
    }
    points.push([
      from,
      to,
      sum.collateral == null ? null : round(sum.collateral),
      sum.debt == null ? null : round(sum.debt),
    ]);
  }
  const active = days.map((d) => d.day);
  const from = windowFromDay(active);
  return {
    bin,
    first,
    today,
    window: { from, activeDays: active.filter((d) => d >= from).length },
    points,
    gaps,
  };
}

/** The daily route's answer as binning input. */
export function binInputFromWire(s: FlowSeries): BinInput {
  return {
    days: s.days.map(([day, , , , balances]) => ({
      day,
      balances: balances.map(([side, asset, amount]) => ({ side, asset, amount })),
    })),
    prices: Object.fromEntries(Object.entries(s.prices).map(([a, p]) => [a, p.obs])),
    symbols: Object.fromEntries(Object.entries(s.assets).map(([a, x]) => [a, x.symbol])),
    today: s.today,
  };
}

/** A timeline's day rows and daily prices as binning input (Sky Savings,
 *  whose rows are on the page). Null without a daily price series. */
export function binInputFromTimeline(t: FlowTimeline): BinInput | null {
  if (!t.dailyPrices || t.today == null) return null;
  const symbols: Record<string, string> = {};
  for (const d of t.days) for (const b of d.balances) symbols[b.asset] = b.symbol;
  return {
    days: t.days.map((d) => ({ day: d.day, balances: d.balances })),
    prices: t.dailyPrices,
    symbols,
    today: t.today,
    ...(t.seriesCarry ? { carry: true } : {}),
  };
}
