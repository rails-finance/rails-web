"use client";

// Compound V3 (Comet) event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. The touched axis's resulting on-chain balance after this
// event, replayed from the per-(market, account) signed base / per-asset
// collateral deltas; each value is a sum of chain fields and traces via <Prov>.
// Base events show the SIGNED base (lent / borrowed); collateral events show that
// asset's collateral balance. Current value WITH interest is a layer, absent.

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  CompoundAbsorbBreakdown,
  type CompoundPreviousRow,
} from "@/components/protocol/compound/compound-absorb-breakdown";
import { compoundAmount, compoundBaseCaption, impliedYearlyRate } from "@/lib/compound/row-facts";
import { decimalSub } from "@/lib/utils/format";
import {
  baseAfterProv,
  baseInterestProv,
  collateralAfterProv,
  baseDeltaProv,
  collateralDeltaProv,
  transferBaseProv,
  transferCollateralProv,
  absorbDebtProv,
  absorbCollateralProv,
  baseBeforeProv,
  collateralBeforeProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface CompoundEventDetailProps {
  ctx: CompoundContext;
  txHash?: string;
  blockNumber?: number;
  /** The row's time, unix seconds. */
  timestamp?: number;
  /** The account's previous row in this market, where the page has it: the
   *  interest line's yearly rate reads from it. */
  previous?: CompoundPreviousRow;
  /** The last row of the previous transaction: the absorb's "what moved". */
  previousTx?: CompoundPreviousRow;
}

const fmt = (human?: string): string => (human == null ? "—" : compoundAmount(Number(human)));

export function CompoundEventDetail({
  ctx,
  txHash,
  blockNumber,
  timestamp,
  previous,
  previousTx,
}: CompoundEventDetailProps) {
  const m = useCometMarket(ctx.market);
  const coords: CompoundCoords = {
    comet: m.comet,
    marketLabel: m.label,
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  const stats: ChainTruthStat[] = [];
  // Interest since the account's previous row (Ethereum rows carry it; the
  // Base sweep's do not), stated under the base balance as a magnitude.
  const interestSincePrevious = (sym: string): ChainTruthStat["interestSincePrevious"] => {
    if (ctx.baseInterest == null) return undefined;
    const signed = ctx.baseInterest;
    const mag = signed.startsWith("-") ? signed.slice(1) : signed;
    // The yearly rate that growth works out to, over the balance the
    // previous row left and the time between the two.
    const rate =
      previous?.baseAfter != null && timestamp != null
        ? impliedYearlyRate(Number(mag), Number(previous.baseAfter), timestamp - previous.timestamp)
        : null;
    const days = previous && timestamp != null ? (timestamp - previous.timestamp) / 86400 : null;
    return {
      value: mag,
      prov: baseInterestProv(sym, signed.startsWith("-") ? "borrow" : "lend", coords),
      ...(rate != null && days != null && Number(mag) > 0
        ? {
            after: `, over ${days < 10 ? days.toFixed(1) : Math.round(days).toLocaleString("en-US")} days: about ${(rate * 100).toFixed(1)}% a year`,
          }
        : {}),
    };
  };

  if (ctx.isBase) {
    // The moved-amount provenance depends on the event: an ordinary Supply /
    // Withdraw cites the base delta; an AbsorbDebt liquidation cites basePaidOut.
    const changeProv =
      ctx.eventType === "absorb_debt"
        ? absorbDebtProv(ctx.assetSymbol, coords)
        : ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out"
          ? transferBaseProv(ctx.assetSymbol, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : baseDeltaProv(ctx.assetSymbol, ctx.eventType === "supply" ? "supply" : "withdraw", coords);
    const before = ctx.baseAfter != null ? decimalSub(ctx.baseAfter, ctx.assetsDelta) : null;
    stats.push({
      label: ctx.baseAfter != null ? compoundBaseCaption(before, ctx.baseAfter) : "Base balance",
      value: fmt(ctx.baseAfter),
      symbol: ctx.assetSymbol,
      prov: baseAfterProv(ctx.assetSymbol, coords),
      interestSincePrevious: interestSincePrevious(ctx.assetSymbol),
      transition: reconstructTransition({
        after: ctx.baseAfter,
        change: ctx.assetsDelta,
        changeProv,
        beforeProv: baseBeforeProv(ctx.assetSymbol, coords),
      }),
    });
  } else {
    const collCoords: CompoundCoords = { ...coords, asset: undefined };
    const changeProv =
      ctx.eventType === "absorb_collateral"
        ? absorbCollateralProv(ctx.assetSymbol, collCoords)
        : ctx.eventType === "transfer_collateral_in" || ctx.eventType === "transfer_collateral_out"
          ? transferCollateralProv(
              ctx.assetSymbol,
              ctx.eventType === "transfer_collateral_in" ? "in" : "out",
              collCoords,
            )
          : collateralDeltaProv(
              ctx.assetSymbol,
              ctx.eventType === "supply_collateral" ? "supply" : "withdraw",
              collCoords,
            );
    stats.push({
      label: `${ctx.assetSymbol} collateral`,
      value: fmt(ctx.collateralAfter),
      symbol: ctx.assetSymbol,
      prov: collateralAfterProv(ctx.assetSymbol, collCoords),
      transition: reconstructTransition({
        after: ctx.collateralAfter,
        change: ctx.assetsDelta,
        changeProv,
        beforeProv: collateralBeforeProv(ctx.assetSymbol, collCoords),
      }),
    });
    // The account's base position AT this event — the debt (or lent balance)
    // the collateral stack stands behind, filling the grid's second column to
    // the reference cards' Collateral | Debt shape. Static: this event moved
    // no base, so there is no transition arrow; the value cites the same
    // replayed base_after receipt the base cards cite.
    if (ctx.baseAfter != null) {
      const b = Number(ctx.baseAfter);
      stats.push({
        label: b < 0 ? "Borrowed (base)" : b > 0 ? "Lent (base)" : "Base balance",
        value: fmt(ctx.baseAfter),
        symbol: m.baseSymbol,
        prov: baseAfterProv(m.baseSymbol, coords),
        interestSincePrevious: interestSincePrevious(m.baseSymbol),
      });
    }
  }

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {ctx.eventType === "absorb_debt" && (
        <CompoundAbsorbBreakdown
          ctx={ctx}
          coords={coords}
          marketKey={m.key}
          timestamp={timestamp}
          previous={previousTx}
        />
      )}
    </>
  );
}
