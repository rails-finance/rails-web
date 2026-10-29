// LlamaLend on the Lifetime flows chart (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 6): the
// card's Health as the chart's first view, and the soft-liquidation band on
// the collateral's price as a shaded range (`PriceSeries.band`).
//
// RULES.
// - The page reads the position at the end of the block of the last event of
//   each of the latest HEALTH_READS_MAX days with events
//   (/api/chain/llamalend/event-state, the read the event card's detail
//   makes): Controller.health(user, true), Controller.user_prices(user) and
//   AMM.get_base_price().
// - A day's band is the read's user_prices after the day's last event, held
//   to the next event (`levelByDay`): the base price moves with the market's
//   rate between events and the chart does not follow it. An event the page
//   did not read takes its row's ticks at the base price of the nearest
//   read (`bandPrices`), and its day is marked estimated. A day whose events
//   leave no loan ends the band at the one that stood before it. Today's band
//   on an open position is the card's (the live read's pUp and pDown).
// - A day's health is the read's, at the liquidation discount stored on the
//   position and the AMM's oracle price at that block; a day with no event
//   keeps the last event's and is drawn dotted, as the price is. A day whose
//   event the page did not read has no health. Today's is the card's. The line
//   is 0: below it anyone may liquidate the position.
// - A governance change to the market's liquidation discount does not move
//   the line at its block: the position keeps the discount stored at its
//   owner's last borrow, collateral move or repay, and the next such event's
//   read takes the new one (lib/llamalend/config-log.ts, the markers). Where
//   the life holds such a change the how-to-read says so.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts.

import { bandPrices, scale1e18 } from "@/lib/llamalend/band-math";
import { fmtHealth } from "@/lib/llamalend/event-figures";
import type { LlamalendFlowEvent } from "@/lib/llamalend/flows";
import {
  levelByDay,
  type BandPoint,
  type LevelEvent,
  type PriceBand,
  type PricePoint,
  type PriceSeries,
} from "@/lib/shared/price-series";

const DAY_S = 86_400;

/** The position at the end of one block, as the band and the health read it. */
export interface LlamalendBandRead {
  block: number;
  hasLoan: boolean;
  /** Borrowed token per collateral: the band's top and bottom. */
  pUp: number | null;
  pDown: number | null;
  /** Controller.health(user, true) as a fraction. */
  health: number | null;
  basePriceRaw: bigint | null;
}

/** The event-state route's `after` as a band read; null where it is not one. */
export function llamalendBandRead(after: unknown): LlamalendBandRead | null {
  const a = after as {
    block?: number;
    hasLoan?: boolean;
    pUpRaw?: string | null;
    pDownRaw?: string | null;
    healthRaw?: string | null;
    basePriceRaw?: string | null;
  } | null;
  if (!a || typeof a.block !== "number" || typeof a.hasLoan !== "boolean") return null;
  const num = (v: string | null | undefined) => {
    if (v == null) return null;
    try {
      return scale1e18(BigInt(v));
    } catch {
      return null;
    }
  };
  let base: bigint | null = null;
  try {
    base = a.basePriceRaw != null ? BigInt(a.basePriceRaw) : null;
  } catch {
    base = null;
  }
  return {
    block: a.block,
    hasLoan: a.hasLoan,
    pUp: a.hasLoan ? num(a.pUpRaw) : null,
    pDown: a.hasLoan ? num(a.pDownRaw) : null,
    health: a.hasLoan ? num(a.healthRaw) : null,
    basePriceRaw: base,
  };
}

/** The live read's figures for today. */
export interface LlamalendBandLive {
  pUp: number | null;
  pDown: number | null;
  health: number | null;
}

type Ev = LevelEvent & { row: LlamalendFlowEvent };

/** The health view and the collateral's band, from the rows and the reads
 *  at their blocks. Either is null where no day has one. */
