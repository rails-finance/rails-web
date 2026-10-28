// The Lifetime flows panel's price view (rails-ops
// reference/lifetime-flows-scrubber.md; ui-jobs 328, step 2): what the price
// chart draws.
//
// RULES.
// - The series are the panel's `FlowTimeline.dailyPrices`, one per held asset,
//   read through the series reader (lib/shared/price-series.ts) in the unit
//   the flows line uses for the family. A side counted at its face (a
//   Liquity Trove's debt, whose daily "price" is the interest factor) and an
//   asset priced in itself (the unit's token) have no line. Sides with no
//   common unit (Frankencoin, PWN) have no price view.
// - A daily series draws a point per day joined day to day; a day with no
//   observation takes the last price before it, carried, and every segment
//   touching a carried day is dotted. Before the first observation the strip
//   draws nothing. An event series draws the step mark (architecture/
//   market-notes.md §1): each observation held flat to the next, a dashed
//   riser there. The grammar follows `series.grain`. Days before
//   `series.sparseBefore` are the rows alone (decision 3's sparse rule):
//   every segment dotted. A day in `series.heldDays` rests on the last
//   event's price and draws as a carried day.
// - A family's rows (`series.events`) are not marked on the line: the events
//   row under the charts carries them. The
//   liquidation level (`series.level`) is a second line on the same axis, one
//   point per day, held between days and stepped on the day it moves; it has
//   no point after the day it ends. A second line short of it
//   (`series.warn`, f(x)'s rebalance) is drawn the same way.
// - Where the timeline carries the position's health factor (`t.health`,
//   ruling 7), it is the first series, a ratio with no unit, its line at 1;
//   a family whose card states a ratio against a line (unit "ratio": Maker's
//   collateral ratio, Fluid's position ratio) prints it as a percentage, its
//   line the family's.
// - Where the timeline carries a share price (`t.shareLine`, ruling 8: Sky's
//   chi), it stands in place of the held asset's price, in the vault asset.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import type { FlowSide, FlowTimeline } from "@/lib/shared/flows-timeline";
import {
  dayObsPriceSeries,
  priceAt,
  type PriceAt,
  type PriceEvent,
  type PricePoint,
  type PriceSeries,
} from "@/lib/shared/price-series";

/** A held asset's price series as the panel draws it. */
export interface FlowPriceSeries extends PriceSeries {
  /** The side the asset was first held on. */
  side: FlowSide;
  /** The unit as printed: "USD", the token the family's figures are in, ""
   *  for the health factor, or "%" for a ratio view. */
  unitLabel: string;
  /** The position's health factor rather than an asset's price. */
  health?: true;
  /** The line's name where the list holds several lines of one asset (an
   *  asset page's oracles): the picker names it rather than the symbol. */
  name?: string;
}

/** The price series a panel's timeline carries: the health factor where it
 *  has one, then collateral assets, each side in the order its assets were
 *  first held. */
export function flowPriceSeries(t: FlowTimeline): FlowPriceSeries[] {
  if (t.sideUnits || !t.dailyPrices) return [];
  const face = new Set<FlowSide>(t.words?.moment?.face ?? []);
  const unitLabel = t.unit?.symbol ?? "USD";
  const meta = new Map<string, { symbol: string; side: FlowSide; order: number }>();
  for (const d of [...t.days].sort((a, b) => a.day - b.day))
    for (const b of d.balances)
      if (!meta.has(b.asset)) meta.set(b.asset, { symbol: b.symbol, side: b.side, order: meta.size });
  const out: FlowPriceSeries[] = [];
  for (const [asset, obs] of Object.entries(t.dailyPrices)) {
    const m = meta.get(asset);
    if (!m || face.has(m.side) || (t.unit && m.symbol === t.unit.symbol) || t.shareLine?.asset === asset) continue;
    const source =
      t.priceSource ??
      (t.carriedWhy?.[asset] ? "the position's events, on the days they priced it" : "daily price store");
    const s = dayObsPriceSeries(obs, {
      key: asset,
      // The panel's timeline names no chain: 0 stands for unknown.
      asset: { symbol: m.symbol, ...(asset.startsWith("0x") ? { address: asset } : {}), chain: 0 },
      unit: t.unit ? t.unit.symbol : "usd",
      source,
      scale: t.unit?.scale ?? 0,
    });
    if (s) out.push({ ...s, ...t.priceMarks?.[asset], side: m.side, unitLabel });
  }
  const share = t.shareLine;
  if (share)
    out.push({
      ...share.series,
      side: "collateral",
      unitLabel: share.unitLabel,
      name: share.name,
      ...(share.digits != null ? { digits: share.digits } : {}),
    });
  const rank = (s: FlowPriceSeries) => (s.side === "collateral" ? 0 : 1e6) + (meta.get(s.key)?.order ?? 0);
  out.sort((a, b) => rank(a) - rank(b));
  return t.health
    ? [{ ...t.health, side: "collateral", unitLabel: t.health.unit === "ratio" ? "%" : "", health: true }, ...out]
    : out;
}

