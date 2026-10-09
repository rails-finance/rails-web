"use client";

// Aave V3 event body (rails-ops reference/shared-event-card-spec.md §4; ui-jobs
// 309 step 6): the parts of the card's T2 the shell draws, built from the
// event's row and the position read around its transaction.
//
// Two lanes, decided by whether the card carries its market:
//   • Ethereum (Core / Prime / EtherFi) and Base read the position state around
//     the event's transaction when the card opens (rails-ops TO-DO-ui-jobs §19;
//     Base from the chain at blocks N−1 and N): the account's Collateral and
//     Debt cells with each reserve's exact before → after, interest included,
//     then the health factor, LTV, what can still be borrowed and eMode
//     (aave-family-cells.tsx). While that is read the cells stand as
//     placeholders; where it cannot be, a cell states the event's change.
//     RULE (§47): one statement of a balance. A reserve the read lists is
//     stated by its side cell alone, and the event's change keeps its
//     receipt on the header. A row the index valued at the chain balance
//     (ctx.balanceBasis "chain", decision 0033) states that balance from the
//     row where the read is unavailable, and the interest the lane
//     accrued since the transaction that last moved it.
//   • Seamless, and a Base event sharing its block with another of the
//     owner's transactions, state the row's balance, before → after: the chain
//     balance where the replay valued it, else the principal replayed from the
//     per-reserve deltas.
// USD rides the oracle price at the event's block — the at-block read on the
// read lane, the captured price (mig 092) on the principal lane — and the
// prices the figures use stand in the price row. A block with no price keeps
// the card token-only. The interest since the previous event is a sub-line of
// the side it accrued on; the rates behind it stay in the explanation.

