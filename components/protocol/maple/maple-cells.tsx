"use client";

// Maple's T2 (ui-jobs 309 step 8): the card's `cells` and `notes` slots. One
// ledger cell, the wallet's pool claim, and the rate at this event. There is
// no Debt cell: a Maple position lends to the pool and owes nothing. The
// claim's ledger carries Held and "Interest since {date}" rows as the
// day-close card does, and the closed cell "incl. X interest"; the share and
// queue lanes and what was paid to the wallet stand as notes. Every row leads
// with the position's claim in the pool's asset, before → after
// ((shares + escrowed) × the pool's rate in the row's block, the chain's
// convertToAssets there; decision 0033) and the interest it earned since the
// previous row in the pool. Then the lanes an event touches:
//   deposit / withdraw / fill — the share lane (slot-exact transfer replay)
//     and the rate the operation settled at. The net-deposited lane is not
//     shown: it counts no transfers and is clamped at zero, so its
//     before→after did not chain from row to row (Maple newcomer round 1).
//   queue events — the escrow lane (shares waiting in the queue) beside the
//     share lane (escrowing moves shares out of the wallet's balance).
//   transfers — the share lane (a position can arrive or leave by transfer).

import type { MapleContext } from "@/lib/shared/types/event-shape";
import type { ReactNode } from "react";
import {
  reconstructTransition,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { StatNotes, useChainTruthCells, type ChainTruthCellStat } from "@/components/shared/chain-truth-cells";
import type { EventCellSpec } from "@/components/shared/event-cells";
import { Prov } from "@/components/shared/provenance";
import {
  sharesDeltaProv,
  requestSharesProv,
  requestCancelSharesProv,
  transferAmountProv,
  sharesAfterProv,
  sharesBeforeProv,
  escrowAfterProv,
  escrowBeforeProv,
  eventRateProv,
  claimAfterProv,
  claimBeforeProv,
  interestSincePrevProv,
  flankedLegProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { dayStamp } from "@/components/shared/event-ledger";
import type { MapleHeld } from "./maple-ledger";

export interface MapleCellsProps {
  ctx: MapleContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** Unix seconds of this row and of the previous row in its pool. */
  timestamp?: number;
  prevAt?: number;
  /** The row's id, for its Lifetime flows ledger. */
  eventId?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/** One rounding rule, Polaris's: the opened grid states the before and the
 *  change in full to three decimals, as the row and the card do. */
const num = (s: string): number => Number(s.replace(/,/g, ""));
const full = (t: ChainTruthTransition | undefined): ChainTruthTransition | undefined =>
  t && {
    ...t,
    before: formatNumber(num(t.beforeExact)),
    change: `${t.change.charAt(0)}${formatNumber(Math.abs(num(t.changeExact.slice(1))))}`,
  };

/** What the row did, for the claim's "before → after this …" label. */
const ACT: Partial<Record<MapleContext["eventType"], string>> = {
  deposit: "deposit",
  withdraw: "withdrawal",
  request: "request",
  request_decrease: "request change",
  request_cancel: "cancellation",
  request_fill: "fill",
};

export function useMapleCells({ ctx, txHash, blockNumber, wallet, timestamp, prevAt }: MapleCellsProps): {
  cells: EventCellSpec[];
  notes: ReactNode;
  held: MapleHeld | null;
} {
  const coords: MapleCoords = { txHash, blockNumber, pool: ctx.pool, account: wallet };
  const stats: ChainTruthStat[] = [];
  let held: MapleHeld | null = null;

  // The claim at the block rate, where the index holds one for this block.
  if (ctx.valueAfter != null && ctx.valueBefore != null) {
    const change = String(Number(ctx.valueAfter) - Number(ctx.valueBefore));
    const transition = reconstructTransition({
      after: ctx.valueAfter,
      change,
      changeProv: claimAfterProv(ctx.assetSymbol, ctx.poolSymbol, ctx.rateSource, coords, ctx.raw?.valueAfter),
      beforeProv: claimBeforeProv(ctx.assetSymbol, ctx.poolSymbol, ctx.rateSource, coords),
    });
    const interest = Number(ctx.interestSincePrev ?? "0");
    const act = ACT[ctx.eventType];
    const interestProv = interestSincePrevProv(ctx.assetSymbol, ctx.poolSymbol, coords, ctx.raw?.interestSincePrev);
    const interestText = interest < 0 ? `−${fmt(String(-interest))}` : fmt(ctx.interestSincePrev);
    const claimProv = claimAfterProv(ctx.assetSymbol, ctx.poolSymbol, ctx.rateSource, coords, ctx.raw?.valueAfter);
    if (ctx.valueAfter != null)
      held = {
        symbol: ctx.assetSymbol,
        claim: Number(ctx.valueAfter),
        interest: ctx.interestSincePrev != null ? interest : 0,
        since: prevAt != null ? dayStamp(prevAt) : "the pool's previous row",
        claimProv,
        interestProv,
        heldProv: {
          kind: "derived",
          summary:
            "The claim before the interest since the pool's previous row: the claim after this event less that interest.",
          via: "claim after − interest since the previous row",
          formula: "claim after − interest since previous row",
        },
      };
    stats.push({
      // The wallet's own claim: a − on a fill is the claim shrinking as the
      // assets leave for the wallet.
      // On a transfer the before is the claim just before the shares arrived
      // or left — a figure that can round to the flows' "received" total
      // without being it (Maple newcomer round 2, M5).
      label:
        ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out"
          ? "Wallet's pool claim, just before and after this transfer"
          : transition != null && act
            ? `Wallet's pool claim, before → after this ${act}`
            : "Wallet's pool claim",
      value: fmt(ctx.valueAfter),
      symbol: ctx.assetSymbol,
      prov: claimProv,
      transition,
      changed: transition != null || (ctx.interestSincePrev != null && interest !== 0),
      // The claim opens into its ledger on every card: the pool's flows where
      // the page's panel shows this pool, else its Held and Interest rows.
      ledger: "collateral" as const,
      // The interest since the pool's previous row is inside the claim, as
      // Liquity's Debt cell states its accrual.
      sub:
        ctx.interestSincePrev != null && interest !== 0 ? (
          <>
            incl.{" "}
            <Prov info={interestProv} value={ctx.interestSincePrev}>
              {interest > 0 ? "+" : ""}
              {interestText}
            </Prov>{" "}
            interest
          </>
        ) : undefined,
    });
  }

  // What left for the wallet, on the card that shows the claim fall by it.
  if (ctx.eventType === "withdraw" || ctx.eventType === "request_fill") {
    const paid = flankedLegProv(ctx, coords);
    if (paid)
      stats.push({
        label: "Paid to the wallet",
        value: formatNumber(Math.abs(paid.value)),
        symbol: ctx.assetSymbol,
        prov: paid.prov,
      });
  }

  if (ctx.eventType === "deposit" || ctx.eventType === "withdraw" || ctx.eventType === "request_fill") {
    stats.push({
      label: "Wallet's shares",
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
        // The asset's own icon beside the figure, the unit spelled out under
        // it: a compound "USDC/syrupUSDC" has no icon and drew a bare letter.
        symbol: ctx.assetSymbol,
        sub: `${ctx.assetSymbol} per ${ctx.poolSymbol}`,
        prov: eventRateProv(ctx.assetSymbol, ctx.poolSymbol, ctx.eventType, coords),
      });
    }
    if (ctx.eventType === "request_fill") {
      stats.push({
        label: "Wallet's shares in the queue",
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
      label: "Wallet's shares in the queue",
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
      label: "Wallet's shares",
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
      label: "Wallet's shares",
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

  // One ledger cell and the rate; no Debt cell, since a lender owes nothing.
  const shown = stats.map((st) => ({ ...st, display: st.display ?? st.value, transition: full(st.transition) }));
  const cellStats: ChainTruthCellStat[] = [];
  const notes: ChainTruthStat[] = [];
  for (const st of shown) {
    if (st.ledger) cellStats.push({ ...st, key: "claim" });
    else if (st.label === "Rate at this event") cellStats.push({ ...st, key: "rate" });
    else notes.push(st);
  }
  const cells = useChainTruthCells(cellStats);
  return { cells, notes: notes.length > 0 ? <StatNotes stats={notes} /> : undefined, held };
}
