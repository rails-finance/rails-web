// The Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, rulings 2, 7 and 15; ui-jobs 328, steps 4
// and 5): the position's health factor per day, and each held asset's
// liquidation level. One function for every family whose card works a health
// factor from per-asset collateral factors (the Aave V3 Pools and Aave V4,
// Compound V3, Compound V2 and Moonwell). A family names its oracle, the
// contract whose factors it reads, the chain and its words (`HealthSource`),
// and hooks/useFlowsHealth.ts reads its factors through the family's reader.
//
// RULES.
// - A day's health factor is Σ collateral × price × factor ÷ Σ debt × price:
//   the balances the flows replay holds at the day's close (grown by the
//   indexes between events), each asset at the day's price (the last
//   recorded on or before the day), and the factors of the read at the day's
//   last event, or of the last read before it. A read gives each asset a
//   factor: 0 where its supply backs no debt. Days before the first read take
//   that read's factors and draw by the sparse rule (every segment dotted). A
//   day with no debt, or with a held asset unpriced or absent from the read,
//   has no point. On an open position today's point is the card's health
//   factor.
// - The health view's line is 1: the position is liquidatable below it.
// - An asset's level is the family's rule (`HealthSource.levels`); by
//   default the price at which the health factor reaches 1 with every other
//   balance and price held at the day's (ruling 7), for a debt asset the debt
//   price that reaches it (`basketLevels`). A level at or below zero, or more
//   than LEVEL_REACH times above or below the day's price (a dust debt's), has
//   no point.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import { grownBalance, type FlowSide, type FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs, PriceMarks, PricePoint, PriceSeries } from "@/lib/shared/price-series";

const DAY_S = 86_400;
/** The cards read a health factor at or above this as ∞. */
const HF_CAP = 100;
/** A level further than this factor from the day's price is not drawn. */
const LEVEL_REACH = 10;

/** The most factor reads one page asks for its health view. */
export const HEALTH_READS_MAX = 60;

/** The factors one read gives, at the end of its block. */
export interface FactorRead {
  /** The UTC day of the read's block. */
  day: number;
  block: number;
  /** Per asset, keyed as the timeline keys it: the factor its supply counts
   *  at as a fraction, 0 where it backs no debt. */
  lt: Record<string, number>;
}

/** One asset's line on a day: its balances at the day's close, its price
 *  and its factor (0 where it does not count as collateral). */
export interface HealthLine {
  asset: string;
  coll: number;
  debt: number;
  price: number;
  lt: number;
}

/** What a family's health view names. */
export interface HealthSource {
  /** "the AaveOracle": read as "{oracle} price". */
  oracle: string;
  /** "the Pool": read as "{pool}'s thresholds". */
  pool: string;
  chain: number;
  /** What the factors are called, short and long. Default
   *  ["thresholds", "liquidation thresholds"]. */
  factors?: [string, string];
  /** One factor in the receipt's formula. Default "liquidation threshold". */
  factor?: string;
  /** Where the caption says the factors are read. Default "at each day's
   *  last event". */
  readAt?: string;
  /** Today's point in words. Default "{pool}'s figure for the position now,
   *  the card's". */
  live?: string;
  /** What a health factor under 1 lets happen. Default "{pool} lets a
   *  liquidator repay the debt". */
  below?: string;
  /** Each asset's level on a day from its lines and health factor, where
   *  the family's card derives it otherwise than `basketLevels`; and the
   *  rule in words. */
  levels?: { of: (lines: readonly HealthLine[], hf: number) => Map<string, number>; formula: string };
}

const BASKET_LEVEL_FORMULA =
  "the price at which the health factor reaches 1, every other balance and price held at the day's";

/** Ruling 7: each asset's price at which the health factor reaches 1, every
 *  other balance and price held; for a debt asset the debt price that
 *  reaches it. */
export function basketLevels(lines: readonly HealthLine[]): Map<string, number> {
  let w = 0;
  let debt = 0;
  for (const l of lines) {
    w += l.coll * l.price * l.lt;
    debt += l.debt * l.price;
  }
  const out = new Map<string, number>();
  for (const l of lines) {
    const cw = l.coll * l.lt;
    if (cw - l.debt !== 0) out.set(l.asset, (debt - l.debt * l.price - (w - cw * l.price)) / (cw - l.debt));
  }
  return out;
}

