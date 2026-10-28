// Morpho Blue's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 6; the view
// is lib/shared/flows-health.ts), in the card's terms: the LTV against the
// market's LLTV, in the loan token.
//
// RULES.
// - A day's LTV is debt ÷ (collateral × price): the flows replay's balances
//   at the day's close (the debt grown at the rate the market charged until
//   its next event), the market oracle's price in the loan token at the
//   latest event that priced the collateral (no daily oracle series is
//   recorded). A day with no event keeps the last event's price
//   and is drawn dotted.
// - The line is the market's LLTV, fixed when the market was created: one
//   read per day with events, every one the same, so no day is dotted for it.
// - The collateral's level is debt ÷ (collateral × LLTV) (`morphoLiqPrice`,
//   the figure `morphoHealthMove` states before and after each event),
//   grown with the debt between events.
// - On an open position today's LTV, line and level are the card's: its LTV
//   from the live market read, its LLTV, and the price its "Liquidates on a
//   drop of" stands for.
//
// Pure.

import type { FactorRead, HealthLine, HealthSource } from "@/lib/shared/flows-health";

const DAY_S = 86_400;

/** The timeline's keys (lib/morpho/flows.ts). */
export const MORPHO_COLL_KEY = "coll";
const SUPPLY_KEY = "supply";

/** The collateral price, in the loan token, at which a position holding
 *  `coll` against `debt` reaches the market's LLTV. */
export function morphoLiqPrice(coll: number, debt: number, lltv: number): number {
  return debt / (coll * lltv);
}

/** The LLTV as the view's reads: one per day with events, at that day's last
 *  event, so each day's point rests on the event whose balances and price
 *  it carries. The supply backs no debt. Ascending events. */
export function morphoLltvReads(events: readonly { ts: number; block: number }[], lltv: number): FactorRead[] | null {
  if (!(lltv > 0) || events.length === 0) return null;
  const byDay = new Map<number, number>();
  for (const e of events) {
    const d = Math.floor(e.ts / DAY_S);
    byDay.set(d, Math.max(byDay.get(d) ?? 0, e.block));
  }
  return [...byDay]
    .sort((a, b) => a[0] - b[0])
    .map(([day, block]) => ({ day, block, lt: { [MORPHO_COLL_KEY]: lltv, [SUPPLY_KEY]: 0 }, line: lltv }));
}

/** The collateral's level from a day's lines: the debt at its price over the
 *  collateral and the LLTV. */
function morphoLevels(lines: readonly HealthLine[]): Map<string, number> {
  const out = new Map<string, number>();
  const coll = lines.find((l) => l.asset === MORPHO_COLL_KEY && l.coll > 0);
  const debt = lines.reduce((s, l) => s + l.debt * l.price, 0);
  if (coll && coll.lt > 0 && debt > 0) out.set(MORPHO_COLL_KEY, morphoLiqPrice(coll.coll, debt, coll.lt));
  return out;
}

/** Morpho Blue's source: the market's oracle, its LLTV. */
export function morphoHealthSource(chain: number, loanSymbol: string): HealthSource {
  return {
    oracle: "the market oracle's",
    pool: "the market",
    chain,
    factors: ["LLTV", "liquidation loan-to-value (LLTV)"],
    readAt: "fixed when the market was created",
    priceAt: ["at each event's block, held between events", "at the latest event's block on or before the day"],
    held: "the market's LLTV, fixed when the market was created",
    live: "the card's LTV now: the debt over the collateral's value at the market's oracle, from the live market read",
    stepped: true,
    levels: {
      of: morphoLevels,
      formula: "debt ÷ (collateral × LLTV)",
      summary: `Liquidation level — the collateral's price, in ${loanSymbol}, at which the position's LTV reaches the market's LLTV: the debt, grown by the market's interest, divided by the collateral and the LLTV. The LLTV never changes, so the level moves with the debt and the collateral alone.`,
      here: {
        live: "Here at the card's debt and collateral now.",
        read: "Here at the debt and collateral after the event at block {block}, the debt grown by the market's interest to the end of {day}.",
      },
    },
    ratio: {
      label: "LTV",
      liquidates: "above",
      formula: "debt ÷ (collateral × market oracle price)",
      line: {
        formula: "above the LLTV the position can be liquidated",
        summary:
          "Liquidation line — the market's liquidation loan-to-value (LLTV), fixed when the market was created: above it a liquidator can repay the debt and take collateral.",
      },
      help: `on the same days: the debt over the collateral's value at the market oracle's price, in ${loanSymbol}. The oracle is read at each event's block, so a day between events keeps the last event's price and is drawn dotted; the debt grows by the market's interest. The red line is the market's LLTV, fixed when the market was created; above it the position can be liquidated. The list in the tip picks it or the collateral's price.`,
    },
  };
}

/** The collateral price's sentence in the how-to-read. */
export function morphoPriceHelp(loanSymbol: string): string {
  return `on the same days, in ${loanSymbol} at the market oracle's price at each event's block, held between events and drawn dotted there; the red line is where the position liquidates, the debt ÷ (collateral × LLTV) after each event, grown by the market's interest between.`;
}
