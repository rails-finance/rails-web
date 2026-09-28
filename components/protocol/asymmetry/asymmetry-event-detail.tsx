"use client";

// Asymmetry event detail (chain-state tier) — adapter onto the shared ChainTruthDetail
// grid. Shows the Trove's resulting branch collateral + USDaf debt after this event,
// each a directly-emitted TroveUpdated absolute (chain; batched debt derived from
// batch shares), with a before→after transition (before = the previous event's value).

import type { AsymmetryContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { liquityForkStateStats } from "@/components/protocol/liquity-fork/liquity-fork-state-stats";
import { LiquidationForensics } from "@/components/shared/liquidation-forensics";
import {
  buildForkLiquidationForensics,
  forkLiquidationStats,
} from "@/components/protocol/liquity-fork/liquity-fork-forensics";
import {
  collAfterProv,
  debtAfterProv,
  collDeltaProv,
  debtDeltaProv,
  collBeforeProv,
  debtBeforeProv,
  atBlockPriceProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  liquidationLegProv,
  rateAtEventProv,
  upfrontFeeProv,
  accruedInterestProv,
  redemptionFeeKeptProv,
  redemptionActProv,
  emittedRedemptionPriceProv,
  collUsdProv,
  collRatioProv,
  rateBeforeProv,
  costPerYearProv,
  batchDebtShareProv,
  batchFeeShareProv,
  type AsymmetryCoords,
} from "@/lib/asymmetry/event-provenance";
import { DEBT_SYMBOL } from "@/lib/asymmetry/asset-catalog";
// formatUsdValue, not format-event's formatUsd: the prose echo keys on the
// value STRING, and the two round differently ($1,912.94 vs $1,913).
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface AsymmetryEventDetailProps {
  ctx: AsymmetryContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

const STATE_PROVS = {
  collAfterProv,
  debtAfterProv,
  collDeltaProv,
  debtDeltaProv,
  collBeforeProv,
  debtBeforeProv,
  rateAtEventProv,
  upfrontFeeProv,
  accruedInterestProv,
  atBlockPriceProv,
  collUsdProv,
  collRatioProv,
  rateBeforeProv,
  costPerYearProv,
  batchDebtShareProv,
  batchFeeShareProv,
};

export function AsymmetryEventDetail({ ctx, txHash, blockNumber }: AsymmetryEventDetailProps) {
  const coords: AsymmetryCoords = {
    txHash,
    blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  // The Liquity V2 grid's cells: collateral with its value, debt with the
  // interest and fee under it, the ratio and the rate with its cost per year
  // (components/protocol/liquity-fork/liquity-fork-state-stats.tsx).
  const stats: ChainTruthStat[] = liquityForkStateStats(ctx, coords, DEBT_SYMBOL, STATE_PROVS);

  // A redemption's own three facts: the price the branch acted at (emitted with
  // the act, not read back), the fee the redeemer left in this Trove, and the
  // branch-wide redemption this Trove was a slice of. Redemptions are the bulk of
  // Asymmetry's timeline, so this is the block most of its cards will show.
  const red = ctx.redemption;
  if (ctx.eventType === "redeemCollateral" && red) {
    const emitted = ctx.priceAtBlock?.source === "redemption-event-price" ? ctx.priceAtBlock.usd : null;
    if (emitted != null) {
      stats.push({
        label: "Branch price",
        value: formatUsdValue(emitted),
        symbol: "",
        prov: emittedRedemptionPriceProv(coords, emitted),
      });
    }
    if (Number(red.feeKeptColl) > 0) {
      stats.push({
        label: "Redemption fee kept",
        value: fmt(red.feeKeptColl),
        symbol: ctx.collateralSymbol,
        prov: redemptionFeeKeptProv(coords, { fee: red.feeKeptColl }),
      });
    }
    stats.push({
      label: "Branch redemption",
      value: fmt(red.actual),
      symbol: DEBT_SYMBOL,
      prov: redemptionActProv(coords, { actual: red.actual, attempted: red.attempted }),
    });
  }

  // Where a liquidation's debt went and the surplus left for the owner — the
  // Liquidation log's legs, the receipts the prose echoes.
  stats.push(...forkLiquidationStats(ctx, coords, liquidationLegProv, DEBT_SYMBOL));

  // The whole-trove valued block — the branch's MCR at the event's block names
  // where the premium tops out (the transform stamps it as mcrAtEvent).
  const forensics =
    ctx.eventType === "liquidate"
      ? buildForkLiquidationForensics(
          ctx,
          coords,
          { atBlockPriceProv, liqSeizedUsdProv, liqClearedFaceProv, liqPremiumProv },
          { stablecoin: DEBT_SYMBOL },
        )
      : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
