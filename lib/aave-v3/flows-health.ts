// The Aave V3 Pools' source for the health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328, steps 4 and 5):
// the view is lib/shared/flows-health.ts; this file holds what the Aave V3
// Pools (Aave V3 Ethereum, SparkLend, Aave V3 on Base, Seamless) read and
// how their card draws a level.
//
// RULES.
// - A reserve counts as collateral where the position-state read has it
//   switched on after the transaction; in an e-mode category a member reserve
//   takes the category's threshold.
// - Where one reserve holds at least 99.5 % of the priced collateral and is
//   not borrowed, its level is its price ÷ the health factor, the card's
//   "Liquidates at" (`aaveV3LiquidationRead`), so the card's figure and the
//   chart's last point agree; every other asset takes ruling 7's level
//   (`basketLevels`).
//
// Pure.

import { basketLevels, type FactorRead, type HealthLine, type HealthSource } from "@/lib/shared/flows-health";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

const DAY_S = 86_400;
/** The card's single-collateral rule: one reserve's share of the priced collateral. */
const SINGLE_SHARE = 0.995;

/** A position-state answer's thresholds after its transaction. */
export function aaveV3ThresholdRead(state: AaveV3PositionState): FactorRead {
  const id = state.emode?.after ?? 0;
  const cat = id > 0 ? state.emode?.categories[String(id)] : undefined;
  const lt: Record<string, number> = {};
  for (const r of state.reserves) {
    const bps = r.inEmode && cat ? cat.liquidationThresholdBps : (r.liquidationThresholdBps ?? 0);
    lt[r.reserve.toLowerCase()] = r.collateral?.after ? bps / 1e4 : 0;
  }
  return { day: Math.floor(state.blockTimestamp / DAY_S), block: state.block, lt };
}

/** An Aave family's source: the route its thresholds come from, the family's
 *  position-state route by market (the default), or an Aave V4 spoke's state
 *  at the block (`/api/chain/aave-v4/spoke-position?block=`, the market being
 *  the spoke's key). */
export interface AaveHealthSource extends HealthSource {
  reader?: "position-state" | "aave-v4-spoke";
}

/** The Aave V3 Pools' levels (ruling 7, the card's 99.5 % rule). */
export function aaveV3Levels(lines: readonly HealthLine[], hf: number): Map<string, number> {
  let collUsd = 0;
  for (const l of lines) if (l.lt > 0) collUsd += l.coll * l.price;
  const out = basketLevels(lines);
  for (const l of lines)
    if (l.coll * l.lt > 0 && collUsd > 0 && (l.coll * l.price) / collUsd >= SINGLE_SHARE && l.debt === 0)
      out.set(l.asset, l.price / hf);
  return out;
}

export const AAVE_V3_LEVELS: NonNullable<HealthSource["levels"]> = {
  of: aaveV3Levels,
  formula:
    "the price at which the health factor reaches 1, every other balance and price held at the day's; where one reserve holds at least 99.5% of the collateral, its price ÷ the health factor",
};

/** Aave V3 on Ethereum. */
export const AAVE_V3_HEALTH_SOURCE: AaveHealthSource = { oracle: "the AaveOracle", pool: "the Pool", chain: 1 };
