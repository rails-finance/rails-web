// SparkLend economics — the valued dual tower with lifetime flows and the
// interest split, and the card's captions.
// ----------------------------------------------------------------------------
// SparkLend is the Aave V3 Pool, so its ledger is Aave V3's reduction
// (lib/aave-v3/chain-truth-tower.ts) under SparkLend's classifier,
// `sparkEventLegs` (lib/spark/flows-timeline.ts), the one the date scrubber and
// the index's flows route (rails-server `SPARK_RULES`) count with: spToken
// transfers are "Received by transfer" and "Sent to another account", a
// transfer to the Spark WETH gateway is a withdrawal, and one to the Spark
// treasury inside a liquidation is that liquidation's fee. Each flow is valued
// at the oracle price its event carries, else today's; balances and what is
// held now at SparkLend's own oracle (IAaveOracle.getAssetPrice) today.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { SparkPositionView } from "@/components/protocol/spark/spark-position-card";
import type { SparkPositionChainResponse } from "@/lib/api/fetch-spark-position";
import {
  positionSupplyProv,
  positionDebtProv,
  sparkLifetimeFlowProv,
  sparkDebtInterestProv,
  sparkDebtPrincipalProv,
} from "@/lib/spark/event-provenance";
import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import type { AaveLaneInterest } from "@/lib/aave-v3/lane-interest";
import {
  aaveV3LifetimeWithOpening,
  computeAaveV3CardCaptions,
  computeAaveV3Economics,
  reduceAaveFamilyLifetime,
  unpricedAaveV3FlowAddresses,
  type AaveFamilyClassifier,
  type AaveV3CardCaptions,
  type AaveV3TowerData,
  type AaveV3TowerVocabulary,
  type ReserveFlows,
} from "@/lib/aave-v3/chain-truth-tower";
import { sparkEventLegs, sparkLiquidationTxs } from "@/lib/spark/flows-timeline";

export type { ReserveFlows };

/** SparkLend's classifier: the scrubber's, so the ledger counts as the bars do. */
export const SPARK_CLASSIFIER: AaveFamilyClassifier = {
  liquidationTxs: sparkLiquidationTxs,
  legs: sparkEventLegs,
};

/** The tower's receipts on SparkLend. */
const SPARK_VOCABULARY: AaveV3TowerVocabulary = {
  brand: "SparkLend",
  supply: positionSupplyProv,
  debt: positionDebtProv,
  lifetimeFlow: sparkLifetimeFlowProv,
  debtInterest: sparkDebtInterestProv,
  debtPrincipal: sparkDebtPrincipalProv,
};

/**
 * The lifetime flows for a WINDOWED page: the opening balance seeded first, the
 * folders the index served added next, the loaded rows added on top
 * (`aaveV3LifetimeWithOpening`). Pass the result to `computeSparkEconomics`,
 * `computeSparkCardCaptions` and `unpricedSparkFlowAddresses`. The index's
 * summary sums supply, withdraw, borrow, repay and liquidation legs only, so a
 * transfer below the cut is not in it (rails-ops TO-DO-ui-jobs §134).
 */
export function sparkLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  folders?: readonly ServedFolder[] | null,
): ReserveFlows[] | undefined {
  return aaveV3LifetimeWithOpening(events, opening, folders, SPARK_CLASSIFIER);
}

/** The lifetime flows the tower reads: the merged ones on a windowed page,
 *  else the events' own, else none. */
function lifetimeOf(events: BaseActivityEvent[] | undefined, precomputed?: ReserveFlows[]): ReserveFlows[] | undefined {
  if (precomputed) return precomputed;
  return events && events.length > 0 ? [...reduceAaveFamilyLifetime(events, SPARK_CLASSIFIER).values()] : undefined;
}

/** Reserve addresses contributing lifetime-flow lines that `priceByAddress`
 *  doesn't price — the exited or liquidated reserves the listing row (current
 *  reserves only) can't know about. The page prices these through
 *  /api/chain/spark/oracle-prices and merges the result. */
export function unpricedSparkFlowAddresses(
  view: SparkPositionView,
  events: BaseActivityEvent[],
  precomputed?: ReserveFlows[],
): string[] {
  return unpricedAaveV3FlowAddresses(view, events, lifetimeOf(events, precomputed) ?? []);
}

/** The liquidation read beneath the HF stat — shared by the card's footnote
 *  and the LLM export so the two agree number-for-number. One supplied reserve
 *  carrying ≥99.5% of the oracle-priced collateral anchors a single-asset
 *  liquidation price (oracle price ÷ HF — both legs on-chain; dust doesn't
 *  block the anchor); otherwise the 1 − 1/HF combined-collateral drop.
 *  All-null when there's no debt/HF, HF ≤ 1 (the HF value itself says
 *  liquidatable), or HF reads ∞. */
export interface SparkLiquidationRead {
  /** How far the whole collateral basket can fall before HF 1.0 (percent). */
  dropPct: number | null;
  /** The single-collateral anchor, when one reserve dominates. */
  single: { symbol: string; price: number; liqPrice: number } | null;
}

export function sparkLiquidationRead(view: SparkPositionView): SparkLiquidationRead {
  const hf = view.healthFactor;
  if (hf == null || hf <= 1 || hf >= 100) return { dropPct: null, single: null };
  const prices = view.priceByAddress;
  const priced = view.supplies
    .filter((r) => r.amount > 0)
    .map((r) => {
      const p = prices?.[r.address.toLowerCase()];
      return { r, price: typeof p === "number" && p > 0 ? p : null };
    });
  let single: SparkLiquidationRead["single"] = null;
  if (priced.length > 0 && priced.every((p) => p.price != null)) {
    const valued = priced.map((p) => ({ ...p, usd: (p.price as number) * p.r.amount }));
    const total = valued.reduce((s, p) => s + p.usd, 0);
    const top = valued.reduce((a, b) => (b.usd > a.usd ? b : a));
    if (total > 0 && top.usd / total >= 0.995) {
      single = { symbol: top.r.symbol, price: top.price as number, liqPrice: (top.price as number) / hf };
    }
  }
  return { dropPct: (1 - 1 / hf) * 100, single };
}

/** Position-card stat captions: accrued interest per side, the borrow rate. */
export type SparkCardCaptions = AaveV3CardCaptions;

export function computeSparkCardCaptions(
  view: SparkPositionView,
  events?: BaseActivityEvent[],
  chain?: SparkPositionChainResponse | null,
  /** The merged lifetime on a windowed page; when present `events` is not reduced. */
  precomputedLifetime?: ReserveFlows[],
): SparkCardCaptions {
  return computeAaveV3CardCaptions(view, events, chain, lifetimeOf(events, precomputedLifetime));
}

export function computeSparkEconomics(
  view: SparkPositionView,
  events?: BaseActivityEvent[],
  /** The merged lifetime on a windowed page; when present `events` is not reduced. */
  precomputedLifetime?: ReserveFlows[],
  /** Per lane: the net its events moved beside the chain balance (decision 0033). */
  laneInterest?: readonly AaveLaneInterest[] | null,
): AaveV3TowerData {
  return computeAaveV3Economics(view, events, SPARK_VOCABULARY, lifetimeOf(events, precomputedLifetime), laneInterest);
}
