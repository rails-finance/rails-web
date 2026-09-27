// What a self-liquidation did with the position's collateral, split three ways.
// ----------------------------------------------------------------------------
// `selfLiquidate` (AlchemistV3.sol) runs in three steps and emits two logs:
//
//   1. `_forceRepay(account.earmarked)` pays the debt set aside for repayment
//      from the collateral, takes the line's protocol fee on those shares, and
//      emits `ForceRepay(amount, creditToYield, protocolFeeTotal)`.
//   2. The rest of the debt is paid from the collateral, in shares at that
//      block's price, to the Transmuter.
//   3. Whatever collateral is left is swept to the `recipient` the holder
//      named. NO EVENT STATES THIS: the only trace is the vault's own share
//      `Transfer` in the same transaction.
//
// `SelfLiquidated(amount)` then states step 1's `creditToYield` PLUS step 2's
// shares. Read beside the `ForceRepay`, the set-aside shares are in both logs,
// so a total that adds the two counts them twice; that double count, less the
// unstated sweep, is what left eth-aleth/795's lifetime flows 0.035 mixWETH
// short (rails-ops decisions/0032, "What a self-liquidation does with the
// collateral").
//
// So: the rest of the debt is the close's amount less the same transaction's
// `creditToYield`, two logged figures subtracted; the swept collateral is the
// reading before the close less the close's amount and the fee, a reading and
// two logged figures. Verified against the vault's transfers on 795 to the wei,
// and on all 52 Ethereum self-liquidations the flows now reconcile to zero.

import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import type { AlchemixReading } from "@/lib/alchemix/readings-before";

export interface SelfLiquidationSplit {
  /** `SelfLiquidated.amount`: every share that paid debt, set-aside part included. */
  totalRaw: bigint;
  /** The same transaction's `ForceRepay.creditToYield`: shares that paid the
   *  debt set aside for repayment. Zero where the close had none to pay. */
  setAsideRaw: bigint;
  /** The same transaction's `ForceRepay.protocolFeeTotal`. */
  feeRaw: bigint;
  /** Shares that paid the rest of the debt: total less the set-aside part. */
  restRaw: bigint;
  /** Collateral swept back to the holder's chosen address. Null without a
   *  reading before the close on the timeline. */
  returnedRaw: bigint | null;
  /** The debt the close paid off, set-aside part included: the reading before
   *  it, since the close leaves none. Null without that reading. */
  debtBeforeRaw: bigint | null;
  /** The block of the reading `returnedRaw` is measured from. */
  beforeBlock: number | null;
}

const big = (raw: string | null | undefined): bigint => {
  if (raw == null) return BigInt(0);
  const s = raw.split(".")[0];
  return /^\d+$/.test(s) ? BigInt(s) : BigInt(0);
};

/** The split for one `self_liquidated` row. `siblings` are the rows sharing its
 *  transaction; `before` is the reading at the previous reading block. */
export function selfLiquidationSplit(
  leg: AlchemistEvent,
  siblings: AlchemistEvent[],
  before: AlchemixReading | null,
): SelfLiquidationSplit | null {
  const ctx = leg.context.data;
  if (ctx.eventType !== "self_liquidated") return null;
  const totalRaw = big(ctx.raw.amount_liquidated);
  const forced = siblings.filter(
    (s) =>
      s.context.data.eventType === "force_repay" && s.txHash === leg.txHash && s.context.data.tokenId === ctx.tokenId,
  );
  const setAsideRaw = forced.reduce((a, s) => a + big(s.context.data.raw.credit_to_yield), BigInt(0));
  const feeRaw = forced.reduce((a, s) => a + big(s.context.data.raw.protocol_fee_total), BigInt(0));
  const restRaw = totalRaw > setAsideRaw ? totalRaw - setAsideRaw : BigInt(0);
  let returnedRaw: bigint | null = null;
  if (before?.collateralRaw != null) {
    const r = big(before.collateralRaw) - totalRaw - feeRaw;
    // One wei either way is the getCDP rounding the sweep records.
    returnedRaw = r > BigInt(1) ? r : BigInt(0);
  }
  return {
    totalRaw,
    setAsideRaw,
    feeRaw,
    restRaw,
    returnedRaw,
    debtBeforeRaw: before?.debtRaw != null ? big(before.debtRaw) : null,
    beforeBlock: before?.blockNumber ?? null,
  };
}