/** Today's levels from the card's read (its balances, prices and factors,
 *  keyed as the timeline keys its assets): ruling 7's level as a share of the
 *  read's price, at the timeline's price today, so a read quoted in another
 *  unit (a Comet's) lands on the chart's axis. */
export function cardLevels(
  lines: readonly HealthLine[],
  todayPrices: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [asset, level] of basketLevels(lines)) {
    const l = lines.find((x) => x.asset === asset)!;
    const p = todayPrices?.[asset];
    if (l.price > 0 && p != null && p > 0) out[asset] = (level / l.price) * p;
  }
  return out;
}

/** The events whose factors the health view reads: the last event of each
 *  of the most recent `max` days with events, ascending. */
export function healthReadPicks<E extends { blockNumber: number; timestamp: number }>(
  events: readonly E[],
  max: number,
): E[] {
  const byDay = new Map<number, E>();
  for (const e of events) {
    const d = Math.floor(e.timestamp / DAY_S);
    const had = byDay.get(d);
    if (!had || e.blockNumber > had.blockNumber || (e.blockNumber === had.blockNumber && e.timestamp >= had.timestamp))
      byDay.set(d, e);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-max)
    .map(([, e]) => e);
}

/** The last observation on or before `day`, or null. */
function obsAt(obs: readonly DayObs[] | undefined, day: number): number | null {
  if (!obs || obs.length === 0) return null;
  let lo = 0;
  let hi = obs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (obs[mid][0] <= day) lo = mid + 1;
    else hi = mid;
  }
  const o = obs[lo - 1];
  return o && o[1] > 0 ? o[1] : null;
}

/** The health view and each held asset's level, from the timeline's day rows
 *  and daily prices and the factor reads (ascending by block). Null where
 *  there is no read or no day with debt. `liveHf` is the card's health factor
 *  for an open position's today. */
