// The wire shape of one f(x) position read at the blocks around its timeline
// rows (/api/chain/fx/event-state): getPosition and getPositionDebtRatio at
// block − 1 and at the block, so a row can state what it changed (a rebalance
// moves the position with no event of its own, and the Operate event carries
// no debt ratio), the wstETH→stETH rate on the wstETH pool, and the pool's
// two lines. With `prices` the oracle's anchor and min legs, with `tick` the
// tick the position sits in and the ticks holding debt above it, and with
// `tx` the fee schedule the manager's caller paid.
//
// rails-server reads them (api services/fx-event-state.ts, GET
// /api/at-block/fx/event-state; rails-ops decisions/0056): each eth_call kept
// once at a finalized block, the transaction facts the fee read needs kept the
// same way. The route proxies it.

import type { FxPoolKey } from "@/lib/fx/asset-catalog";

/** The position at one block, 1e18-scaled integers as strings: collateral in
 *  the pool's normalized unit, debt in fxUSD, the debt ratio 0–1e18, the
 *  wstETH→stETH rate (wstETH pool only), and the pool's rebalance and
 *  liquidation lines (debt ratio 1e18, bonus 1e9). */
export interface FxStateAt {
  block: number;
  colls: string | null;
  debts: string | null;
  ratio: string | null;
  rate: string | null;
  rebalanceLine?: string | null;
  rebalanceBonus?: string | null;
  liquidateLine?: string | null;
  liquidateBonus?: string | null;
  /** With `prices`: the oracle's anchor and min legs, USD per normalized
   *  unit, 1e18. */
  anchorPrice?: string | null;
  minPrice?: string | null;
  /** With `tick`: the tick the position's shares sit in at this block. */
  tick?: number | null;
  /** With `tick`: how many ticks holding debt sit above that tick (0 = it is
   *  the top tick, where a redemption starts). */
  ticksAbove?: number | null;
}

/** Fee ratios (fractions, 1e9 on chain) the pool applied to the caller. */
export interface FxFeeSchedule {
  /** The account that called the manager (the fee is charged to it). */
  caller: string;
  supply: number;
  withdraw: number;
  borrow: number;
  repay: number;
  /** The pool's default schedule at the same block; `custom` when the
   *  caller's differs from it. */
  defaults?: { supply: number; withdraw: number; borrow: number; repay: number } | null;
  custom?: boolean;
  /** The transaction's sender and the contract it called. */
  signer?: string;
  target?: string | null;
  /** A filled f(x) limit order: the holder who signed it, the contract that
   *  filled it. */
  limitOrder?: { manager: string; maker: string; taker: string } | null;
}

export interface FxEventState {
  pool: FxPoolKey;
  id: string;
  /** Keyed by block number: each asked block and the block before it. */
  reads: Record<string, FxStateAt>;
  /** With `tx`: the schedule in force for the caller, null before
   *  PoolConfiguration existed. */
  fees?: FxFeeSchedule | null;
  /** The manager's share of a rebalance/liquidation bonus (0.1 = 10%), read
   *  at the first asked block − 1. */
  expenseRatio?: number | null;
}

/** At most this many rows' blocks per request (the card's rebalance split). */
export const FX_EVENT_STATE_MAX_BLOCKS = 60;
