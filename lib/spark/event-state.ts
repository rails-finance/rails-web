// What a SparkLend event card reads from the position state around its
// transaction — the Aave V3 Base lane's chain read at blocks N−1 and N
// (/api/chain/spark/position-state, lib/aave-v3/position-state), reduced to the
// figures the card's T2 grid and T3 prose state: health factor, loan-to-value,
// the limits, e-mode, the event's own reserve, and for a liquidation the
// health factor at the prices the call ran at.
//
// Client-safe: no RPC.

import {
  baseToUsd,
  findReserve,
  humanOf,
  wadToNumber,
  type AaveV3PositionState,
  type AaveV3PositionStateReserve,
} from "@/lib/aave-v3/position-state";
import type { SparkContext } from "@/lib/shared/types/event-shape";

export interface SparkEmodeRead {
  id: number;
  /** The category's on-chain label ("ETH"); null for none or unread. */
  label: string | null;
  ltvBps: number | null;
  liquidationThresholdBps: number | null;
  liquidationBonusBps: number | null;
}

export interface SparkAccountRead {
  collateralUsd: number;
  debtUsd: number;
  /** Debt ÷ collateral; null with no collateral. */
  ltv: number | null;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  /** Null with no debt. */
  hf: number | null;
}

export interface SparkEventState {
  before: SparkAccountRead;
  after: SparkAccountRead;
  /** How much more the account could borrow once the transaction had run:
   *  collateral × max LTV − debt, never below zero. */
  roomUsdAfter: number;
  emodeBefore: SparkEmodeRead;
  emodeAfter: SparkEmodeRead;
  /** The e-mode category once the previous transaction had run; set where a
   *  previous read landed. */
  emodePrevious?: SparkEmodeRead;
  /** The event's own reserve (the collateral, on a liquidation). */
  reserve?: AaveV3PositionStateReserve;
  /** The reserve's liquidation threshold and LTV as the account counts them
   *  (the e-mode category's, where the reserve is in it). */
  reserveLtBps?: number;
  reserveLtvBps?: number;
  /** Health factor once the previous transaction had run, and the collateral
   *  price move since (the largest among the collateral held). */
  prevHf?: number | null;
  priceMove?: { symbol: string; from: number; to: number };
  /** A liquidation: the health factor from the balances before the call at the
   *  oracle prices of block N, which the call ran at (seized = repaid × bonus ÷
   *  price reproduces at these prices), beside the end-of-N−1 figure. */
  liqHfAtCall?: number | null;
  /** A liquidation: the collateral's price at the end of N−1 and at N. */
  liqPriceMove?: { symbol: string; from: number; to: number };
}

const bpsOf = (n: number | null | undefined): number | null => (n == null ? null : n);

function emodeRead(state: AaveV3PositionState, id: number): SparkEmodeRead {
  const cat = id > 0 ? state.emode?.categories[String(id)] : undefined;
  return {
    id,
    label: cat?.label ?? null,
    ltvBps: bpsOf(cat?.ltvBps),
    liquidationThresholdBps: bpsOf(cat?.liquidationThresholdBps),
    liquidationBonusBps: bpsOf(cat?.liquidationBonusBps ?? null),
  };
}

function accountRead(side: NonNullable<AaveV3PositionState["account"]>["before"]): SparkAccountRead {
  const collateralUsd = baseToUsd(side.totalCollateralBase);
  const debtUsd = baseToUsd(side.totalDebtBase);
  return {
    collateralUsd,
    debtUsd,
    ltv: collateralUsd > 0 ? debtUsd / collateralUsd : null,
    maxLtvBps: side.ltvBps,
    liquidationThresholdBps: side.liquidationThresholdBps,
    hf: side.healthFactor == null ? null : wadToNumber(side.healthFactor),
  };
}

/** The reserve's threshold and LTV as the account counts them. */
function effective(r: AaveV3PositionStateReserve, emode: SparkEmodeRead): { lt: number; ltv: number } {
  if (r.inEmode && emode.id > 0 && emode.liquidationThresholdBps != null && emode.ltvBps != null)
    return { lt: emode.liquidationThresholdBps, ltv: emode.ltvBps };
  return { lt: r.liquidationThresholdBps ?? 0, ltv: r.ltvBps ?? 0 };
}

