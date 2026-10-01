"use client";

// Compound V3 (Comet) event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. The touched axis's resulting on-chain balance after this
// event, replayed from the per-(market, account) signed base / per-asset
// collateral deltas; each value is a sum of chain fields and traces via <Prov>.
// Base events show the SIGNED base (lent / borrowed); collateral events show that
// asset's collateral balance. Current value WITH interest is a layer, absent.

import { unreadBalanceText, useCompoundBalanceRead } from "./balance-read";
import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  CompoundAbsorbBreakdown,
  type CompoundPreviousRow,
} from "@/components/protocol/compound/compound-absorb-breakdown";
import {
  compoundAmount,
  compoundBaseBefore,
  compoundBaseCaption,
  impliedYearlyRate,
  isBaseDust,
} from "@/lib/compound/row-facts";
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
import { CompoundRateNote } from "@/components/protocol/compound/compound-rate-note";
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

/** A before within one unit of zero is Comet's rounding: it reads as zero,
 *  and its receipt says why. */
function dustBefore(
  t: ChainTruthStat["transition"],
  isDust: boolean,
  sym: string,
  decimals: number,
): ChainTruthStat["transition"] {
  if (!t || !isDust) return t;
  const unit = (10 ** -decimals).toFixed(decimals);
  return {
    ...t,
    before: "0",
    beforeExact: "0",
    beforeProv: {
      ...t.beforeProv,
      summary: `Balance before — 0. After minus the change lands within one unit (${unit} ${sym}) of zero: Comet rounds a balance's present value down, so a flat balance reads one unit either side of zero. Shown as 0.`,
    },
  };
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
    ...(ctx.quoteUsd != null ? { quoteUsd: ctx.quoteUsd } : {}),
  };
  const balanceRead = useCompoundBalanceRead();
  const stats: ChainTruthStat[] = [];
  // Interest since the account's previous row (Ethereum rows carry it; the
  // Base sweep's do not), stated under the base balance as a magnitude.
  const interestSincePrevious = (sym: string): ChainTruthStat["interestSincePrevious"] => {
    // One unit either way is Comet's rounding, not interest.
    if (ctx.baseInterest == null || isBaseDust(ctx.baseInterest, m.baseDecimals)) return undefined;
    const signed = ctx.baseInterest;
    const mag = signed.startsWith("-") ? signed.slice(1) : signed;
    // The yearly rate that growth works out to, over the balance the
    // previous row left and the time between the two.
    // Interest is rounded to the token's last unit, so under a thousand units
    // the rate it works out to is mostly rounding: not stated.
    const meaningful = Number(mag) >= 1000 * 10 ** -m.baseDecimals;
    const rate =
      meaningful && previous?.baseAfter != null && timestamp != null
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
    const before = compoundBaseBefore(ctx, m.baseDecimals);
    if (ctx.baseUnsettled)
      stats.push({
        label: "Base balance",
        value: "",
        display: unreadBalanceText(balanceRead),
        symbol: "",
        prov: baseAfterProv(ctx.assetSymbol, coords),
        changed: false,
      });
    else
      stats.push({
        label: ctx.baseAfter != null ? compoundBaseCaption(before, ctx.baseAfter) : "Base balance",
        value: fmt(ctx.baseAfter),
        symbol: ctx.assetSymbol,
        prov: baseAfterProv(ctx.assetSymbol, coords),
        interestSincePrevious: interestSincePrevious(ctx.assetSymbol),
        transition: dustBefore(
          reconstructTransition({
            after: ctx.baseAfter,
            change: ctx.assetsDelta,
            changeProv,
            beforeProv: baseBeforeProv(ctx.assetSymbol, coords),
          }),
          before === "0" && decimalSub(ctx.baseAfter ?? "0", ctx.assetsDelta) !== "0",
          ctx.assetSymbol,
          m.baseDecimals,
        ),
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
    if (ctx.baseAfter != null && !ctx.baseUnsettled) {
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

  const averageStated = stats.some((st) => st.interestSincePrevious?.after != null);
  const showRates =
    ctx.eventType !== "absorb_debt" &&
    stats.some((st) => st.interestSincePrevious != null) &&
    previous != null &&
    blockNumber != null &&
    previous.blockNumber < blockNumber;
  return (
    <>
      <ChainTruthDetail stats={stats} />
      {showRates && (
        <CompoundRateNote
          chainId={coords.chainId}
          marketKey={m.key}
          prevBlock={previous!.blockNumber}
          block={blockNumber!}
          hasAverage={averageStated}
        />
      )}
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
