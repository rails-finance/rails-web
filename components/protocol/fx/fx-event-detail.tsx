"use client";

// f(x) event detail — adapter onto the shared ChainTruthDetail grid.
//
// The one lane every event touches is the EVENT-IMPLIED debt: the running Σ of
// the events' own signed fxUSD deltas after this event. It is deliberately
// labeled as event-implied — f(x)'s funding charges, socialized rebalances and
// bad-debt write-offs mutate real debt with NO per-position event, so this
// figure is the replay lane, never the position's current state (the settled
// getPosition read on the position card carries that, and the gap between the
// two is the socialized reconciliation line).
//
//   operate      — the implied-debt lane with its before→after transition
//                  (change = the event's own deltaDebts) + the protocol fee
//                  when one was charged (NORMALIZED collateral units).
//   liquidation  — the seizure (NORMALIZED units) and the two debt lanes the
//                  event itself splits (fxUSD-side / stable-side), plus the
//                  implied-debt lane moved by the combined clear.

import type { FxContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  debtDeltaProv,
  protocolFeesProv,
  liqCollsProv,
  liqDebtRepaidProv,
  liqDebtTotalProv,
  impliedDebtAfterProv,
  snapOraclePriceProv,
  transferPartyProv,
  tickRebalanceHitProv,
  tickRebAmountProv,
  driftSliceProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import type { FxDriftSlice } from "@/lib/sources/api/fx-drift";
import { formatNumber } from "@/lib/utils/format";

export interface FxEventDetailProps {
  ctx: FxContext;
  txHash?: string;
  blockNumber?: number;
  /** The pool's rate-normalized unit symbol (stETH / WBTC). */
  normalizedSymbol: string;
  /** tickRebalance rows — this position's own drift over the stretch holding
   *  the rebalance (see FxEventCardProps.driftSlice). */
  driftSlice?: FxDriftSlice;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** The reconstructed implied-debt BEFORE this event (after − change) — the
 *  same indexed lane as the after-figure, re-summarized for the inversion. */
const impliedDebtBeforeProv = (coords: FxCoords): Provenance => ({
  ...impliedDebtAfterProv(coords),
  summary:
    "Event-implied fxUSD debt before this event — reconstructed as the implied debt after minus this event's own debt delta (after − change). The same indexed replay lane: DELIBERATELY NOT the position's true debt at that moment, since funding and socialized rebalances move real debt between events with no per-position log.",
  formula: "implied debt after − debt change",
});

export function FxEventDetail({ ctx, txHash, blockNumber, normalizedSymbol, driftSlice }: FxEventDetailProps) {
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const stats: ChainTruthStat[] = [];

  // Ownership rows are zero-delta: the grid is just the Transfer log's own
  // holders — no implied-debt lane (a 0→0 transition would be noise).
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

  // Socialized rows: the attribution + the WHOLE tick's amounts, labeled
  // tick-level so they are never read as this position's slice. No implied
  // lane — the event moved no per-position figure.
  if (ctx.eventType === "tickRebalance") {
    const tickStats: ChainTruthStat[] = [
      {
        label: "Rebalanced tick · position inside",
        // `#`-prefixed so the grid's numeric compaction leaves the tick id
        // alone (it is an identifier, not an amount).
        value: `#${ctx.rebalancedTick ?? "—"}`,
        symbol: "",
        prov: tickRebalanceHitProv(ctx.rebalancedTick, coords),
      },
      {
        label: "Collateral cleared · whole tick",
        value: fmt(ctx.tickRebColls),
        symbol: normalizedSymbol,
        prov: tickRebAmountProv("colls", normalizedSymbol, coords),
      },
      {
        label: "fxUSD cleared · whole tick",
        value: fmt(ctx.tickRebFxusdDebts),
        symbol: "fxUSD",
        prov: tickRebAmountProv("fxusd", "fxUSD", coords),
      },
    ];
    if (ctx.tickRebStableDebts != null && Number(ctx.tickRebStableDebts) !== 0) {
      tickStats.push({
        label: "Stable debt cleared · whole tick",
        value: fmt(ctx.tickRebStableDebts),
        symbol: "USDC",
        prov: tickRebAmountProv("stable", "stable-side debt", coords),
      });
    }
    // THIS position's own figure, where the page has read it: its drift over
    // the quiet stretch holding this rebalance (getPosition at the stretch's
    // two boundary blocks, subtracted). With one rebalance in the stretch the
    // fxUSD leg is the exact per-position slice of the clear above; the
    // collateral leg also carries the stretch's funding. Signed: negative is
    // what left the position.
    if (driftSlice) {
      const { interval: iv, rebalances } = driftSlice;
      const tag = rebalances === 1 ? "over the stretch" : `over the stretch (${rebalances} rebalances)`;
      tickStats.push({
        label: `This position · collateral drift ${tag}`,
        value: formatNumber(iv.collsDrift),
        symbol: normalizedSymbol,
        prov: driftSliceProv("colls", normalizedSymbol, iv.fromBlock, iv.toBlock, iv.toHead, rebalances),
      });
      tickStats.push({
        label: `This position · fxUSD drift ${tag}`,
        value: formatNumber(iv.debtsDrift),
        symbol: "fxUSD",
        prov: driftSliceProv("debts", "fxUSD", iv.fromBlock, iv.toBlock, iv.toHead, rebalances),
      });
    }
    return <ChainTruthDetail stats={tickStats} />;
  }

  if (ctx.eventType === "liquidation") {
    stats.push({
      label: "Collateral seized",
      value: fmt(ctx.liqColls),
      symbol: normalizedSymbol,
      prov: liqCollsProv(normalizedSymbol, coords),
    });
    stats.push({
      label: "fxUSD debt repaid",
      value: fmt(ctx.liqFxusdDebts),
      symbol: "fxUSD",
      prov: liqDebtRepaidProv("fxusd", coords),
    });
    if (ctx.liqStableDebts != null && Number(ctx.liqStableDebts) !== 0) {
      stats.push({
        label: "Stable debt repaid",
        value: fmt(ctx.liqStableDebts),
        symbol: "USDC",
        prov: liqDebtRepaidProv("stable", coords),
      });
    }
  } else if (ctx.protocolFees != null && Number(ctx.protocolFees) !== 0) {
    stats.push({
      label: "Protocol fee",
      value: fmt(ctx.protocolFees),
      symbol: normalizedSymbol,
      prov: protocolFeesProv(normalizedSymbol, coords),
    });
  }

  // The replay lane, on every event — labeled event-implied so it is never
  // read as the position's current debt.
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

  // The same-tx PositionSnapshot's oracle price — USD per NORMALIZED unit at
  // this event's block; a real chain read at a named block.
  if (ctx.oraclePrice != null) {
    stats.push({
      label: `Oracle price · USD per ${normalizedSymbol}`,
      value: fmt(ctx.oraclePrice),
      symbol: "USD",
      prov: snapOraclePriceProv(normalizedSymbol, coords),
    });
  }

  return <ChainTruthDetail stats={stats} />;
}
