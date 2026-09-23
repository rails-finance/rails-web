"use client";

// Asymmetry event detail (chain-state tier) — adapter onto the shared ChainTruthDetail
// grid. Shows the Trove's resulting branch collateral + USDaf debt after this event,
// each a directly-emitted TroveUpdated absolute (chain; batched debt derived from
// batch shares), with a before→after transition (before = the previous event's value).

import type { AsymmetryContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics } from "@/components/shared/liquidation-forensics";
import { buildForkLiquidationForensics } from "@/components/protocol/liquity-fork/liquity-fork-forensics";
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
  rateAtEventProv,
  upfrontFeeProv,
  accruedInterestProv,
  redemptionFeeKeptProv,
  redemptionActProv,
  emittedRedemptionPriceProv,
  type AsymmetryCoords,
} from "@/lib/asymmetry/event-provenance";
import { FORK_RATE_PILL_EVENTS } from "@/lib/shared/liquity-fork-ops";
import { DEBT_SYMBOL, resolveBranch } from "@/lib/asymmetry/asset-catalog";
// formatUsdValue, not format-event's formatUsd: the prose echo keys on the
// value STRING, and the two round differently ($1,912.94 vs $1,913).
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface AsymmetryEventDetailProps {
  ctx: AsymmetryContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

export function AsymmetryEventDetail({ ctx, txHash, blockNumber }: AsymmetryEventDetailProps) {
  const coords: AsymmetryCoords = {
    txHash,
    blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  const stats: ChainTruthStat[] = [
    {
      label: "Collateral",
      value: fmt(ctx.collAfter),
      symbol: ctx.collateralSymbol,
      prov: collAfterProv(coords, ctx.origin?.coll),
      transition: reconstructTransition({
        after: ctx.collAfter,
        change: ctx.collDelta,
        changeProv: collDeltaProv(coords, undefined, ctx.origin?.coll),
        beforeProv: collBeforeProv(coords, ctx.originBefore?.coll),
      }),
    },
    {
      label: "Debt",
      value: fmt(ctx.debtAfter),
      symbol: DEBT_SYMBOL,
      prov: debtAfterProv(coords, ctx.origin?.debt),
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.debtDelta,
        changeProv: debtDeltaProv(coords, undefined, ctx.origin?.debt),
        beforeProv: debtBeforeProv(coords, ctx.originBefore?.debt, ctx.originBefore != null),
      }),
    },
  ];

  // The interest rate at this event — the receipt half of the header's rate
  // pill: same rateAtEventProv identity and the same exact 2-dp value key, so
  // the pill (echo) and this stat (primary) pulse as one. Scoped to the events
  // where the rate is the point — the same set the pill emits on. Symbol "" so
  // the grid renders no token glyph.
  if (ctx.interestRate != null && FORK_RATE_PILL_EVENTS.has(ctx.eventType)) {
    const rate = Number(ctx.interestRate);
    if (Number.isFinite(rate))
      stats.push({
        label: "Interest rate",
        value: `${rate.toFixed(2)}%`,
        symbol: "",
        prov: rateAtEventProv(coords, ctx.origin?.annualInterestRate),
      });
  }

  // ── The operation / redemption figures (the receipts the prose echoes) ────
  //
  // Each of these is a decoded log param the read path did not used to carry, and
  // each earns a place here for the same reason: the explainer states it in
  // words, so the charter's highlight rule needs it to have a receipt of its own
  // on the chrome. Every one is gated on presence — a Trove event with no fee,
  // no accrued interest and no redemption shows exactly the two stats it always
  // did. Values are formatted through the SAME `fmt` the prose echo uses, because
  // the echo key is the value string.

  const fee = ctx.operation?.debtUpfrontFee != null ? Number(ctx.operation.debtUpfrontFee) : 0;
  if (Number.isFinite(fee) && fee > 0) {
    stats.push({
      label: "Borrowing fee",
      value: fmt(ctx.operation?.debtUpfrontFee),
      symbol: DEBT_SYMBOL,
      prov: upfrontFeeProv(coords, { fee: ctx.operation!.debtUpfrontFee }),
    });
  }

  // Interest accrued between the Trove's last touch and this one — the residual
  // of the operation decomposition, and the only per-event interest figure this
  // lane can state. Regular rows only (the transform withholds it on batched
  // ones, whose after-debt is share-derived rather than emitted).
  const op = ctx.operation;
  if (op?.accruedInterest != null) {
    stats.push({
      label: "Interest accrued",
      value: fmt(op.accruedInterest),
      symbol: DEBT_SYMBOL,
      prov: accruedInterestProv(coords, {
        interest: op.accruedInterest,
        debtDelta: ctx.debtDelta,
        fromOperation: op.debtFromOperation,
        fee: op.debtUpfrontFee,
        redist: op.debtFromRedist,
      }),
    });
  }

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

  // The whole-trove valued block — the branch's own MCR names where the
  // premium tops out (this branch's liquidation line).
  const mcr = resolveBranch(ctx.collateralSymbol)?.mcr;
  const forensics =
    ctx.eventType === "liquidate"
      ? buildForkLiquidationForensics(
          ctx,
          coords,
          { atBlockPriceProv, liqSeizedUsdProv, liqClearedFaceProv, liqPremiumProv },
          { stablecoin: DEBT_SYMBOL, mcrPct: mcr != null ? mcr * 100 : undefined },
        )
      : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