export function llamalendPriceView(
  rows: readonly LlamalendFlowEvent[],
  reads: ReadonlyMap<number, LlamalendBandRead>,
  o: {
    now: number;
    open: boolean;
    /** The market's A, for the band of an event the page did not read. */
    A: number | null;
    live: LlamalendBandLive | null;
    collSymbol: string;
    debtSymbol: string;
    /** How many days with events the page reads. */
    cap: number;
    /** A change to the market's liquidation discount falls in the life. */
    discountChanged?: boolean;
  },
): { health: PriceSeries | null; band: PriceBand | null } {
  const evs: Ev[] = rows.map((r) => {
    const read = reads.get(r.block);
    return {
      ts: r.ts,
      block: r.block,
      holds: r.debtAfter != null ? r.debtAfter > BigInt(0) : (read?.hasLoan ?? true),
      liquidation: r.kind === "liquidation" && !r.self,
      row: r,
    };
  });
  if (evs.length === 0) return { health: null, band: null };
  const live = o.open ? o.live : null;
  // The reads that give a base price, by block, for an event not read.
  const anchors = [...reads.values()]
    .filter((r) => r.hasLoan && r.basePriceRaw != null && r.basePriceRaw > BigInt(0))
    .sort((a, b) => a.block - b.block);
  const A = o.A != null && o.A > 1 ? BigInt(Math.round(o.A)) : null;
  const worked = new Map<number, [number, number] | null>();
  const workedAt = (e: Ev): [number, number] | null => {
    if (worked.has(e.block)) return worked.get(e.block)!;
    let out: [number, number] | null = null;
    const { n1, n2 } = e.row;
    if (A != null && n1 != null && n2 != null && anchors.length) {
      let near = anchors[0];
      for (const a of anchors) if (Math.abs(a.block - e.block) < Math.abs(near.block - e.block)) near = a;
      try {
        const b = bandPrices(A, near.basePriceRaw!, n1, n2);
        out = [scale1e18(b.pUpRaw), scale1e18(b.pDownRaw)];
      } catch {
        out = null;
      }
    }
    worked.set(e.block, out);
    return out;
  };
  const edges = (e: Ev): [number, number] | null => {
    const r = reads.get(e.block);
    if (r?.hasLoan && r.pUp != null && r.pDown != null && r.pUp > 0 && r.pDown > 0) return [r.pUp, r.pDown];
    return workedAt(e);
  };
  const up = levelByDay(evs, {
    now: o.now,
    at: (e) => edges(e)?.[0] ?? null,
    live: live?.pUp ?? null,
  });
  const down = levelByDay(evs, {
    now: o.now,
    at: (e) => edges(e)?.[1] ?? null,
    live: live?.pDown ?? null,
  });
  let band: PriceBand | null = null;
  if (up && down) {
    const lower = new Map(down.points.map((p) => [p[0], p[1]]));
    const points: BandPoint[] = [];
    const estimated: number[] = [];
    for (const [day, hi, block] of up.points) {
      const lo = lower.get(day);
      if (lo == null || !(lo < hi)) continue;
      points.push([day, hi, lo, block]);
      const r = block != null ? reads.get(block) : undefined;
      if (block != null && !(r?.hasLoan && r.pUp != null && r.pDown != null)) estimated.push(day);
    }
    if (points.length)
      band = {
        points,
        label: "Band",
        inside: "In soft liquidation, inside the band",
        below: "Under the band, all converted",
        formula: "Controller.user_prices: p_oracle_up(n1) → p_oracle_down(n2), base price × ((A − 1) ÷ A)^n",
        summary: `Soft-liquidation band — the prices between which the AMM converts this position's ${o.collSymbol} to ${o.debtSymbol}, from the band's top, where conversion begins, to its bottom, where all of it is converted, in ${o.debtSymbol} per ${o.collSymbol}`,
        here: {
          live: "Here as the AMM states it now, the card's Bands.",
          read: "Here as Controller.user_prices read at the end of block {block}, the day's last event on or before {day}: the ticks that event set at the AMM's base price then, held to the next event.",
          estimated: `Here worked from the ticks the event at block {block} set, at the AMM's base price at the nearest block the page read: the page reads the band at the last event of the latest ${o.cap} days with events.`,
        },
        ...(estimated.length ? { estimated } : {}),
        end: up.end,
      };
  }

  const hp = levelByDay(evs, {
    now: o.now,
    at: (e) => {
      const r = reads.get(e.block);
      return r?.hasLoan && r.health != null ? r.health : null;
    },
    live: live?.health ?? null,
    signed: true,
  });
  let health: PriceSeries | null = null;
  if (hp) {
    const eventDays = new Set(rows.map((r) => Math.floor(r.ts / DAY_S)));
    const heldDays = hp.points.filter((p) => p[2] != null && !eventDays.has(p[0])).map((p) => p[0]);
    const line: PricePoint[] = hp.points.map((p) => [p[0], 0, p[2]]);
    health = {
      key: "health",
      asset: { symbol: "Health", chain: 1 },
      unit: "ratio",
      grain: "daily",
      noCarry: true,
      liquidates: "below",
      digits: 2,
      print: fmtHealth,
      source:
        "the Controller's health at each day's last event, at the discount stored on the position and the AMM's oracle price at that block",
      points: hp.points,
      ...(heldDays.length ? { heldDays } : {}),
      here: {
        live: "Health — the Controller's figure for the position now, the card's.",
        read: "Health — Controller.health(user, true) at the end of block {block}, the last event on or before {day}: the liquidation discount stored on the position and the AMM's oracle price at that block.",
        formula:
          "value of the bands with the price through their bottom × (1 − liquidation discount) ÷ debt − 1, plus the price's gap above the band while out of it",
      },
      level: {
        points: line,
        formula: "below 0 anyone may liquidate the position",
        summary: "Liquidation line — below a health of 0 anyone may liquidate the position in full or in part.",
        here: { live: "The line is 0 on every day.", read: "The line is 0 on every day." },
        end: hp.end,
      },
      help: `the Controller's health at the end of each day's last event, at the liquidation discount stored on the position and the AMM's oracle price at that block (the last ${o.cap} days with events), held between events and dotted there; today the card's. The red line at 0 is where anyone may liquidate it.${o.discountChanged ? " A change to the market's liquidation discount, a pink diamond on the events row, reaches the position at its owner's next borrow, collateral move or repay, where the line steps." : ""} The list in the tip picks it or the ${o.collSymbol} price with its band.`,
    };
  }
  return { health, band };
}

/** The collateral price's sentence in the charts' how-to-read. */
export function llamalendBandHelp(collSymbol: string, debtSymbol: string, cap: number): string {
  return `the AMM's oracle price in ${debtSymbol} at each event's block, held between events; the shaded range is the soft-liquidation band, where the AMM converts the ${collSymbol}, from Controller.user_prices at the end of each day's last event (the last ${cap} days with events; older days worked from their ticks, lighter) and held to the next event; today the card's Bands.`;
}