/** "$2,451.37" · "1.0002 USDC" · "$0.0001234": a price in its unit; a
 *  health factor ("" unit) as the Aave family's cards print one, four places
 *  under 1.1 (rounded down under 1, so a liquidatable figure never reads
 *  1.0000), two above: "1.0234", "1.84"; a ratio ("%") as the Maker and
 *  Fluid cards print one: "185.3%"; to `digits` places where the card prints
 *  a fixed number ("1.071234 USDS"). */
export function formatPrice(v: number, unitLabel: string, digits?: number): string {
  if (digits != null)
    return unitLabel === "%"
      ? `${(v * 100).toFixed(digits)}%`
      : unitLabel === "USD"
        ? `$${v.toFixed(digits)}`
        : `${v.toFixed(digits)} ${unitLabel}`;
  if (unitLabel === "%") return `${(v * 100).toFixed(1)}%`;
  if (unitLabel === "")
    return v < 1 ? (Math.floor(v * 1e4 + 1e-9) / 1e4).toFixed(4) : v < 1.1 ? v.toFixed(4) : v.toFixed(2);
  const a = Math.abs(v);
  const body =
    a >= 100
      ? a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : a >= 1
        ? a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        : a === 0
          ? "0"
          : a.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  return unitLabel === "USD" ? `$${body}` : `${body} ${unitLabel}`;
}

const sig3 = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 3, useGrouping: false });

/** The price axis's labels, in the heading's unit with no sign: thousands
 *  and up compact ("2.45K", "1.2M"), below at the fewest places that keep
 *  every label distinct ("1.5", "1", "0.95"), trailing zeros dropped. */
