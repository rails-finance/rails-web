// Aave V3 Ethereum's price view (rails-ops reference/lifetime-price-chart.md,
// rulings 2 and 7; ui-jobs 328, step 4): the position's health factor per day,
// and each held asset's liquidation level.
//
// RULES.
// - A day's health factor is Σ collateral × price × liquidation threshold ÷
//   Σ debt × price: the balances the flows replay holds at the day's close
//   (grown by the reserves' indexes between events), each asset at the day's
//   AaveOracle price (the last recorded on or before the day), and the
//   thresholds of the position-state read at the day's last event, or of the
//   last read before it. A reserve counts as collateral where the read has it
//   switched on; in an e-mode category a member reserve takes the category's
//   threshold. Days before the first read take that read's thresholds and draw
//   by the sparse rule (every segment dotted). A day with no debt, or with a
//   held asset unpriced or absent from the read, has no point. On an open
//   position today's point is the card's health factor.
// - The health view's line is 1: the position is liquidatable below it.
// - An asset's level is the price at which the health factor reaches 1 with
//   every other balance and price held at the day's (ruling 7); for a debt
//   asset, the debt price that reaches it. Where one reserve holds at least
//   99.5 % of the priced collateral, its level is its price ÷ the health factor,
//   the card's "Liquidates at" (`aaveV3LiquidationRead`), so the card's figure
//   and the chart's last point agree. A level at or below zero, or more than
//   LEVEL_REACH times above or below the day's price (a dust debt's), has no
//   point.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import { grownBalance, type FlowSide, type FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs, PriceMarks, PricePoint, PriceSeries } from "@/lib/shared/price-series";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

const DAY_S = 86_400;
/** The card reads a health factor at or above this as ∞ (`aaveV3LiquidationRead`). */
const HF_CAP = 100;
/** The card's single-collateral rule: one reserve's share of the priced collateral. */
const SINGLE_SHARE = 0.995;
/** A level further than this factor from the day's price is not drawn. */
const LEVEL_REACH = 10;

/** The thresholds one position-state read gives, after its transaction. */
export interface AaveV3ThresholdRead {
  /** The UTC day of the read's block. */
  day: number;
  block: number;
  /** Per reserve (lowercase): its liquidation threshold as a fraction where
   *  it counts as collateral, 0 where it does not. */
  lt: Record<string, number>;
  /** The e-mode category after the transaction (0: none). */
  emode: number;
}

/** A position-state answer's thresholds after its transaction. */
export function aaveV3ThresholdRead(state: AaveV3PositionState): AaveV3ThresholdRead {
  const id = state.emode?.after ?? 0;
  const cat = id > 0 ? state.emode?.categories[String(id)] : undefined;
  const lt: Record<string, number> = {};
  for (const r of state.reserves) {
    const bps = r.inEmode && cat ? cat.liquidationThresholdBps : (r.liquidationThresholdBps ?? 0);
    lt[r.reserve.toLowerCase()] = r.collateral?.after ? bps / 1e4 : 0;
  }
  return { day: Math.floor(state.blockTimestamp / DAY_S), block: state.block, lt, emode: id };
}

/** The events whose position state the health view reads: the last event of
 *  each of the most recent `max` days with events, ascending. */
export function aaveV3HealthReadPicks<E extends { blockNumber: number; timestamp: number; txHash?: string }>(
  events: readonly E[],
  max: number,
): E[] {
  const byDay = new Map<number, E>();
  for (const e of events) {
    if (!e.txHash) continue;
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

const AAVE_V3_LEVEL_FORMULA =
  "the price at which the health factor reaches 1, every other balance and price held at the day's; where one reserve holds at least 99.5% of the collateral, its price ÷ the health factor";

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
 *  and daily prices and the threshold reads (ascending by block). Null where
 *  there is no read or no day with debt. `liveHf` is the card's health factor
 *  for an open position's today. */
export function aaveV3HealthView(
  t: FlowTimeline,
  reads: readonly AaveV3ThresholdRead[],
  o: { liveHf?: number | null },
): { health: PriceSeries; marks: Record<string, PriceMarks> } | null {
  if (reads.length === 0 || t.days.length === 0 || !t.dailyPrices) return null;
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
    // Each reserve's balance on each side at the day's close, and its price.
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
    let collUsd = 0;
    let known = true;
    for (const [asset, l] of lines) {
      if (l.coll > 0) {
        const lt = read.lt[asset.toLowerCase()];
        if (lt == null) {
          known = false;
          break;
        }
        w += l.coll * l.price * lt;
        if (lt > 0) collUsd += l.coll * l.price;
      }
      debt += l.debt * l.price;
    }
    if (!known || !(debt > 0)) continue;
    const hf = live ? o.liveHf! : w / debt;
    if (!(hf > 0) || hf >= HF_CAP) continue;
    const block = live ? null : read.block;
    hfPoints.push([day, hf, block]);
    for (const [asset, l] of lines) {
      const lt = l.coll > 0 ? (read.lt[asset.toLowerCase()] ?? 0) : 0;
      const cw = l.coll * lt;
      let level: number | null = null;
      if (cw > 0 && collUsd > 0 && (l.coll * l.price) / collUsd >= SINGLE_SHARE && l.debt === 0) level = l.price / hf;
      else if (cw - l.debt !== 0) {
        const restW = w - cw * l.price;
        const restD = debt - l.debt * l.price;
        level = (restD - restW) / (cw - l.debt);
      }
      if (level != null && level > l.price / LEVEL_REACH && level < l.price * LEVEL_REACH)
        push(asset, [day, level, block]);
    }
  }
  if (hfPoints.length === 0) return null;
  const endWord: "today" | "close" = open ? "today" : "close";
  const sparseBefore = reads[0].day > hfPoints[0][0] ? reads[0].day : undefined;
  const health: PriceSeries = {
    key: "health",
    asset: { symbol: "Health factor", chain: 1 },
    unit: "health",
    grain: "daily",
    noCarry: true,
    source: "the Pool's thresholds at each day's last event, with the AaveOracle price recorded each day",
    points: hfPoints,
    here: {
      live: "Health factor — the Pool's figure for the position now, the card's.",
      read: "Health factor — on {day}, the balances held at the day's close, each at the AaveOracle price recorded that day, against the liquidation thresholds the Pool held after the event at block {block}.",
    },
    level: {
      points: hfPoints.map(([d]) => [d, 1, null] as PricePoint),
      formula: "below 1 the position can be liquidated",
      summary: "Liquidation line — below a health factor of 1 the Pool lets a liquidator repay the debt.",
      end: endWord,
    },
    ...(sparseBefore != null ? { sparseBefore } : {}),
  };
  const marks: Record<string, PriceMarks> = {};
  for (const [asset, pts] of levels)
    marks[asset] = {
      level: {
        points: pts,
        formula: AAVE_V3_LEVEL_FORMULA,
        summary:
          "Liquidation level — the asset's price at which the health factor reaches 1, with every other balance and price as they stood on the day and the thresholds the Pool held at the day's last event.",
        end: endWord,
        here: {
          live: "Here at today's balances and prices and the card's health factor.",
          read: "Here at the balances and prices of {day}, against the thresholds the Pool held after the event at block {block}.",
        },
      },
    };
  return { health, marks };
}
