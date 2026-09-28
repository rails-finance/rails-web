"use client";

// Maple event detail — adapter onto the shared ChainTruthDetail grid. Every
// row leads with the position's claim in the pool's asset, before → after
// ((shares + escrowed) × the pool's rate in the row's block, the chain's
// convertToAssets there; decision 0033) and the interest it earned since the
// previous row in the pool. Then the lanes an event touches:
//   deposit / withdraw / fill — the net-deposited lane (a running sum of the
//     flows) AND the share lane (slot-exact transfer replay) side by side.
//   queue events — the escrow lane (shares waiting in the queue) beside the
//     share lane (escrowing moves shares out of the wallet's balance).
//   transfers — the share lane (a position can arrive or leave by transfer).

import type { MapleContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  assetsDeltaProv,
  sharesDeltaProv,
  requestSharesProv,
  requestCancelSharesProv,
  transferAmountProv,
  sharesAfterProv,
  sharesBeforeProv,
  escrowAfterProv,
  escrowBeforeProv,
  principalAfterProv,
  principalBeforeProv,
  eventRateProv,
  claimAfterProv,
  claimBeforeProv,
  interestSincePrevProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";
import { formatNumber } from "@/lib/utils/format";

export interface MapleEventDetailProps {
  ctx: MapleContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

export function MapleEventDetail({ ctx, txHash, blockNumber, wallet }: MapleEventDetailProps) {
  const coords: MapleCoords = { txHash, blockNumber, pool: ctx.pool, account: wallet };
  const stats: ChainTruthStat[] = [];

  // The claim at the block rate, where the index holds one for this block.
  if (ctx.valueAfter != null && ctx.valueBefore != null) {
    const change = String(Number(ctx.valueAfter) - Number(ctx.valueBefore));
    const transition = reconstructTransition({
      after: ctx.valueAfter,
      change,
      changeProv: claimAfterProv(ctx.assetSymbol, ctx.poolSymbol, ctx.rateSource, coords, ctx.raw?.valueAfter),
      beforeProv: claimBeforeProv(ctx.assetSymbol, ctx.poolSymbol, ctx.rateSource, coords),
    });
    stats.push({
      label: "Pool claim",
      value: fmt(ctx.valueAfter),
      symbol: ctx.assetSymbol,
      prov: claimAfterProv(ctx.assetSymbol, ctx.poolSymbol, ctx.rateSource, coords, ctx.raw?.valueAfter),
      transition,
      changed: transition != null,
    });
    const interest = Number(ctx.interestSincePrev ?? "0");
    if (ctx.interestSincePrev != null && interest !== 0) {
      stats.push({
        label: "Interest since previous event",
        value: interest < 0 ? `−${fmt(String(-interest))}` : fmt(ctx.interestSincePrev),
        symbol: ctx.assetSymbol,
        prov: interestSincePrevProv(ctx.assetSymbol, ctx.poolSymbol, coords, ctx.raw?.interestSincePrev),
        changed: false,
      });
    }
  }

  if (ctx.eventType === "deposit" || ctx.eventType === "withdraw" || ctx.eventType === "request_fill") {
    stats.push({
      label: "Net deposited",
      value: fmt(ctx.principalAfter),
      symbol: ctx.assetSymbol,
      prov: principalAfterProv(ctx.assetSymbol, coords, ctx.raw?.principalAfter),
      transition: reconstructTransition({
        after: ctx.principalAfter,
        change: ctx.assetsDelta,
        changeProv: assetsDeltaProv(ctx.assetSymbol, ctx.eventType, coords, ctx.raw?.assets),
        beforeProv: principalBeforeProv(ctx.assetSymbol, coords),
      }),
    });
    stats.push({
      label: "Share balance",
      value: fmt(ctx.sharesAfter),
      symbol: ctx.poolSymbol,
      prov: sharesAfterProv(ctx.poolSymbol, coords, ctx.raw?.sharesAfter),
      transition: reconstructTransition({
        after: ctx.sharesAfter,
        change: ctx.sharesDelta,
        changeProv:
          ctx.eventType === "request_fill"
            ? requestSharesProv(ctx.poolSymbol, "request_fill", coords, ctx.raw?.shares)
            : sharesDeltaProv(
                ctx.poolSymbol,
                ctx.eventType === "deposit" ? "deposit" : "withdraw",
                coords,
                ctx.raw?.shares,
              ),
        beforeProv: sharesBeforeProv(ctx.poolSymbol, coords),
      }),
    });
    // The rate this operation settled at — two emitted fields of its own log.
    const assets = Math.abs(Number(ctx.assetsDelta ?? "0"));
    const shares = Math.abs(Number((ctx.eventType === "request_fill" ? ctx.requestShares : ctx.sharesDelta) ?? "0"));
    if (assets > 0 && shares > 0) {
      stats.push({
        label: "Rate at this event",
        value: (assets / shares).toFixed(6),
        symbol: `${ctx.assetSymbol}/${ctx.poolSymbol}`,
        prov: eventRateProv(ctx.assetSymbol, ctx.poolSymbol, ctx.eventType, coords),
      });
    }
    if (ctx.eventType === "request_fill") {
      stats.push({
        label: "In withdrawal queue",
        value: fmt(ctx.escrowAfter),
        symbol: ctx.poolSymbol,
        prov: escrowAfterProv(ctx.poolSymbol, coords, ctx.raw?.escrowAfter),
        transition: reconstructTransition({
          after: ctx.escrowAfter,
          change: ctx.requestShares != null ? String(-Number(ctx.requestShares)) : undefined,
          changeProv: requestSharesProv(ctx.poolSymbol, "request_fill", coords, ctx.raw?.shares),
          beforeProv: escrowBeforeProv(ctx.poolSymbol, coords),
        }),
      });
    }
  } else if (
    ctx.eventType === "request" ||
    ctx.eventType === "request_decrease" ||
    ctx.eventType === "request_cancel"
  ) {
    const signedChange =
      ctx.requestShares != null
        ? ctx.eventType === "request"
          ? ctx.requestShares
          : String(-Number(ctx.requestShares))
        : undefined;
    stats.push({
      label: "In withdrawal queue",
      value: fmt(ctx.escrowAfter),
      symbol: ctx.poolSymbol,
      prov: escrowAfterProv(ctx.poolSymbol, coords, ctx.raw?.escrowAfter),
      transition: reconstructTransition({
        after: ctx.escrowAfter,
        change: signedChange,
        changeProv:
          ctx.eventType === "request_cancel"
            ? requestCancelSharesProv(ctx.poolSymbol, coords, ctx.raw?.shares)
            : requestSharesProv(ctx.poolSymbol, ctx.eventType, coords, ctx.raw?.shares),
        beforeProv: escrowBeforeProv(ctx.poolSymbol, coords),
      }),
    });
    stats.push({
      label: "Share balance",
      value: fmt(ctx.sharesAfter),
      symbol: ctx.poolSymbol,
      prov: sharesAfterProv(ctx.poolSymbol, coords, ctx.raw?.sharesAfter),
      transition: reconstructTransition({
        after: ctx.sharesAfter,
        change: ctx.sharesDelta,
        changeProv:
          ctx.eventType === "request_cancel"
            ? requestCancelSharesProv(ctx.poolSymbol, coords, ctx.raw?.shares)
            : requestSharesProv(
                ctx.poolSymbol,
                ctx.eventType === "request" ? "request" : "request_decrease",
                coords,
                ctx.raw?.shares,
              ),
        beforeProv: sharesBeforeProv(ctx.poolSymbol, coords),
      }),
    });
  } else if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") {
    stats.push({
      label: "Share balance",
      value: fmt(ctx.sharesAfter),
      symbol: ctx.poolSymbol,
      prov: sharesAfterProv(ctx.poolSymbol, coords, ctx.raw?.sharesAfter),
      transition: reconstructTransition({
        after: ctx.sharesAfter,
        change: ctx.sharesDelta,
        changeProv: transferAmountProv(
          ctx.poolSymbol,
          ctx.eventType === "transfer_in" ? "in" : "out",
          coords,
          ctx.raw?.shares,
        ),
        beforeProv: sharesBeforeProv(ctx.poolSymbol, coords),
      }),
    });
  }

  return <ChainTruthDetail stats={stats} />;
}