export function priceAxisLabels(ticks: number[]): string[] {
  const compact = (a: number) =>
    a >= 1e9 ? `${sig3(a / 1e9)}B` : a >= 1e6 ? `${sig3(a / 1e6)}M` : a >= 1e4 ? `${sig3(a / 1e3)}K` : null;
  const at = (d: number) =>
    ticks.map((v) => {
      const c = compact(Math.abs(v));
      if (c) return `${v < 0 ? "−" : ""}${c}`;
      return Number(v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
    });
  for (let d = 0; d <= 8; d++) {
    const labels = at(d);
    if (new Set(labels).size === labels.length) return labels;
  }
  return at(8);
}

// ── What the strip draws ────────────────────────────────────────────────────

/** One day on a daily line: its price, the point it is read from, and whether
 *  that point is from an earlier day. */
export interface PriceDay {
  day: number;
  price: number;
  block: number | null;
  carried: boolean;
  ageDays: number;
}

/** A daily series' days from `from` to `to` (absolute UTC days, inclusive),
 *  each at the day's observation or the last one before it; none before the
 *  first observation. */
export function priceDays(series: PriceSeries, from: number, to: number): PriceDay[] {
  const out: PriceDay[] = [];
  const first = series.points[0]?.[0];
  if (first == null) return out;
  for (let d = Math.max(from, first); d <= to; d++) {
    const p = priceAt(series, d);
    if (!p || (series.noCarry && p.carried)) continue;
    out.push({ day: d, price: p.point[1], block: p.point[2], carried: p.carried, ageDays: p.ageDays });
  }
  return out;
}

/** A line as pieces to stroke: `solid` and `dotted` daily segments, the step
 *  mark's flat runs (`flat`) and dashed risers (`riser`). Each piece is a list
 *  of [day, price] vertices; a riser's two share a day. */
export interface PricePieces {
  solid: [number, number][][];
  dotted: [number, number][][];
  flat: [number, number][][];
  riser: [number, number][][];
  /** The days drawn from an observation of that day, and those carried. */
  observed: number[];
  carried: number[];
}

/** The pieces of `series` over [from, to] by its grain. */
export function pricePieces(series: PriceSeries, from: number, to: number): PricePieces {
  const out: PricePieces = { solid: [], dotted: [], flat: [], riser: [], observed: [], carried: [] };
  if (series.grain === "event") {
    const pts = series.points.filter((p) => p[0] <= to);
    pts.forEach((p, i) => {
      if (p[0] >= from) out.observed.push(p[0]);
      const next = pts[i + 1];
      const end = next ? next[0] : to;
      if (end < from) return;
      out.flat.push([
        [Math.max(from, p[0]), p[1]],
        [end, p[1]],
      ]);
      if (next && next[1] !== p[1])
        out.riser.push([
          [next[0], p[1]],
          [next[0], next[1]],
        ]);
    });
    out.observed = [...new Set(out.observed)];
    return out;
  }
  const held = new Set(series.heldDays ?? []);
  const days = priceDays(series, from, to).map((d) => (held.has(d.day) ? { ...d, carried: true } : d));
  for (const d of days) (d.carried ? out.carried : out.observed).push(d.day);
  if (days.length === 1) out.solid.push([[days[0].day, days[0].price]]);
  const sparse = series.sparseBefore;
  // Without carries a day with no neighbour stands alone, as a point.
  if (series.noCarry && days.length > 1)
    days.forEach((d, i) => {
      if (days[i - 1]?.day !== d.day - 1 && days[i + 1]?.day !== d.day + 1) out.solid.push([[d.day, d.price]]);
    });
  for (let i = 1; i < days.length; i++) {
    const a = days[i - 1];
    const b = days[i];
    if (series.noCarry && b.day !== a.day + 1) continue;
    const kind = a.carried || b.carried || (sparse != null && b.day <= sparse) ? out.dotted : out.solid;
    const last = kind[kind.length - 1];
    const tail = last?.[last.length - 1];
    if (tail && tail[0] === a.day) last.push([b.day, b.price]);
    else
      kind.push([
        [a.day, a.price],
        [b.day, b.price],
      ]);
  }
  return out;
}

/** The readout at the cursor's day: the series' price, carried or the day's
 *  own, and whether it is old by the panel's rule (`gapDays`). */
export function priceReadout(series: PriceSeries, day: number, gapDays: number): (PriceAt & { old: boolean }) | null {
  const p = priceAt(series, day);
  if (!p || (series.noCarry && p.carried)) return null;
  return { ...p, old: p.carried && p.ageDays > gapDays };
}

/** The liquidation level on `day` (or the line short of it, `which`
 *  "warn"): the level's point for that day, null on a day it has none
 *  (before its first day, after the day it ends). */
export function levelAt(series: PriceSeries, day: number, which: "level" | "warn" = "level"): PricePoint | null {
  const pts = series[which]?.points;
  if (!pts?.length) return null;
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= day) lo = mid + 1;
    else hi = mid;
  }
  const p = pts[lo - 1];
  return p && p[0] === day ? p : null;
}

/** The runway as the position card states it: the share the price can fall
 *  before it meets the level, `(price − level) ÷ price`; at or below zero the
 *  position is liquidatable. */
export function runwayShare(price: number, level: number): number {
  return (price - level) / price;
}

/** The runway in the card's words (components/shared/price-runway.tsx): the
 *  whole percent, "over 99" where it rounds to 100 above a positive level. */
export function runwayPct(share: number): string {
  const m = share * 100;
  return Math.round(m) >= 100 && m < 100 ? "over 99" : String(Math.round(m));
}

/** The series' redemption marks on `day`, in row order. */
export function redemptionsOn(series: PriceSeries, day: number): PriceEvent[] {
  return (series.events ?? []).filter((e) => e.day === day && e.redemptionPrice != null);
}
