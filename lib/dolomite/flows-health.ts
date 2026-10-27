// Dolomite's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 5; the view
// is lib/shared/flows-health.ts), in the card's terms: the margin ratio
// against the account's liquidation line.
//
// RULES.
// - A day's margin ratio is the core's adjusted supply ÷ adjusted borrow:
//   Σ supply × price ÷ (1 + premium) over Σ borrow × price × (1 + premium),
//   the flows replay's balances at the day's close (grown by each market's
//   index) at the day's price (each row's oracle price at its block, the
//   daily store's close between rows). With the account's risk override set
//   the core skips the premiums, so each counts 1.
// - The line is 1 + the account's margin ratio (the override where one is
//   set, the global ratio otherwise), the card's "Liquidation line".
// - The global ratio, each market's premium and the override are read at the
//   head alone (none is stored per block), so the view holds today's across
//   the life: one read, nothing per event, no day dotted.
// - The card states no liquidation price, so the view draws no level on an
//   asset's price.
// - On an open position today's ratio and line are the card's.
//
// Pure.

import type { FactorRead, HealthSource } from "@/lib/shared/flows-health";

/** The account's risk figures now, from the page's live read. */
export interface DolomiteRisk {
  /** The block the live read is at. */
  block: number;
  /** 1 + the account's margin ratio: the line. */
  required: number;
  /** The override is set: the core skips the premiums. */
  override: boolean;
  /** The card's margin ratio, null with no debt. */
  ratio: number | null;
}

/** Today's line and premiums as the one read the view holds across the life:
 *  each market's supply counts at 1 ÷ ((1 + premium) × line), so the health
 *  factor × the line is the margin ratio; its borrow at 1 + premium. Null
 *  where a market held in the life has no premium read. */
export function dolomiteHeldRead(
  markets: readonly string[],
  premiums: Readonly<Record<string, number>>,
  risk: DolomiteRisk,
): FactorRead | null {
  if (!(risk.required > 0) || markets.length === 0) return null;
  const lt: Record<string, number> = {};
  const dw: Record<string, number> = {};
  for (const m of markets) {
    const p = risk.override ? 0 : premiums[m];
    if (p == null || !(p >= 0)) return null;
    lt[m] = 1 / ((1 + p) * risk.required);
    if (p > 0) dw[m] = 1 + p;
  }
  return { day: 0, block: risk.block, lt, ...(Object.keys(dw).length > 0 ? { dw } : {}), line: risk.required };
}

/** Dolomite's source: the core's oracle, today's line and premiums. */
export const DOLOMITE_HEALTH_SOURCE: HealthSource = {
  oracle: "the Dolomite core's oracle",
  pool: "the Dolomite core",
  chain: 1,
  factors: ["margin ratio and premiums", "margin ratio and market premiums"],
  readAt: "today, held across the life",
  held: "today's margin ratio and market premiums (read at block {block}), held across the life: none is stored per block",
  live: "the card's margin ratio now: adjusted supply ÷ adjusted borrow, the core's getAdjustedAccountValues",
  levels: {
    of: () => new Map(),
    formula: "none: the card states no liquidation price",
  },
  ratio: {
    label: "Margin ratio",
    liquidates: "below",
    digits: 2,
    formula: "Σ supply × price ÷ (1 + premium) ÷ Σ borrow × price × (1 + premium)",
    line: {
      formula: "below 1 + the account's margin ratio the account can be liquidated",
      summary:
        "Liquidation line — 1 + the account's margin ratio as the core states it today (the account's override where one is set), held across the life: the ratio, the premiums and the override at a past block are not stored. Below it Dolomite can liquidate the account.",
    },
    help: "on the same days: the account's supply over its borrow at the core's oracle price each day, each market adjusted by its margin premium. The red line is 1 + the account's margin ratio. Both use today's margin ratio, premiums and any account override, held across the life, since none is stored at a past block; below the line the account can be liquidated. The list in the tip picks it or a market's price.",
  },
};