export function healthView(
  t: FlowTimeline,
  reads: readonly FactorRead[],
  o: {
    liveHf?: number | null;
    /** The card's levels today, by asset, where the card states one per
     *  collateral: an open position's today draws these. */
    liveLevels?: Record<string, number> | null;
    source?: HealthSource;
  },
): { health: PriceSeries; marks: Record<string, PriceMarks> } | null {
  if (reads.length === 0 || t.days.length === 0 || !t.dailyPrices) return null;
  const src = o.source ?? { oracle: "the oracle", pool: "the protocol", chain: 1 };
  const [factors, factorsLong] = src.factors ?? ["thresholds", "liquidation thresholds"];
  const levelsOf = src.levels?.of ?? basketLevels;
  const days = t.days;
  const held = new Map<string, { side: FlowSide; asset: string; amount: number; index?: number; day: number }>();
  for (const d of days)
    for (const b of d.balances)
      held.set(`${b.side}:${b.asset}`, {
        side: b.side,
        asset: b.asset,
        amount: b.amount,
        ...(b.index != null ? { index: b.index } : {}),
        day: d.day,
      });
  const open = [...held.values()].some((h) => h.amount > 0);
  const first = days[0].day;
  const last = days[days.length - 1].day;
  const today = t.today ?? last;
  const end = open ? Math.max(last, today) : last;
  held.clear();

  const hfPoints: PricePoint[] = [];
  const levels = new Map<string, PricePoint[]>();
  const push = (asset: string, p: PricePoint) => {
    const run = levels.get(asset);
    if (run) run.push(p);
    else levels.set(asset, [p]);
  };
  let di = 0;
  let ri = 0;
  for (let day = first; day <= end; day++) {
    while (di < days.length && days[di].day <= day) {
      const d = days[di++];
      for (const b of d.balances)
        held.set(`${b.side}:${b.asset}`, {
          side: b.side,
          asset: b.asset,
          amount: b.amount,
          ...(b.index != null ? { index: b.index } : {}),
          day: d.day,
        });
    }
    while (ri + 1 < reads.length && reads[ri + 1].day <= day) ri++;
    const read = reads[ri];
    const live = open && day === today && o.liveHf != null && o.liveHf > 0;
    // Each asset's balance on each side at the day's close, and its price.
    const lines = new Map<string, { coll: number; debt: number; price: number }>();
    let priced = true;
    for (const h of held.values()) {
      if (!(h.amount > 0)) continue;
      const amount = grownBalance(t.indexes, h.asset, h.side, h.amount, h.day, h.index, day).amount;
      const price = (live ? t.todayPrices?.[h.asset] : undefined) ?? obsAt(t.dailyPrices[h.asset], day);
      if (price == null) {
        priced = false;
        break;
      }
      const line = lines.get(h.asset) ?? { coll: 0, debt: 0, price };
      if (h.side === "collateral") line.coll += amount;
      else line.debt += amount;
      lines.set(h.asset, line);
    }
    if (!priced) continue;
    let w = 0;
    let debt = 0;
    let known = true;
    const dayLines: HealthLine[] = [];
    for (const [asset, l] of lines) {
      const lt = l.coll > 0 ? read.lt[asset.toLowerCase()] : 0;
      if (lt == null) {
        known = false;
        break;
      }
      w += l.coll * l.price * lt;
      debt += l.debt * l.price;
      dayLines.push({ asset, ...l, lt });
    }
    if (!known || !(debt > 0)) continue;
    const hf = live ? o.liveHf! : w / debt;
    if (!(hf > 0) || hf >= HF_CAP) continue;
    const block = live ? null : read.block;
    hfPoints.push([day, hf, block]);
    const dayLevels =
      live && o.liveLevels
        ? new Map(dayLines.flatMap((l) => (o.liveLevels![l.asset] > 0 ? [[l.asset, o.liveLevels![l.asset]]] : [])))
        : levelsOf(dayLines, hf);
    for (const [asset, level] of dayLevels) {
      const price = lines.get(asset)!.price;
      if (level > price / LEVEL_REACH && level < price * LEVEL_REACH) push(asset, [day, level, block]);
    }
  }
  if (hfPoints.length === 0) return null;
  const endWord: "today" | "close" = open ? "today" : "close";
  const sparseBefore = reads[0].day > hfPoints[0][0] ? reads[0].day : undefined;
  const health: PriceSeries = {
    key: "health",
    asset: { symbol: "Health factor", chain: src.chain },
    unit: "health",
    grain: "daily",
    noCarry: true,
    source: `${src.pool}'s ${factors} ${src.readAt ?? "at each day's last event"}, with ${src.oracle} price recorded each day`,
    points: hfPoints,
    here: {
      live: `Health factor — ${src.live ?? `${src.pool}'s figure for the position now, the card's`}.`,
      read: `Health factor — on {day}, the balances held at the day's close, each at ${src.oracle} price recorded that day, against the ${factorsLong} ${src.pool} held after the event at block {block}.`,
      formula: `Σ collateral × price × ${src.factor ?? "liquidation threshold"} ÷ Σ debt × price`,
    },
    level: {
      points: hfPoints.map(([d]) => [d, 1, null] as PricePoint),
      formula: "below 1 the position can be liquidated",
      summary: `Liquidation line — below a health factor of 1 ${src.below ?? `${src.pool} lets a liquidator repay the debt`}.`,
      end: endWord,
    },
    ...(sparseBefore != null ? { sparseBefore } : {}),
  };
  const marks: Record<string, PriceMarks> = {};
  for (const [asset, pts] of levels)
    marks[asset] = {
      level: {
        points: pts,
        formula: src.levels?.formula ?? BASKET_LEVEL_FORMULA,
        summary: `Liquidation level — the asset's price at which the health factor reaches 1, with every other balance and price as they stood on the day and the ${factors} ${src.pool} held at the day's last event.`,
        end: endWord,
        here: {
          live: "Here at today's balances and prices and the card's health factor.",
          read: `Here at the balances and prices of {day}, against the ${factors} ${src.pool} held after the event at block {block}.`,
        },
      },
    };
  return { health, marks };
}
