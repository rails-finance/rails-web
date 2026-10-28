// Fluid's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 5; the view
// is lib/shared/flows-health.ts), in the card's terms: the position ratio
// against the vault's liquidation threshold, on a T1 vault.
//
// RULES.
// - A day's position ratio is debt ÷ (collateral × price): the flows
//   replay's balances at the day's close (each grown by the vault's exchange
//   price as the rows imply it), the vault oracle's price in debt per
//   collateral (each row's at its block, the daily store's `fluid:<vault>`
//   close between rows).
// - The line is the vault's liquidation threshold in force at the day's
//   close, from the vault's config logs (lib/fluid/threshold-history.ts,
//   /api/fluid/threshold-history): it steps on the day governance changed
//   it. Where that history does not reach the position's first event, the
//   threshold the page's live read states today is held across the life
//   (`FLUID_HEALTH_SOURCE`, which says so). Every day's threshold is an
//   observation or the held value, so no day is drawn dotted.
// - The collateral's level is debt ÷ (collateral × threshold), in debt per
//   collateral, the price at which the ratio reaches the threshold, at the
//   threshold of the day.
// - On an open position today's ratio and level are the card's: its
//   position ratio (at the oracle's liquidate price) and the price at which
//   that ratio reaches the threshold (`liqPriceDebtPerCol`).
//
// Pure.

import type { FactorRead, HealthSource } from "@/lib/shared/flows-health";

/** The timeline's key for the collateral (lib/fluid/flows.ts). */
export const FLUID_COLL_KEY = "coll";

/** Today's threshold as the one read the view holds across the life. */
export function fluidHeldRead(liquidationThreshold: number, block: number): FactorRead | null {
  if (!(liquidationThreshold > 0)) return null;
  return { day: 0, block, lt: { [FLUID_COLL_KEY]: liquidationThreshold }, line: liquidationThreshold };
}

/** Fluid's source: the vault oracle, the vault's threshold today. */
export const FLUID_HEALTH_SOURCE: HealthSource = {
  oracle: "the vault oracle's",
  pool: "the vault",
  chain: 1,
  factors: ["liquidation threshold", "liquidation threshold"],
  readAt: "today, held across the life",
  held: "today's liquidation threshold (read at block {block}), held across the life: the threshold at a past block is not stored",
  live: "the card's position ratio now: debt ÷ (collateral × the vault oracle's liquidate price)",
  levels: {
    formula: "debt ÷ (collateral × liquidation threshold)",
    summary:
      "Liquidation level — the collateral's price, in debt per collateral, at which the position ratio reaches the vault's liquidation threshold: the debt divided by the collateral and the threshold, at the day's balances and today's threshold, held across the life.",
    here: {
      live: "Here at the card's balances and threshold now.",
      read: "Here at the balances of {day}, against today's liquidation threshold (read at block {block}), held across the life.",
    },
  },
  ratio: {
    label: "Position ratio",
    liquidates: "above",
    formula: "debt ÷ (collateral × vault oracle price)",
    line: {
      formula: "above the liquidation threshold the position can be liquidated",
      summary:
        "Liquidation line — the vault's liquidation threshold today, held across the life: the threshold at a past block is not stored. Above it Fluid can liquidate the position.",
    },
    help: "on the same days: the debt over the collateral at the vault oracle's price each day. The red line is today's liquidation threshold, held across the life, since the threshold at a past block is not stored; above it the position can be liquidated. The list in the tip picks it or the collateral's price.",
  },
};

/** Fluid's source where the vault's config logs give the threshold in force
 *  each day: the line steps where governance changed it. */
export const FLUID_HISTORY_HEALTH_SOURCE: HealthSource = {
  ...FLUID_HEALTH_SOURCE,
  readAt: "in force at each day's close (the vault's config logs)",
  held: "the liquidation threshold in force that day, set at block {block}",
  levels: {
    formula: "debt ÷ (collateral × liquidation threshold)",
    summary:
      "Liquidation level — the collateral's price, in debt per collateral, at which the position ratio reaches the vault's liquidation threshold: the debt divided by the collateral and the threshold, at the day's balances and the threshold in force that day.",
    here: {
      live: "Here at the card's balances and threshold now.",
      read: "Here at the balances of {day}, against the liquidation threshold in force that day, set at block {block}.",
    },
  },
  ratio: {
    ...FLUID_HEALTH_SOURCE.ratio!,
    line: {
      formula: "above the liquidation threshold the position can be liquidated",
      summary:
        "Liquidation line — the vault's liquidation threshold in force that day, from the vault's config logs: it steps on the day Fluid governance changed it. Above it Fluid can liquidate the position.",
    },
    help: "on the same days: the debt over the collateral at the vault oracle's price each day. The red line is the vault's liquidation threshold in force that day, which steps where Fluid governance changed it, each change a grey diamond on the events row; above it the position can be liquidated. The list in the tip picks it or the collateral's price.",
  },
};
