// f(x)'s source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 6; the view
// is lib/shared/flows-health.ts), in the card's terms: the debt ratio against
// the pool's liquidation ratio, with its rebalance ratio as the second line.
//
// RULES.
// - A day's debt ratio is debt ÷ (collateral × price): the flows replay's
//   balances after the day's last event (nothing is grown between events:
//   the pool's funding and other positions' bad debt move the position with
//   no row, and the next row states them), the price that event was valued
//   at (lib/fx/flows.ts). A day with no event keeps the last
//   event's figures and is drawn dotted.
// - The two lines are the pool's getRebalanceRatios and getLiquidateRatios
//   as the page's /api/chain/fx/event-state read states them at the block of
//   each day's last event (the read the replay makes for its balances), or at
//   the latest read before it; held between events. Today's are the card's
//   (/api/chain/fx/terms at the head).
// - The collateral's levels are debts ÷ (colls × ratio), in fxUSD per
//   normalized unit, the price at which the debt ratio meets each line, as
//   the card's "Rebalances at" and "Liquidates at".
// - On an open position today's ratio is the card's settled debt ratio, and
//   the levels are worked from the settled debt and collateral.
//
// Pure.

import type { FactorRead, HealthSource } from "@/lib/shared/flows-health";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";

const DAY_S = 86_400;
const WAD = 1e18;

/** The timeline's key for the collateral (lib/fx/flows.ts). */
export const FX_COLL_KEY = "coll";

/** One pair of lines as the view's read. */
export function fxLinesRead(day: number, block: number, liquidate: number, rebalance: number): FactorRead {
  return { day, block, lt: { [FX_COLL_KEY]: liquidate }, line: liquidate, warn: rebalance };
}

/** The pool's two lines across the life: per day with events, the read at
 *  the day's last event's block, or the latest read before it that carries
 *  both lines. Null where no read does. */
export function fxLineReads(
  events: readonly { ts: number; block: number }[],
  reads: Record<string, FxStateAt>,
): FactorRead[] | null {
  const lined = Object.values(reads)
    .flatMap((r) => {
      const liq = r.liquidateLine != null ? Number(r.liquidateLine) / WAD : NaN;
      const reb = r.rebalanceLine != null ? Number(r.rebalanceLine) / WAD : NaN;
      return liq > 0 && reb > 0 ? [{ block: r.block, liq, reb }] : [];
    })
    .sort((a, b) => a.block - b.block);
  if (lined.length === 0) return null;
  const lastByDay = new Map<number, number>();
  for (const e of events) {
    const d = Math.floor(e.ts / DAY_S);
    lastByDay.set(d, Math.max(lastByDay.get(d) ?? 0, e.block));
  }
  const out: FactorRead[] = [];
  for (const [day, block] of [...lastByDay].sort((a, b) => a[0] - b[0])) {
    let at: (typeof lined)[number] | null = null;
    for (const r of lined) {
      if (r.block > block) break;
      at = r;
    }
    // A first event with no read at or before it takes the first read.
    at ??= lined[0];
    out.push(fxLinesRead(day, at.block, at.liq, at.reb));
  }
  return out;
}

/** f(x)'s source: the pool's oracle, its two lines. */
export const FX_HEALTH_SOURCE: HealthSource = {
  oracle: "the pool oracle's",
  pool: "the pool",
  chain: 1,
  factors: ["liquidation ratio", "rebalance and liquidation ratios"],
  readAt: "read at the block of each day's last event",
  priceAt: [
    "that each event was valued at, held between events",
    "that the latest event on or before the day was valued at",
  ],
  held: "the pool's rebalance and liquidation ratios read at block {block}",
  live: "the card's debt ratio now: the settled debt over the collateral's value at the oracle's anchor price",
  stepped: true,
  levels: {
    formula: "debts ÷ (colls × liquidation ratio)",
    summary:
      "Liquidation level — the collateral's price, in fxUSD, at which the position's debt ratio reaches the pool's liquidation ratio: the debt divided by the collateral and the ratio. The pool judges its lines at the oracle's min price.",
    here: {
      live: "Here at the card's settled debt and collateral, against the pool's liquidation ratio now.",
      read: "Here at the debt and collateral after the event at block {block}, against the pool's liquidation ratio read there.",
    },
  },
  ratio: {
    label: "Debt ratio",
    liquidates: "above",
    formula: "debts ÷ (colls × oracle price)",
    line: {
      formula: "above the liquidation ratio the position can be liquidated",
      summary:
        "Liquidation line — the pool's liquidation ratio (getLiquidateRatios): from this debt ratio a keeper can liquidate the position.",
    },
    warn: {
      verb: "Rebalances",
      formula: "above the rebalance ratio the position's tick can be rebalanced",
      summary:
        "Rebalance line — the pool's rebalance ratio (getRebalanceRatios): from this debt ratio a keeper can rebalance the position's tick, taking collateral to repay debt.",
      level: {
        formula: "debts ÷ (colls × rebalance ratio)",
        summary:
          "Rebalance level — the collateral's price, in fxUSD, at which the position's debt ratio reaches the pool's rebalance ratio: the debt divided by the collateral and the ratio. The pool judges its lines at the oracle's min price.",
        here: {
          live: "Here at the card's settled debt and collateral, against the pool's rebalance ratio now.",
          read: "Here at the debt and collateral after the event at block {block}, against the pool's rebalance ratio read there.",
        },
      },
    },
    help: "on the same days: the debt over the collateral at the price each event was valued at, held between events and drawn dotted there. The red line is the pool's liquidation ratio and the dashed amber line its rebalance ratio, each as read at the block of the day's last event; above them a keeper can liquidate the position or rebalance its tick. The list in the tip picks it or the collateral's price.",
  },
};

/** The collateral price's sentence in the how-to-read. */
export const FX_PRICE_HELP =
  "on the same days, in fxUSD at the price each event was valued at (the position's rows at the pool's recorded oracle price, the rows the pool made at the oracle's min price), held between events and drawn dotted there; the red line is where the position liquidates and the dashed amber line where its tick can be rebalanced, debts ÷ (colls × each ratio) after each event, at the ratios read at that event's block.";
