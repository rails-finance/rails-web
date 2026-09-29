"use client";

// f(x) event detail — adapter onto the shared ChainTruthDetail grid.
//
// Every row that moves the position states it before → after: getPosition and
// getPositionDebtRatio at block − 1 and at the block (/api/chain/fx/event-state,
// read when the row is opened). That is the only per-position figure a
// rebalance has, and the only debt ratio an operate has. Until the read lands
// an operate keeps the stored after-figures the timeline carries.
//
//   operate      — fee, collateral, debt, debt ratio, oracle price. The fee is
//                  the event's protocolFees where the old manager emitted one,
//                  else the caller's schedule at the block times the amounts.
//   liquidation  — what reached the liquidator (token units) and its stETH
//                  worth, what the protocol kept, the debt repaid and any debt
//                  left unpaid, and the position before → after.
//   rebalance    — the whole tick's (or pool's) figures, then this position's
//                  own change.

import type { FxContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import {
  ChainTruthDetail,
  reconstructTransition,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import {
  debtDeltaProv,
  protocolFeesProv,
  liqCollsProv,
  liqDebtRepaidProv,
  liqDebtTotalProv,
  impliedDebtAfterProv,
  chainAfterProv,
  chainBeforeProv,
  chainChangeProv,
  debtSincePreviousProv,
  snapOraclePriceProv,
  transferPartyProv,
  tickRebalanceHitProv,
  tickRebAmountProv,
  rowStateProv,
  rowChangeProv,
  wstethRateProv,
  stethEquivalentProv,
  protocolShareProv,
  unpaidDebtProv,
  feeScheduleProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { formatExact, formatNumber, formatTinyNonZero } from "@/lib/utils/format";
import { fxBeforeAfter, useFxEventState, type FxEventState, type FxSide } from "@/lib/fx/use-event-state";
import { fxRowFees, fxFeePct } from "@/lib/fx/row-figures";

export interface FxEventDetailProps {
  ctx: FxContext;
  txHash?: string;
  blockNumber?: number;
  /** The pool's rate-normalized unit symbol (stETH / WBTC). */
  normalizedSymbol: string;
  /** Rebalance rows: how many rebalance rows of this position share the block
   *  (the block read then covers them together). */
  blockPeers?: number;
}

const fmt = (human?: string | null): string => (human == null ? "—" : formatNumber(Number(human)));
const pct = (r: number): string => `${(r * 100).toFixed(1)}%`;
const DUST = 1e-12;

/** The reconstructed implied-debt BEFORE this event (after − change) — the
 *  same indexed lane as the after-figure, re-summarized for the inversion. */
const impliedDebtBeforeProv = (coords: FxCoords): Provenance => ({
  ...impliedDebtAfterProv(coords),
  summary:
    "Event-implied fxUSD debt before this event — the implied debt after it minus this event's debt delta. Funding and rebalances move the real debt between events with no per-position log, so this is the replay lane.",
  formula: "implied debt after − debt change",
});

/** A before → after pair from the row read, as a grid stat. */
function readStat(
  label: string,
  side: "coll" | "debt" | "ratio",
  symbol: string,
  before: FxSide | null,
  after: FxSide | null,
  coords: FxCoords,
): ChainTruthStat | null {
  const pick = (s: FxSide | null) =>
    s == null ? null : side === "coll" ? s.colls : side === "debt" ? s.debts : s.ratio;
  const a = pick(after);
  const b = pick(before);
  if (a == null) return null;
  const afterProv = rowStateProv(side, "after", symbol, coords);
  const beforeProv = rowStateProv(side, "before", symbol, coords);
  if (side === "ratio") {
    const transition: ChainTruthTransition | undefined =
      b != null && b > 0 && Math.abs(a - b) > 1e-9
        ? {
            before: pct(b),
            beforeExact: formatExact(b * 100),
            beforeProv,
            change: `${a >= b ? "+" : "−"}${(Math.abs(a - b) * 100).toFixed(1)} pts`,
            changeExact: `${a >= b ? "+" : "−"}${formatExact(Math.abs(a - b) * 100)}`,
            changeProv: rowChangeProv("ratio", symbol, coords),
            shownAsIs: true,
          }
        : undefined;
    return { label, value: formatExact(a * 100), display: pct(a), symbol: "", prov: afterProv, transition };
  }
  return {
    label,
    value: String(a),
    symbol,
    prov: afterProv,
    transition:
      b != null
        ? reconstructTransition({
            after: String(a),
            change: String(a - b),
            changeProv: rowChangeProv(side, symbol, coords),
            beforeProv,
          })
        : undefined,
  };
}

export function FxEventDetail({ ctx, txHash, blockNumber, normalizedSymbol, blockPeers }: FxEventDetailProps) {
  const state = useFxEventState(ctx, blockNumber, txHash);
  return (
    <FxEventDetailBody
      ctx={ctx}
      txHash={txHash}
      blockNumber={blockNumber}
      normalizedSymbol={normalizedSymbol}
      blockPeers={blockPeers}
      state={state}
    />
  );
}

function FxEventDetailBody({
  ctx,
  txHash,
  blockNumber,
  normalizedSymbol,
  blockPeers,
  state,
}: FxEventDetailProps & { state: FxEventState | null }) {
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const tokenSym = meta?.tokenSymbol ?? ctx.poolSymbol;
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const { before, after } = fxBeforeAfter(state, blockNumber);
  const rate = after?.rate ?? before?.rate ?? null;
  const stats: ChainTruthStat[] = [];

  // "= 1.748 stETH at 1.192 stETH per wstETH" under a wstETH amount.
  const stethSub = (tokenAmount: number, what: string) =>
    rate != null && tokenSym !== normalizedSymbol ? (
      <>
        ={" "}
        <Prov info={stethEquivalentProv(what, coords)} value={formatExact(tokenAmount * rate)}>
          {formatNumber(tokenAmount * rate)}
        </Prov>{" "}
        {normalizedSymbol} at{" "}
        <Prov info={wstethRateProv(coords)} value={formatExact(rate)}>
          {rate.toFixed(4)}
        </Prov>{" "}
        {normalizedSymbol} per {tokenSym}
      </>
    ) : undefined;

  // Ownership rows are zero-delta: the grid is the Transfer log's holders.
  if (ctx.eventType === "transfer") {
    const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
    const isMint = ctx.transferFrom === "0x0000000000000000000000000000000000000000";
    return (
      <ChainTruthDetail
        stats={[
          {
            label: isMint ? "From · mint" : "From",
            value: isMint ? "0x0" : short(ctx.transferFrom),
            symbol: "",
            prov: transferPartyProv("from", coords),
          },
          {
            label: "To · new holder",
            value: short(ctx.transferTo),
            symbol: "",
            prov: transferPartyProv("to", coords),
          },
        ]}
      />
    );
  }

  if (ctx.eventType === "tickRebalance") {
    const scope = ctx.poolWide ? "whole pool" : "whole tick";
    const tickStats: ChainTruthStat[] = [
      {
        label: ctx.poolWide ? "Pool-wide rebalance · moved this position's tick" : "Rebalanced tick",
        // `#`-prefixed so the grid's numeric compaction leaves the tick id alone.
        value: `#${ctx.rebalancedTick ?? "—"}`,
        symbol: "",
        prov: tickRebalanceHitProv(ctx.rebalancedTick, coords, ctx.poolWide),
      },
      {
        label: `Collateral to the keeper · ${scope}`,
        value: fmt(ctx.tickRebColls),
        symbol: tokenSym,
        prov: tickRebAmountProv("colls", tokenSym, coords, undefined, ctx.poolWide),
      },
      {
        label: `fxUSD repaid · ${scope}`,
        value: fmt(ctx.tickRebFxusdDebts),
        symbol: "fxUSD",
        prov: tickRebAmountProv("fxusd", "fxUSD", coords, undefined, ctx.poolWide),
      },
    ];
    if (ctx.tickRebStableDebts != null && Number(ctx.tickRebStableDebts) !== 0) {
      tickStats.push({
        label: `USDC repaid · ${scope}`,
        value: fmt(ctx.tickRebStableDebts),
        symbol: "USDC",
        prov: tickRebAmountProv("stable", "stable-side debt", coords, undefined, ctx.poolWide),
      });
    }
    const tag = blockPeers && blockPeers > 1 ? ` · this block (${blockPeers} rebalances)` : "";
    for (const s of [
      readStat(`This position · collateral${tag}`, "coll", normalizedSymbol, before, after, coords),
      readStat(`This position · debt${tag}`, "debt", "fxUSD", before, after, coords),
      readStat(`This position · debt ratio${tag}`, "ratio", normalizedSymbol, before, after, coords),
    ])
      if (s) tickStats.push(s);
    return <ChainTruthDetail stats={tickStats} />;
  }

  if (ctx.eventType === "liquidation") {
    const sent = Number(ctx.liqColls ?? "0") || 0;
    stats.push({
      label: "Collateral to the liquidator",
      value: fmt(ctx.liqColls),
      symbol: tokenSym,
      prov: liqCollsProv(tokenSym, coords),
      sub: stethSub(sent, "Collateral to the liquidator"),
    });
    const sentNorm = tokenSym === normalizedSymbol ? sent : rate != null ? sent * rate : null;
    if (before?.colls != null && after?.colls != null && sentNorm != null) {
      const kept = before.colls - after.colls - sentNorm;
      if (kept > DUST)
        stats.push({
          label: "Kept by the protocol",
          value: String(kept),
          display: formatTinyNonZero(kept),
          symbol: normalizedSymbol,
          prov: protocolShareProv(normalizedSymbol, coords),
          sub:
            state?.expenseRatio != null ? (
              <>{Math.round(state.expenseRatio * 100)}% of the liquidation bonus</>
            ) : undefined,
        });
    }
    stats.push({
      label: "fxUSD debt repaid",
      value: fmt(ctx.liqFxusdDebts),
      symbol: "fxUSD",
      prov: liqDebtRepaidProv("fxusd", coords),
    });
    const stable = Number(ctx.liqStableDebts ?? "0") || 0;
    if (stable !== 0) {
      stats.push({
        label: "Stable debt repaid",
        value: fmt(ctx.liqStableDebts),
        symbol: "USDC",
        prov: liqDebtRepaidProv("stable", coords),
      });
    }
    const debtBefore = before?.debts ?? (ctx.debtBefore != null ? Number(ctx.debtBefore) : null);
    const repaid = (Number(ctx.liqFxusdDebts ?? "0") || 0) + stable;
    if (ctx.emptiesPosition && debtBefore != null && debtBefore - repaid > 1e-9) {
      stats.push({
        label: "Debt left unpaid · spread over other positions",
        value: String(debtBefore - repaid),
        symbol: "fxUSD",
        prov: unpaidDebtProv(coords),
      });
    }
  } else {
    // Operate: the fee first — the event's field where the old manager emitted
    // one, else the caller's schedule at the block.
    if (ctx.protocolFees != null && Number(ctx.protocolFees) !== 0) {
      stats.push({
        label: "Protocol fee",
        value: fmt(ctx.protocolFees),
        symbol: tokenSym,
        prov: protocolFeesProv(tokenSym, coords),
      });
    } else if (state?.fees) {
      for (const f of fxRowFees(ctx, state.fees)) {
        if (f.amount <= 0) continue;
        stats.push({
          label: `Fee · ${fxFeePct(f.ratio)} ${f.leg}`,
          value: String(f.amount),
          symbol: f.symbol === "token" ? tokenSym : "fxUSD",
          prov: feeScheduleProv(state.fees.caller, coords),
          sub: state.fees.custom ? "schedule set for the caller" : "pool default schedule",
        });
      }
    }
  }

  // The position on chain after the event (getPosition at the block): the
  // collateral and the debt with their before → after. The row read gives the
  // before; until it lands an operate keeps the stored figures.
  const collAfter = after?.colls ?? (ctx.collAfter != null ? Number(ctx.collAfter) : null);
  const debtAfter = after?.debts ?? (ctx.debtAfter != null ? Number(ctx.debtAfter) : null);
  if (collAfter != null && debtAfter != null) {
    const collBefore = before?.colls ?? (ctx.collBefore != null ? Number(ctx.collBefore) : null);
    const coll = Number(ctx.collDelta ?? "0") || 0;
    stats.push({
      label: "Collateral",
      value: String(collAfter),
      symbol: normalizedSymbol,
      prov: after
        ? rowStateProv("coll", "after", normalizedSymbol, coords)
        : chainAfterProv("coll", normalizedSymbol, coords),
      transition:
        collBefore != null
          ? reconstructTransition({
              after: String(collAfter),
              change: String(collAfter - collBefore),
              changeProv: before
                ? rowChangeProv("coll", normalizedSymbol, coords)
                : chainChangeProv("coll", normalizedSymbol, coords),
              beforeProv: before
                ? rowStateProv("coll", "before", normalizedSymbol, coords)
                : chainBeforeProv("coll", normalizedSymbol, coords, true),
            })
          : undefined,
      sub: ctx.eventType === "operate" && coll !== 0 ? stethSub(Math.abs(coll), `The ${tokenSym} moved`) : undefined,
    });
    const debtBefore = before?.debts ?? (ctx.debtBefore != null ? Number(ctx.debtBefore) : null);
    stats.push({
      label: "Debt",
      value: String(debtAfter),
      symbol: "fxUSD",
      prov: after
        ? rowStateProv("debt", "after", normalizedSymbol, coords)
        : chainAfterProv("debt", normalizedSymbol, coords),
      transition:
        debtBefore != null
          ? reconstructTransition({
              after: String(debtAfter),
              change: String(debtAfter - debtBefore),
              changeProv: before
                ? rowChangeProv("debt", normalizedSymbol, coords)
                : ctx.eventType === "liquidation"
                  ? chainChangeProv("debt", normalizedSymbol, coords)
                  : debtDeltaProv(coords),
              beforeProv: before
                ? rowStateProv("debt", "before", normalizedSymbol, coords)
                : chainBeforeProv("debt", normalizedSymbol, coords, ctx.eventType === "liquidation"),
            })
          : undefined,
      ...(ctx.debtSincePrevious
        ? {
            interestSincePrevious: {
              value: ctx.debtSincePrevious,
              prov: debtSincePreviousProv(coords),
              label: "Moved since previous event (funding, rebalances)",
            },
          }
        : {}),
    });
    const ratio = readStat("Debt ratio", "ratio", normalizedSymbol, before, after, coords);
    if (ratio) stats.push(ratio);
    return <ChainTruthDetail stats={withPrice(stats)} />;
  }

  // The replay lane — labeled event-implied so it is never read as the
  // position's current debt.
  stats.push({
    label: "Debt after · event-implied",
    value: fmt(ctx.impliedDebtAfter),
    symbol: "fxUSD",
    prov: impliedDebtAfterProv(coords),
    transition: reconstructTransition({
      after: ctx.impliedDebtAfter,
      change: ctx.debtDelta,
      changeProv: ctx.eventType === "liquidation" ? liqDebtTotalProv(coords) : debtDeltaProv(coords),
      beforeProv: impliedDebtBeforeProv(coords),
    }),
  });

  return <ChainTruthDetail stats={withPrice(stats)} />;

  // The same-tx PositionSnapshot's oracle price — USD per NORMALIZED unit at
  // this event's block.
  function withPrice(list: ChainTruthStat[]): ChainTruthStat[] {
    if (ctx.oraclePrice == null) return list;
    return [
      ...list,
      {
        label: `Oracle price · USD per ${normalizedSymbol}`,
        value: fmt(ctx.oraclePrice),
        display: `$${fmt(ctx.oraclePrice)}`,
        symbol: "",
        prov: snapOraclePriceProv(normalizedSymbol, coords),
      },
    ];
  }
}
