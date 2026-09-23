// A swept position → the shared Morpho card shape.
// ----------------------------------------------------------------------------
// The Ethereum explorer builds `MorphoPositionView` from an index row
// (viewFromSummary). The Base explorer has no index; it has the sweep's own
// replay of the position (lib/sources/chain/morpho-blue-events) and, beside
// it, the live read of the position's slots. This adapter marries the two the
// way the Ethereum page marries index and chain:
//
//   • collateral, borrowed principal, peaks, counts, the liquidation record —
//     from the REPLAY, which is the only thing that knows the history;
//   • current debt WITH interest — from the LIVE read, and only when the live
//     `borrowShares` slot equals the replayed one exactly. Shares are conserved,
//     so equality is the proof the sweep read every row; a mismatch means the
//     principal under the interest split is short, and the split is gated off
//     (the tower then states why) rather than drawn over a wrong operand.
//
// The status is the replay's, and it agrees with the slot by the same
// argument: a position the sweep closed is one the chain holds nothing in.

import type { MorphoPositionView } from "@/components/protocol/morpho/morpho-position-card";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import type { MorphoSweptPosition } from "@/lib/api/fetch-morpho-base-timeline";
import { marketLabel } from "@/lib/morpho/asset-catalog";
import { morphoHasCollateralRaw, morphoHasDebt } from "@/lib/morpho/position-legs";

// The two legs are the copy worker's — `chain_open` / `chain_has_debt`, which is
// what `baseMorpho.ts` filters and words the status by. This file read both of
// them differently, in OPPOSITE directions, until 2026-09-20 (TO-DO §46).

export function morphoViewFromSweep(
  pos: MorphoSweptPosition,
  wallet: string,
  chain: MorphoChainPositionResponse | null,
): MorphoPositionView {
  const hasColl = morphoHasCollateralRaw(pos.collateralRaw);
  const hasDebt = morphoHasDebt(pos.borrowSharesRaw);
  const status: MorphoPositionView["status"] =
    hasColl || hasDebt ? "open" : pos.everLiquidated ? "liquidated" : "closed";

  const live = chain && !chain.chainStale && chain.borrowSharesRaw === pos.borrowSharesRaw ? chain : null;
  const currentDebt =
    live && hasDebt && live.currentDebt > 0
      ? {
          amount: live.currentDebt,
          accruedAmount: Math.max(0, live.currentDebt - pos.borrowed),
          totalBorrowAssets: live.totalBorrowAssetsRaw,
          totalBorrowShares: live.totalBorrowSharesRaw,
        }
      : null;

  return {
    positionId: `${pos.marketId.replace(/^0x/, "")}-${wallet}`,
    marketId: pos.marketId,
    marketLabel: pos.marketLabel,
    loanSymbol: pos.loanSymbol,
    collateralSymbol: pos.collateralSymbol,
    loanToken: pos.loanToken,
    collateralToken: pos.isIdle ? undefined : pos.collateralToken,
    isIdle: pos.isIdle,
    owner: wallet,
    status,
    collateral: status === "open" ? pos.collateral : 0,
    borrowed: status === "open" ? pos.borrowed : 0,
    peakCollateral: pos.peakCollateral,
    peakBorrowed: pos.peakBorrowed,
    // A seeded replay (a vault's history, sent as its newest rows plus the
    // state behind them) has exact balances and no running high behind them.
    ...(pos.peaksPartial ? { peaksPartial: true } : {}),
    borrowSharesRaw: pos.borrowSharesRaw,
    currentDebt,
    lltv: pos.lltv,
    eventCount: pos.eventCount,
    txCount: pos.txCount,
    lastTs: pos.lastTs,
    everLiquidated: pos.everLiquidated,
    badDebt: pos.badDebt,
    atBlock: live?.blockNumber,
  };
}

/** The card a live singleton read can draw on its own, before (or without)
 *  the history behind it — the LISTED grammar the Base listing rows render:
 *  collateral, debt with interest as one figure, the collateral's oracle value
 *  at the block read, no principal, no peaks, no activity counts. The health
 *  factor is the live read's own, drawn in the risk slot beside the card, not
 *  a listed figure (0018). The Base position page shows this while the
 *  wallet's sweep is in flight, so the card that first paints is the same shell and columns the
 *  swept card (morphoViewFromSweep) fills in — the page gains history rather
 *  than swapping one card shape for another. Same rounding as the listing
 *  route: the slots as the contract answers them at head. */
export function morphoListedViewFromLive(p: MorphoChainPositionResponse, wallet: string): MorphoPositionView {
  const isIdle = p.lltv === 0;
  const hasColl = morphoHasCollateralRaw(p.collateralRaw);
  const hasDebt = morphoHasDebt(p.borrowSharesRaw);
  const priced = p.oraclePrice > 0 && !isIdle;
  return {
    positionId: `${p.marketId}-${wallet}`,
    marketId: p.marketId,
    marketLabel: marketLabel(p.loanSymbol, p.collateralSymbol, isIdle),
    loanSymbol: p.loanSymbol,
    collateralSymbol: isIdle ? null : p.collateralSymbol,
    loanToken: p.loanToken,
    collateralToken: isIdle ? undefined : p.collateralToken,
    isIdle,
    owner: wallet,
    status: hasColl || hasDebt ? "open" : "closed",
    collateral: p.collateral,
    borrowed: hasDebt ? p.currentDebt : 0,
    peakCollateral: 0,
    peakBorrowed: 0,
    borrowSharesRaw: p.borrowSharesRaw,
    currentDebt: null,
    lltv: p.lltv,
    eventCount: 0,
    txCount: 0,
    lastTs: null,
    everLiquidated: false,
    badDebt: 0,
    atBlock: p.blockNumber,
    listed: {
      block: p.blockNumber,
      readAt: new Date(p.timestamp * 1000).toISOString(),
      collateralValue: priced ? p.collateralValue : null,
      totalBorrowAssets: p.totalBorrowAssetsRaw,
      totalBorrowShares: p.totalBorrowSharesRaw,
    },
  };
}