const priceOf = (r: AaveV3PositionStateReserve): number | null =>
  r.priceBase == null ? null : Number(r.priceBase) / 1e8;

/** The health factor from the balances before the transaction, valued at the
 *  block's oracle prices: Σ collateral × price × threshold ÷ Σ debt × price. */
function hfAtBlockPrices(state: AaveV3PositionState, emode: SparkEmodeRead): number | null {
  let weighted = 0;
  let debt = 0;
  for (const r of state.reserves) {
    const p = priceOf(r);
    if (p == null || r.decimals == null) return null;
    const supply = Number(humanOf(r.supply.before, r.decimals));
    const owed = Number(humanOf(r.debt.before, r.decimals));
    if (r.collateral?.before && supply > 0) weighted += supply * p * (effective(r, emode).lt / 1e4);
    debt += owed * p;
  }
  return debt > 0 ? weighted / debt : null;
}

export function sparkEventState(
  ctx: SparkContext,
  reserveAddress: string | undefined,
  here: AaveV3PositionState | undefined,
  prev: AaveV3PositionState | undefined,
): SparkEventState | undefined {
  if (!here?.account) return undefined;
  const before = accountRead(here.account.before);
  const after = accountRead(here.account.after);
  const emodeBefore = emodeRead(here, here.emode?.before ?? 0);
  const emodeAfter = emodeRead(here, here.emode?.after ?? 0);
  const isLiq = ctx.eventType === "liquidation";
  const reserve = findReserve(
    here,
    isLiq ? ctx.collateralAsset : reserveAddress,
    isLiq ? ctx.collateralSymbol : ctx.reserveSymbol,
  );
  const eff = reserve ? effective(reserve, emodeAfter) : undefined;
  const out: SparkEventState = {
    before,
    after,
    roomUsdAfter: Math.max(0, (after.collateralUsd * after.maxLtvBps) / 1e4 - after.debtUsd),
    emodeBefore,
    emodeAfter,
    reserve,
    reserveLtBps: eff?.lt,
    reserveLtvBps: eff?.ltv,
  };
  if (prev?.account && prev.txHash.toLowerCase() !== here.txHash.toLowerCase()) {
    out.emodePrevious = emodeRead(prev, prev.emode?.after ?? 0);
    out.prevHf = prev.account.after.healthFactor == null ? null : wadToNumber(prev.account.after.healthFactor);
    let best: SparkEventState["priceMove"];
    for (const r of here.reserves) {
      if (!r.collateral?.before || r.priceBase == null) continue;
      const p = prev.reserves.find((q) => q.reserve === r.reserve);
      if (!p?.priceBase) continue;
      const from = Number(p.priceBase) / 1e8;
      const to = Number(r.priceBase) / 1e8;
      if (!best || Math.abs(to / from - 1) > Math.abs(best.to / best.from - 1))
        best = { symbol: r.symbol ?? "the collateral", from, to };
    }
    if (best && Math.abs(best.to / best.from - 1) >= 0.005) out.priceMove = best;
  }
  if (isLiq) {
    out.liqHfAtCall = hfAtBlockPrices(here, emodeBefore);
    // The collateral's price at the end of N−1: its USD share of the account's
    // collateral then, over the balance before (the only collateral, or the
    // move is not stated).
    const held = here.reserves.filter(
      (r) => r.collateral?.before && r.decimals != null && Number(humanOf(r.supply.before, r.decimals)) > 0,
    );
    if (held.length === 1 && reserve && held[0].reserve === reserve.reserve && reserve.decimals != null) {
      const amount = Number(humanOf(reserve.supply.before, reserve.decimals));
      const from = before.collateralUsd / amount;
      const to = priceOf(reserve);
      if (to != null && amount > 0 && Math.abs(to / from - 1) >= 0.0005)
        out.liqPriceMove = { symbol: reserve.symbol ?? "the collateral", from, to };
    }
  }
  return out;
}

/** How the card names an e-mode category: its on-chain label, else its id. */
export const emodeLabel = (e: SparkEmodeRead): string => (e.id === 0 ? "none" : e.label ? e.label : `category ${e.id}`);