import type { ReactNode } from "react";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { AaveV3SwapLegAction, AaveV3SwapPoolEvent } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { chainTruthDeltaValue, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { EventCells, EventLedgerCellSpec } from "@/components/shared/event-cells";
import type { EventPriceChip } from "@/components/shared/event-price-row";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FlowSide } from "@/lib/shared/flows-timeline";
import { ACCOUNT_CELL_HEADS, aaveV3RiskCells, accountSideCells, interestSubs, priceChips, rowCell } from "./aave-family-cells";
import {
  supplyAfterProv,
  debtAfterProv,
  assetsDeltaProv,
  transferDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  writtenOffDebtProv,
  supplyBeforeProv,
  debtBeforeProv,
  atBlockPriceProv,
  snapshotUsdProv,
  swapLegNet,
  swapLegProv,
  swapLegSign,
  liqLegUsdProv,
  liqPremiumProv,
  liqBonusRefProv,
  exactBalanceProv,
  exactBalanceChangeProv,
  rowChainBalanceProv,
  rowInterestProv,
  prevEventInterestProv,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import { Prov } from "@/components/shared/provenance";
import {
  LiquidationFiguresNotLoaded,
  LiquidationForensics,
  buildLiquidationForensics,
  type AtBlockPricePill,
} from "@/components/shared/liquidation-forensics";
import { signedAmount } from "./aave-v3-ct-event-header";
import {
  exactLeg,
  exactUsd,
  reserveSymbol,
  statePricePills,
  type TouchedLeg,
} from "./aave-v3-position-state";
import { formatCompact, formatNumber, formatUsdValue } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { useAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import { useUnreadTokens } from "@/components/shared/unread-tokens-context";
import {
  findReserve,
  groupExact,
  humanOf,
  legChange,
  legHeld,
  sincePrevious,
  type AaveV3PositionState,
} from "@/lib/aave-v3/position-state";
import { AmountText, ExactTip } from "@/components/shared/amount-text";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { fmt2 } from "@/lib/aave-v3/liquidation-fee";
import { v3Protocol } from "@/lib/aave-v3/protocol-name";
import { SEAMLESS_FREEZE_BLOCK, SEAMLESS_FREEZE_DATE } from "@/lib/seamless/asset-catalog";

export interface AaveV3CtEventDetailProps {
  ctx: AaveV3Context;
  txHash?: string;
  blockNumber?: number;
  /** The position's owner. */
  wallet?: string;
  /** The served market key. Set on Ethereum and Base; its presence selects the
   *  position-state lane (see AaveV3CtEventCard). */
  market?: string;
  /** This transfer is the protocol fee of that liquidation (same transaction):
   *  the card states the fee's own change, and the account figures stay on the
   *  liquidation's card. */
  feeOf?: AaveV3Context;
  /** On a liquidation, its fee transfer to the treasury, where the timeline
   *  holds one. */
  fee?: AaveV3Context;
  /** The previous transaction: its after-state is where this event's
   *  interest line starts. */
  previous?: { blockNumber: number; txHash: string };
  /** The timeline event: the card's lifetime sum and its link to the chart. */
  eventId?: string;
  eventTs?: number;
  /** The card has opened: the reads start then, so a closed card asks for
   *  nothing. */
  active?: boolean;
}

/** The card's T2 parts, and the read they came from. */
export interface AaveV3EventBody {
  cells: EventCells;
  /** The grid's data attributes: the read's state. */
  cellsData?: Record<string, string>;
  /** Lines under the grid: a liquidation's figures, a fee's, a missing read. */
  notes?: ReactNode;
  /** The prices the cells' USD figures use. */
  prices: EventPriceChip[];
  /** The rates behind the interest sub-lines, for the explanation. */
  rateNote?: ReactNode;
  /** The read around the transaction, where it landed. */
  state?: AaveV3PositionState;
  stateCoords: V3Coords;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** A row behind a ParaSwap swap card, by the index action it was. */
const SWAP_ROW_LABEL: Record<AaveV3SwapPoolEvent["action"], string> = {
  transfer_out: "Sent to be swapped",
  supply: "Supply",
  borrow: "Borrow",
  repay: "Repay",
};

/** The after-balance USD chip payload — after × the reserve's captured
 *  at-block oracle price. Undefined until the price walk reaches the block
 *  (token-only render — partial fill is a safe state) and for a zeroed
 *  balance (a $0 chip would restate the 0 beside it). */
function usdOf(
  after: string | undefined,
  price: { usd: number } | undefined,
  prov: (amount: string, priceUsd: number) => Provenance,
): { value: number; prov: Provenance } | undefined {
  if (!price || after == null) return undefined;
  const n = Number(after);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return { value: n * price.usd, prov: prov(after, price.usd) };
}

/** One balance a stat reads. */
interface Axis {
  label: string;
  symbol: string;
  /** The reserve's address, where the context carries it. */
  reserve?: string;
  side: "supply" | "debt";
  /** The event's own signed change on this axis, in token units. */
  change: string | null;
  changeProv: Provenance;
  /** The row's own balance after the event and its raw integer: the chain
   *  balance when `chain` is set, else the principal replay. */
  principalAfter?: string;
  principalRawAfter?: string;
  /** The row's figures are the chain balance (ctx.balanceBasis): the before
   *  figure, the scaled balance and index behind the after figure, and the
   *  interest since the lane's previous move. */
  chain?: { rawBefore?: string; scaled?: string; index?: string; interest?: string };
  price?: { usd: number };
}

export function useAaveV3EventBody({
  ctx,
  txHash,
  blockNumber,
  wallet,
  market,
  feeOf,
  fee,
  previous,
  eventTs,
  active = true,
}: AaveV3CtEventDetailProps): AaveV3EventBody {
  const coords: V3Coords = {
    txHash,
    blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  // A fee row shares the liquidation's transaction, so the read around the
  // transaction would restate the liquidation: it states its own change only.
  const readMarket = feeOf || !active ? undefined : market;
  const state = useAaveV3PositionState({ wallet, market: readMarket, block: blockNumber, txHash });
  const ready = state?.status === "ready" ? state.data : undefined;
  // The previous transaction's state (the explainer reads the same one): the
  // interest line runs from that event's after-balance, so T2 and T3 chain
  // event to event.
  const prevState = useAaveV3PositionState({
    wallet,
    market: readMarket,
    block: previous?.blockNumber,
    txHash: previous?.txHash,
  });
  const prevReady = prevState?.status === "ready" ? prevState.data : undefined;
  // A token in scope whose decimals did not load: the event's amounts carry the
  // 18-decimal stand-in, so no line below states or derives a figure from them.
  const unread = useUnreadTokens();
  // The position-state receipts also name the owner.
  // The Base lane's reads are chain reads at the block, and say so.
  const stateCoords: V3Coords = {
    ...coords,
    ...(wallet ? { wallet: wallet.toLowerCase() } : {}),
    ...(ready?.sources.balances === "chain-read-at-block" ? { stateRead: "chain-at-block" as const } : {}),
  };

  // Reserves the block below always draws a row for, dust or not, because the
  // grid gives way to that row for the same balance (§47, §52).
  const touched: TouchedLeg[] = [];
  // The interest line of a stat that gave way to the block's row: drawn under
  // the grid, so the row still states it.
  const interestLines: (NonNullable<ChainTruthStat["interestSincePrevious"]> & {
    symbol: string;
    side: "supply" | "debt";
  })[] = [];
  // The sides whose balance the event moved (ui-jobs 243).
  const moved = new Set<"supply" | "debt">();
  // The balances whose interest line runs from the previous event: the note
  // under them states the reserve's rate at both ends.
  const rated: { reserve: string; symbol: string; side: "supply" | "debt" }[] = [];

  /** Interest since the previous event, from the two position reads; where
   *  they are not in hand, the row's own figure, which runs from the last
   *  transaction that moved this balance and is labelled so. */
  const interestOf = (a: Axis): ChainTruthStat["interestSincePrevious"] => {
    // A Base row names its reserve by symbol only; the read names it by address.
    const reserve = ready ? (findReserve(ready, a.reserve, a.symbol)?.reserve ?? a.reserve) : a.reserve;
    const since = ready ? sincePrevious(ready, prevReady, reserve, a.side) : undefined;
    // Interest under a millionth of a token is below what the line can show.
    if (since && Number(since.interest) < 1e-6) return undefined;
    if (since && reserve && !rated.some((x) => x.reserve === reserve && x.side === a.side))
      rated.push({ reserve, symbol: a.symbol, side: a.side });
    if (since)
      return {
        value: since.interest,
        prov: prevEventInterestProv(a.symbol, a.side, stateCoords),
        label: `${a.side === "debt" ? "Interest on the debt" : "Supply interest"} since the previous event`,
      };
    if (since || (ready && previous && prevState?.status === "loading")) return undefined;
    return a.chain?.interest
      ? {
          value: a.chain.interest,
          prov: rowInterestProv(a.symbol, a.side, coords),
          label: `${a.side === "debt" ? "Interest on the debt" : "Supply interest"} since this balance last moved`,
        }
      : undefined;
  };

  /** The row's own balance, before → after (the chain's where the index valued it). */
  const rowStat = (a: Axis): ChainTruthStat => ({
    label: a.label,
    value: fmt(a.principalAfter),
    symbol: a.symbol,
    ...(a.chain ? { address: a.reserve } : {}),
    prov: a.chain
      ? rowChainBalanceProv(a.symbol, a.side, "after", coords, {
          raw: a.principalRawAfter,
          scaled: a.chain.scaled,
          index: a.chain.index,
        })
      : a.side === "supply"
        ? supplyAfterProv(a.symbol, coords, a.principalRawAfter)
        : debtAfterProv(a.symbol, coords, a.principalRawAfter),
    usd: usdOf(a.principalAfter, a.price, (amount, priceUsd) =>
      snapshotUsdProv(a.symbol, a.side, coords, { amount, priceUsd }),
    ),
    transition: reconstructTransition({
      after: a.principalAfter,
      change: a.change,
      changeProv: a.changeProv,
      beforeProv: a.chain
        ? rowChainBalanceProv(a.symbol, a.side, "before", coords, { raw: a.chain.rawBefore, index: a.chain.index })
        : a.side === "supply"
          ? supplyBeforeProv(a.symbol, coords)
          : debtBeforeProv(a.symbol, coords),
    }),
    interestSincePrevious: interestOf(a),
  });

  /** Each balance stat's side, for its cell. */
  const sideOf = new Map<ChainTruthStat, FlowSide>();
  /** The axis' stat, or null where the read's side cell states the balance. */
  const statFor = (a: Axis): ChainTruthStat | null => {
    if (Number(a.change ?? "0") !== 0) moved.add(a.side);
    const s = axisStat(a);
    if (s) sideOf.set(s, a.side === "supply" ? "collateral" : "debt");
    return s;
  };
  const axisStat = (a: Axis): ChainTruthStat | null => {
    if (!state) return rowStat(a);
    const r = ready ? findReserve(ready, a.reserve, a.symbol) : undefined;
    // While the read is pending or where it failed, a row the index valued
    // states its own chain balance.
    if ((!ready || !r || r.decimals == null) && a.chain && a.principalAfter != null) return rowStat(a);
    if (!ready || !r || r.decimals == null) {
      // Loading, unavailable, or a reserve the answer does not list: the event's
      // own change, the same figure and receipt the header carries.
      const n = Number(a.change ?? "0");
      return {
        label: a.label,
        value: chainTruthDeltaValue(n, false),
        display: `${n < 0 ? "−" : "+"}${formatCompact(Math.abs(n))}`,
        symbol: a.symbol,
        address: a.reserve,
        prov: a.changeProv,
      };
    }
    const sym = reserveSymbol(r);
    const leg = a.side === "supply" ? r.supply : r.debt;
    // The block below states every reserve held on this side (its closed
    // cell's tokens or icon, and the cell's ledger line by asset). Where it
    // holds this one, the grid says nothing about it, and the block's dust
    // rule never hides its icon (§52).
    if (legHeld(leg)) {
      touched.push({ reserve: r.reserve, side: a.side });
      const line = interestOf(a);
      if (line) interestLines.push({ ...line, symbol: a.symbol, side: a.side });
      return null;
    }
    const before = humanOf(leg.before, r.decimals);
    const after = humanOf(leg.after, r.decimals);
    const moved = legChange(leg, r.decimals);
    const sign = moved.sign < 0 ? "−" : "+";
    return {
      label: a.label,
      value: groupExact(after),
      symbol: a.symbol,
      address: r.reserve,
      prov: exactBalanceProv(
        sym,
        a.side,
        "after",
        stateCoords,
        exactLeg(leg, "after", r.decimals, ready.blockTimestamp),
      ),
      usd: exactUsd(ready, r, a.side, "after", stateCoords),
      transition:
        moved.sign === 0
          ? undefined
          : {
              before: formatCompact(Number(before)),
              beforeExact: groupExact(before),
              beforeProv: exactBalanceProv(
                sym,
                a.side,
                "before",
                stateCoords,
                exactLeg(leg, "before", r.decimals, ready.blockTimestamp),
              ),
              change: `${sign}${formatCompact(Number(moved.magnitude))}`,
              changeExact: `${sign}${groupExact(moved.magnitude)}`,
              changeProv: exactBalanceChangeProv(sym, a.side, stateCoords, {
                before: groupExact(before),
                after: groupExact(after),
              }),
            },
      interestSincePrevious: interestOf(a),
    };
  };

  /** The chain fields of the row's supply or debt lane. */
  const chainOf = (side: "supply" | "debt"): Axis["chain"] =>
    ctx.balanceBasis === "chain"
      ? side === "supply"
        ? {
            rawBefore: ctx.raw?.supplyBefore,
            scaled: ctx.raw?.supplyScaledAfter,
            index: ctx.raw?.supplyIndex,
            interest: ctx.supplyInterestSincePrevious,
          }
        : {
            rawBefore: ctx.raw?.debtBefore,
            scaled: ctx.raw?.debtScaledAfter,
            index: ctx.raw?.debtIndex,
            interest: ctx.debtInterestSincePrevious,
          }
      : undefined;

  const stats: ChainTruthStat[] = [];
  const push = (s: ChainTruthStat | null) => {
    if (s) stats.push(s);
  };
  // The rows behind a swap, and the netted leg: lines under the grid.
  const extras: ChainTruthStat[] = [];
  const sym = ctx.reserveSymbol ?? "—";

  if (ctx.eventType === "liquidation") {
    const collSym = ctx.collateralSymbol ?? "—";
    // Seized collateral reduces the supply balance (change negative).
    push(
      statFor({
        label: "Supplied",
        symbol: collSym,
        reserve: ctx.collateralAsset,
        side: "supply",
        change: ctx.liquidatedCollateralAmount != null ? String(-Number(ctx.liquidatedCollateralAmount)) : null,
        changeProv: seizedCollateralProv(
          collSym,
          coords,
          ctx.raw?.liquidatedCollateralAmount,
          ctx.origin?.liquidatedCollateralAmount,
        ),
        principalAfter: ctx.supplyAfter,
        principalRawAfter: ctx.raw?.supplyAfter,
        chain: chainOf("supply"),
        price: ctx.collateralPrice,
      }),
    );
    // Debt covered reduces the borrowed balance (change negative).
    push(
      statFor({
        label: "Borrowed",
        symbol: sym,
        reserve: ctx.reserve,
        side: "debt",
        change: ctx.debtToCover != null ? String(-Number(ctx.debtToCover)) : null,
        changeProv: debtRepaidProv(sym, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover),
        principalAfter: ctx.debtAfter,
        principalRawAfter: ctx.raw?.debtAfter,
        chain: chainOf("debt"),
        price: ctx.debtPrice,
      }),
    );
  } else if (ctx.eventType === "swap" && ctx.swap) {
    // Both reserves the swap moved, given then received, each on its own axis
    // (an aToken leg the supplied balance, a repay or borrow the debt).
    const s = ctx.swap;
    const legStat = (
      symbol: string,
      reserve: string | undefined,
      action: AaveV3SwapLegAction,
      after: string | undefined,
      rawAfter: string | undefined,
      amount: string | undefined,
      price: { usd: number } | undefined,
      changeProv: Provenance,
    ): ChainTruthStat | null => {
      const debt = action === "repay" || action === "borrow";
      // Named for the balance: two legs of one swap are two reserves.
      return statFor({
        label: debt ? `${symbol} debt` : `${symbol} supplied`,
        symbol,
        reserve,
        side: debt ? "debt" : "supply",
        change: String(swapLegSign(action) * Math.abs(Number(amount ?? "0"))),
        changeProv,
        principalAfter: after,
        principalRawAfter: rawAfter,
        price,
      });
    };
    const givenDebt = s.givenAction === "repay";
    const given = legStat(
      sym,
      ctx.reserve,
      s.givenAction,
      givenDebt ? ctx.debtAfter : ctx.supplyAfter,
      givenDebt ? ctx.raw?.debtAfter : ctx.raw?.supplyAfter,
      ctx.amount,
      ctx.price,
      swapLegProv(sym, s.givenAction, coords, ctx.raw?.amount, ctx.origin?.amount, s.kind, swapLegNet(s, "given"), s),
    );
    const rSym = s.receivedSymbol ?? "—";
    const receivedDebt = s.receivedAction === "repay" || s.receivedAction === "borrow";
    const received: ChainTruthStat | null =
      // A withdraw and swap's bought token left the position: its figure is the
      // Trade's (or a ParaSwap adapter's Swapped log), with no balance to move.
      s.receivedAction === "trade"
        ? {
            label: s.kind === "supply_from_swap" ? "Sold" : "Bought",
            value: fmt(s.receivedAmount),
            symbol: rSym,
            address: s.receivedAsset,
            prov: swapLegProv(rSym, "trade", coords, s.raw.receivedAmount, undefined, s.kind, undefined, s),
          }
        : legStat(
            rSym,
            s.receivedAsset,
            s.receivedAction,
            receivedDebt ? s.receivedDebtAfter : s.receivedSupplyAfter,
            receivedDebt ? s.raw.receivedDebtAfter : s.raw.receivedSupplyAfter,
            s.receivedAmount,
            s.receivedPrice,
            swapLegProv(
              rSym,
              s.receivedAction,
              coords,
              s.raw.receivedAmount,
              s.receivedOrigin,
              undefined,
              swapLegNet(s, "received"),
            ),
          );
    // A supply from a swap lists what it sold before the balance it supplied (D2).
    for (const leg of s.kind === "supply_from_swap" ? [received, given] : [given, received]) push(leg);
    // Where a leftover nets into a leg (§15 D4), every row behind the figures
    // above is listed with its own amount.
    // A collateral leg netted by a leftover states the net beside its rows:
    // taken, less supplied back unused.
    const netted =
      s.givenAction === "transfer_out" && (s.events ?? []).some((e) => e.leftover && e.action === "supply");
    if (netted)
      extras.push({
        label: "Sold, net",
        value: fmt(ctx.amount),
        symbol: sym,
        address: ctx.reserve,
        prov: swapLegProv(
          sym,
          s.givenAction,
          coords,
          ctx.raw?.amount,
          ctx.origin?.amount,
          s.kind,
          swapLegNet(s, "given"),
          s,
        ),
      });
    for (const e of s.events ?? []) {
      // A debt swap's repay of the old debt is the old debt's own change, stated
      // above (or in the position block): its row would say it twice.
      if (s.kind === "debt_swap" && e.leg === "given" && e.action === "repay") continue;
      const eSym = e.symbol ?? "—";
      extras.push({
        label: e.leftover
          ? e.action === "repay"
            ? s.kind === "debt_swap"
              ? "Returned unused"
              : "Repaid back unused"
            : "Supplied back unused"
          : s.kind === "debt_swap" && e.action === "borrow"
            ? "Borrowed to fund the swap"
            : SWAP_ROW_LABEL[e.action],
        // The precision the position block's rows use, so one figure reads the
        // same in T1, T2 and T3 (0.0614).
        value: String(Math.abs(Number(e.amount ?? "0"))),
        display: fmtPositionAmount(Math.abs(Number(e.amount ?? "0"))),
        symbol: eSym,
        address: e.asset,
        prov:
          e.action === "transfer_out"
            ? transferDeltaProv(eSym, "out", coords)
            : assetsDeltaProv(eSym, e.action === "supply" ? "supply" : "debt", coords, e.raw, e.origin),
      });
    }
  } else if (
    ctx.eventType === "supply" ||
    ctx.eventType === "withdraw" ||
    ctx.eventType === "transfer_in" ||
    ctx.eventType === "transfer_out"
  ) {
    // A transfer's change traces to the BalanceTransfer derivation (value ×
    // index), not a Pool log's own amount param — same reconstruction, its
    // own vocabulary entry.
    const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
    // The Pool sends the fee after the seizure, so the fee's balance runs from
    // the post-seizure balance to the liquidation's after-balance.
    const feeAxis = feeOf
      ? {
          principalAfter: feeOf.supplyAfter,
          principalRawAfter: feeOf.raw?.supplyAfter,
          chain:
            feeOf.balanceBasis === "chain"
              ? { scaled: feeOf.raw?.supplyScaledAfter, index: feeOf.raw?.supplyIndex }
              : undefined,
        }
      : null;
    push(
      statFor({
        label: "Supplied",
        symbol: sym,
        reserve: ctx.reserve,
        side: "supply",
        change: String(signedAmount(ctx)),
        changeProv: isTransfer
          ? transferDeltaProv(sym, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : assetsDeltaProv(sym, "supply", coords, ctx.raw?.amount, ctx.origin?.amount),
        principalAfter: feeAxis ? feeAxis.principalAfter : ctx.supplyAfter,
        principalRawAfter: feeAxis ? feeAxis.principalRawAfter : ctx.raw?.supplyAfter,
        chain: feeAxis ? feeAxis.chain : chainOf("supply"),
        price: ctx.price,
      }),
    );
  } else {
    // A borrow, a repay, or a write-off: one debt-axis reserve. The write-off's
    // change traces to the DeficitCreated log rather than a Pool `amount`
    // param; the reconstruction is the same.
    const writtenOff = ctx.eventType === "bad_debt_written_off";
    push(
      statFor({
        label: "Borrowed",
        symbol: sym,
        reserve: ctx.reserve,
        side: "debt",
        change: String(signedAmount(ctx)),
        changeProv: writtenOff
          ? writtenOffDebtProv(sym, coords, ctx.raw?.amount, ctx.origin?.amount)
          : assetsDeltaProv(sym, "debt", coords, ctx.raw?.amount, ctx.origin?.amount),
        principalAfter: ctx.debtAfter,
        principalRawAfter: ctx.raw?.debtAfter,
        chain: chainOf("debt"),
        price: ctx.price,
      }),
    );
  }

  // Liquidations gain the valued two-leg forensics beneath the snapshot grid,
  // once the oracle-price walk has priced both legs at this block. With a token
  // unread the block states "not loaded" (LiquidationFiguresNotLoaded) and no premium
  // is computed.
  const built =
    ctx.eventType === "liquidation" && !unread
      ? buildLiquidationForensics(ctx, coords, { atBlockPriceProv, liqLegUsdProv, liqPremiumProv })
      : undefined;
  // The Base index lanes carry the seized reserve's bonus at the block; the
  // premium reads against it. The Ethereum lanes never stored it.
  const bonus = ctx.liquidationBonusAtBlock;
  // Each leg leads with its token amount at the precision the prose uses, so
  // the card and the explanation state one figure.
  const legged = built
    ? {
        ...built,
        seizedLabel: fee ? "Collateral to the liquidator" : "Collateral seized",
        clearedLabel: "Debt cleared",
        premiumLabel: "Liquidator's premium",
        seized: { ...built.seized, amount: `${fmt2(ctx.liquidatedCollateralAmount)} ${ctx.collateralSymbol ?? ""}` },
        cleared: { ...built.cleared, amount: `${fmt2(ctx.debtToCover)} ${sym}` },
      }
    : undefined;
  // Where the premium rounds to the bonus and no fee is taken, the second line
  // says they match rather than printing the same figure again.
  const bonusText = bonus ? `+${((bonus.bonusBps - 10000) / 100).toFixed(2)}%` : null;
  const matches =
    !!legged && !!bonus && bonus.protocolFeeBps === 0 && `+${(legged.premium * 100).toFixed(2)}%` === bonusText;
  const forensics =
    legged && bonus
      ? {
          ...legged,
          premiumReference: matches
            ? { label: "Equal to the bonus set at this block", value: "", prov: liqBonusRefProv(coords, bonus) }
            : {
                label: "Bonus at block",
                value: `${bonusText}${bonus.protocolFeeBps > 0 ? ` (${bonus.protocolFeeBps / 100}% of it to the protocol)` : ""}`,
                prov: liqBonusRefProv(coords, bonus),
              },
        }
      : legged;

  // Ordinary events gain the at-block price footnote pill for the touched
  // reserve — the read the USD chip above derives from. Liquidations carry
  // their two pills inside the forensics block instead.
  const ctxPills: AtBlockPricePill[] = [
    ...(ctx.eventType !== "liquidation" && ctx.price && ctx.reserveSymbol
      ? [
          {
            symbol: ctx.reserveSymbol,
            priceUsd: ctx.price.usd,
            priceProv: atBlockPriceProv(ctx.reserveSymbol, coords, ctx.price.usd),
          },
        ]
      : []),
    // A swap's received reserve carries its own at-block price.
    ...(ctx.swap?.receivedPrice && ctx.swap.receivedSymbol
      ? [
          {
            symbol: ctx.swap.receivedSymbol,
            priceUsd: ctx.swap.receivedPrice.usd,
            priceProv: atBlockPriceProv(ctx.swap.receivedSymbol, coords, ctx.swap.receivedPrice.usd),
          },
        ]
      : []),
  ];
  // Once the position read has priced the account, the chip lists every price
  // the card's USD figures use, the event's own asset among them; an asset the
  // read does not hold (a swap's bought token that left the position) keeps
  // its captured price.
  const readPills = ready?.sources.market ? statePricePills(ready, stateCoords, touched) : [];
  const pricePills: AtBlockPricePill[] =
    readPills.length > 0
      ? [...readPills, ...ctxPills.filter((p) => !readPills.some((q) => q.symbol === p.symbol))]
      : ctxPills;
  // The interest line runs from the two position reads where both landed; a
  // previous read that failed leaves the supply interest on the collateral out.
  const prevUnread = !!ready && !!previous && prevState?.status === "unavailable";
  // The interest since the previous event, under the side it accrued on: from
  // the two position reads where both landed, else the stated balance's own
  // since its last move.
  const subs: Partial<Record<"supply" | "debt", NonNullable<EventLedgerCellSpec["sub"]>>> =
    ready && prevReady ? interestSubs(ready, prevReady, stateCoords) : {};
  const addSub = (side: "supply" | "debt", content: ReactNode) => {
    subs[side] = [...(subs[side] ?? []), { content }];
  };
  if (!(ready && prevReady))
    for (const l of interestLines)
      addSub(
        l.side,
        <span data-interest-since="" data-interest-side={l.side}>
          {l.label ?? "Interest since previous event"}:{" "}
          <Prov info={l.prov} value={l.value} symbol={l.symbol}>
            <span title={l.value}>
              <AmountText value={Number(l.value)} />
            </span>
          </Prov>{" "}
          {l.symbol}
        </span>,
      );
  if (prevUnread)
    addSub("supply", <>Supply interest on the collateral is left out: the position after the previous event was not read.</>);

  // The balances the event's row states: a ledger cell on its side where no
  // read stands, a plain cell where the read lists the account without it.
  const balanceStats = stats.filter((st) => sideOf.has(st));
  const rowCells = balanceStats.map((st, i) => rowCell(st, `row-${i}`, ready ? undefined : sideOf.get(st)));
  const risk = ready ? aaveV3RiskCells(ready, stateCoords, ctx.eventType === "liquidation") : null;
  // Before the card opens, a card with a read to make stands as the read's
  // placeholders.
  const waiting = state?.status === "loading" || (!active && !!market && !feeOf);
  const cells: EventCells =
    waiting
      ? { pending: ACCOUNT_CELL_HEADS }
      : ready && risk
        ? [...accountSideCells({ state: ready, coords: stateCoords, touched, moved, eventTs, sub: subs }), ...risk.cells, ...rowCells]
        : rowCells.length > 0
          ? rowCells
          : { none: "The event moved no balance the card can state." };
  // The amounts behind a swap (the bought token, the rows it merged, a netted
  // leg): lines under the grid.
  const lines = [...stats.filter((st) => !sideOf.has(st)), ...extras];

  const notes = (
    <>
      {lines.length > 0 && <EventRowLines rows={lines} />}
      {state?.status === "unavailable" && (
        <div
          className="px-5 pb-2 text-sm text-rb-500"
          data-position-state="unavailable"
          data-position-code={state.code}
        >
          {state.lasting
            ? "Position state isn’t available for this event."
            : "The position at this block was not read. Reload to try again."}
        </div>
      )}
      {risk?.notes && <div className="space-y-0.5 px-5 pb-2 text-xs text-rb-500">{risk.notes}</div>}
      {forensics && <LiquidationForensics {...forensics} rowCells />}
      {ctx.eventType === "liquidation" && unread && <LiquidationFiguresNotLoaded tokens={unread} />}
      {fee && ctx.collateralSymbol && !unread && (
        <div className="px-5 pb-2 text-xs text-rb-500">
          {fmt2(ctx.liquidatedCollateralAmount)} {ctx.collateralSymbol} to the liquidator + {fmt2(fee.amount)}{" "}
          {ctx.collateralSymbol} to the Aave treasury ={" "}
          {fmt2(String(Math.abs(Number(ctx.liquidatedCollateralAmount)) + Math.abs(Number(fee.amount))))}{" "}
          {ctx.collateralSymbol} removed from the position; the treasury&rsquo;s share is the liquidation&rsquo;s
          protocol fee, a separate row in the timeline.
        </div>
      )}
      {ctx.eventType === "transfer_out" && !feeOf && !unread && ctx.price && ctx.reserveSymbol && (
        <div className="px-5 pb-2 text-xs text-rb-500">
          The {fmt(ctx.amount)} {ctx.reserveSymbol} sent was worth{" "}
          {formatUsdValue(Math.abs(Number(ctx.amount)) * ctx.price.usd)} at the block&rsquo;s oracle price.
        </div>
      )}
      {feeOf && (
        <div className="px-5 pb-2 text-xs text-rb-500">
          Paid out of the liquidation in the same transaction; the account&rsquo;s figures for that transaction are on
          the liquidation&rsquo;s card.
        </div>
      )}
    </>
  );

  return {
    cells,
    cellsData:
      waiting
        ? { "data-position-state": "loading" }
        : ready
          ? { "data-position-state": "ready", "data-position-complete": ready.complete ? "true" : "false" }
          : undefined,
    notes,
    prices: priceChips(pricePills),
    rateNote:
      ready && prevReady && rated.length > 0 ? (
        <RateNote here={ready} prev={prevReady} rated={rated} seamless={v3Protocol(coords.pool) === "Seamless"} />
      ) : undefined,
    state: ready,
    stateCoords,
  };
}

/** The amounts behind an event that are not a balance (a swap's bought token,
 *  the rows a swap merged): one line each, the figure with its receipt. */
function EventRowLines({ rows }: { rows: ChainTruthStat[] }) {
  return (
    <div className="space-y-1 px-5 pb-2 text-sm" data-event-row-lines="">
      {rows.map((r, i) => (
        <div key={i} className="text-rb-500" data-event-row-line="">
          {r.label}{" "}
          <Prov
            info={r.prov}
            value={r.value}
            icon={r.symbol ? <TokenChipIcon symbol={r.symbol} address={r.address} size={14} /> : undefined}
          >
            <span className="font-semibold tabular-nums text-foreground">
              <ExactTip always text={r.display ?? formatCompact(Number(r.value))} exact={r.value} symbol={r.symbol} />
            </span>
          </Prov>
        </div>
      ))}
    </div>
  );
}

/** A reserve's yearly rate (ray) as a percentage. */
const rayPct = (ray: string): number => (Number(BigInt(ray) / BigInt(10) ** BigInt(21)) / 1e6) * 100;
/** Two decimals, or two significant figures under 0.1% so a small rate does not read 0.00%. */
const pctText = (p: number): string =>
  p > 0 && p < 0.1
    ? `${p.toLocaleString("en-US", { maximumSignificantDigits: 2 })}%`
    : `${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** The rate behind each interest line at both ends: the reserve's
 *  getReserveData rate once the previous event's block had run, and once this
 *  one's had. Interest accrues at each moment's rate, which moves with the
 *  share of the reserve on loan, so the two ends alone cannot explain the
 *  interest; the stretch's average from the reserve's own index at both reads
 *  can (index ratio − 1, per 365-day year). On Seamless, a stretch that spans
 *  the freeze says so, whichever way the rate went. */
function RateNote({
  here,
  prev,
  rated,
  seamless,
}: {
  here: AaveV3PositionState;
  prev: AaveV3PositionState;
  rated: { reserve: string; symbol: string; side: "supply" | "debt" }[];
  seamless: boolean;
}) {
  const seconds = here.blockTimestamp - prev.blockTimestamp;
  const rows = rated.flatMap((x) => {
    const h = here.reserves.find((r) => r.reserve.toLowerCase() === x.reserve.toLowerCase());
    const p = prev.reserves.find((r) => r.reserve.toLowerCase() === x.reserve.toLowerCase());
    const hl = h ? (x.side === "debt" ? h.debt : h.supply) : null;
    const pl = p ? (x.side === "debt" ? p.debt : p.supply) : null;
    if (!hl?.rate || !pl?.rate) return [];
    return [{ ...x, then: rayPct(pl.rate), now: rayPct(hl.rate), growth: indexGrowth(pl.index, hl.index) }];
  });
  // The at-block reads carry each reserve's getReserveData rate at the block;
  // the index's rows carry the rate of the last reserve update, not the block's.
  const atBlock = (s: AaveV3PositionState) => s.sources.balances === "chain-read-at-block";
  if (rows.length === 0 || !atBlock(here) || !atBlock(prev)) return null;
  const spansFreeze = seamless && prev.block < SEAMLESS_FREEZE_BLOCK && here.block >= SEAMLESS_FREEZE_BLOCK;
  // An average over less than a day says nothing the two ends do not.
  const days = seconds / 86400;
  const averaged = days >= 1 ? rows.filter((r) => r.growth != null && r.growth >= 0) : [];
  return (
    <div className="px-5 pb-2 text-xs leading-relaxed text-rb-500" data-rate-note="">
      <p>
        {rows.map((r) => (
          <span key={`${r.reserve}:${r.side}`}>
            {r.symbol} {r.side === "debt" ? "borrow" : "supply"} rate: {pctText(r.then)} a year after the previous event
            (block {prev.block.toLocaleString("en-US")}), {pctText(r.now)} at this block.{" "}
          </span>
        ))}
        Interest accrues at each moment&rsquo;s rate, which rises and falls with the share of the reserve on loan.
      </p>
      {averaged.length > 0 && (
        <p data-rate-average="">
          Over the {Math.round(days).toLocaleString("en-US")} day{Math.round(days) === 1 ? "" : "s"} between the two,{" "}
          {averaged.map((r, i) => {
            const g = r.growth as number;
            return (
              <span key={`${r.reserve}:${r.side}:avg`}>
                {i > 0 ? (i === averaged.length - 1 ? " and " : ", ") : null}
                the {r.symbol} {r.side === "debt" ? "borrow" : "supply"} rate averaged{" "}
                {pctText((g * 365 * 86400 * 100) / seconds)} a year ({r.side === "debt" ? "debt" : "supply"} index +
                {pctText(g * 100)})
              </span>
            );
          })}
          .
        </p>
      )}
      {spansFreeze && (
        <p>
          This stretch spans the freeze of every Seamless reserve on {SEAMLESS_FREEZE_DATE} (block{" "}
          {SEAMLESS_FREEZE_BLOCK.toLocaleString("en-US")}), after which nothing could be supplied or borrowed; the
          average covers the rates on both sides of it.
        </p>
      )}
    </div>
  );
}

/** The reserve index's growth between two reads (0.02728 = +2.728%), or null
 *  where either index is unread. */
function indexGrowth(from: string, to: string): number | null {
  try {
    const a = BigInt(from);
    const b = BigInt(to);
    if (a <= BigInt(0)) return null;
    // Twelve decimals of the ratio; the ray indexes carry 27.
    return Number(((b - a) * BigInt(10) ** BigInt(12)) / a) / 1e12;
  } catch {
    return null;
  }
}
