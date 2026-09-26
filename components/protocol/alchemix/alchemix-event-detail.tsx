"use client";

// Alchemist event detail — the figures the log carries, the ones it does not,
// and where the position stood once it had landed.
//
// TWO GRIDS, AND THE SEAM BETWEEN THEM IS THE POINT. The first is what the log
// states: amounts the event emitted, plus the two a `Repay` does not emit and
// the index resolved when it captured the log. The second is a `getCDP`
// READING at the event's block, served on the wire — not a balance replayed
// from the rows above it. A replayed one would be wrong on the lines a reader
// most wants it on: a redemption moves debt across the whole line and names no
// position, so the position's own events cannot account for every step
// (rails-ops decisions/0032). NO BEFORE→AFTER TRANSITION joins the two, for the
// same reason: with no trustworthy before there is nothing to subtract.
//
// The reading's own rules — that it belongs to the block rather than the event,
// and that an absent one is not a zero — live with the component that draws it,
// `alchemix-state-at-block.tsx`.
//
// A row that names no position states the line's figure and says so.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { formatExact } from "@/lib/utils/format";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { AlchemixStateAtBlock } from "./alchemix-state-at-block";
import {
  debtClearedFromReadingsProv,
  emittedAmountProv,
  resolvedAtCaptureProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";

const WAD = 1e18;

const block = (n: number) => n.toLocaleString("en-US");

const scaled = (raw: string | null | undefined): number | null => {
  if (raw == null) return null;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / WAD : null;
};

export interface AlchemixEventDetailProps {
  ctx: AlchemixV3Context;
  mytSymbol: string;
  coords: AlchemixCoords;
}

export function AlchemixEventDetail({ ctx, mytSymbol, coords }: AlchemixEventDetailProps) {
  const raw = ctx.raw;
  const sym = ctx.syntheticSymbol;
  const stats: ChainTruthStat[] = [];

  const stat = (label: string, field: string, symbol: string) => {
    const value = scaled(raw[field]);
    if (value == null) return;
    stats.push({
      label,
      value: formatExact(value),
      symbol,
      prov: emittedAmountProv(field, symbol, raw[field], coords),
    });
  };

  switch (ctx.eventType) {
    case "deposit":
    case "withdraw":
      stat("Vault shares moved", "amount", mytSymbol);
      break;
    case "mint":
    case "burn":
      stat(ctx.eventType === "mint" ? "Minted" : "Burned", "amount", sym);
      break;
    case "repay": {
      stat("Vault shares offered", "amount", mytSymbol);
      const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
      stats.push({
        label: "Debt cleared",
        value: credit != null ? formatExact(scaled(credit) ?? 0) : "Not stated",
        symbol: sym,
        display: credit != null ? undefined : "Not stated",
        dimmed: credit == null,
        prov: resolvedAtCaptureProv("debt credit", sym, credit, coords),
      });
      const fee = ctx.resolvedAtCapture?.collateralFee ?? null;
      if (fee != null) {
        stats.push({
          label: "Fee taken in shares",
          value: formatExact(scaled(fee) ?? 0),
          symbol: mytSymbol,
          prov: resolvedAtCaptureProv("collateral fee", mytSymbol, fee, coords),
        });
      }
      break;
    }
    case "force_repay":
      stat("Put against the debt", "credit_to_yield", mytSymbol);
      stat("Protocol fee", "protocol_fee_total", mytSymbol);
      stat("Requested", "amount", sym);
      break;
    case "self_liquidated":
      stat("Vault shares liquidated", "amount_liquidated", mytSymbol);
      break;
    case "liquidated":
      stat("Vault shares taken", "amount", mytSymbol);
      stat("Liquidator fee, in shares", "fee_in_yield", mytSymbol);
      stat("Liquidator fee, in the asset underneath", "fee_in_underlying", mytSymbol);
      break;
    case "repayment_fee":
      stat("Fee in shares", "fee_in_yield", mytSymbol);
      stat("Fee in the asset underneath", "fee_in_underlying", mytSymbol);
      break;
    case "redemption": {
      stat("Redeemed across the line", "amount", sym);
      // The per-position figure is not in the log and is not worked out from
      // it: it is this position's debt read either side of the redemption,
      // subtracted. The label says so, and a zero stands as an answer — the
      // unavailable case drops the row instead, which is the only way the two
      // can be told apart.
      const cleared = ctx.debtClearedFromReadings;
      if (cleared?.status === "stated" && cleared.amountRaw != null) {
        stats.push({
          label: "Cleared for this position, from two readings",
          value: formatExact(scaled(cleared.amountRaw) ?? 0),
          symbol: sym,
          prov: debtClearedFromReadingsProv(
            sym,
            cleared.amountRaw,
            cleared.fromBlock ?? 0,
            cleared.atBlock ?? 0,
            coords,
          ),
        });
      }
      break;
    }
    case "batch_liquidated":
      stat("Taken across the batch", "amount", mytSymbol);
      stat("Liquidator fee, in shares", "fee_in_yield", mytSymbol);
      break;
    case "fee_shortfall":
      stat("Owed", "requested", mytSymbol);
      stat("Paid", "paid", mytSymbol);
      break;
    default:
      break;
  }

  const span = ctx.debtClearedFromReadings;
  const clearedSpan =
    span?.status === "stated" && span.fromBlock != null && span.atBlock != null
      ? { fromBlock: span.fromBlock, atBlock: span.atBlock }
      : null;

  return (
    <>
      {/* Both grids are headed, and the first one is why. The shell declares a
          `detailLabel` and renders it nowhere, so a lone heading over the
          second grid would read as covering the pane. Naming this one says
          which figures the event emitted and which were read. */}
      {stats.length > 0 ? <h4 className={`${OVERLAY_HEADING} px-5 pt-2 text-rb-500`}>What the log states</h4> : null}
      <ChainTruthDetail stats={stats} />
      {ctx.scope === "line" ? (
        <p className="px-5 pb-3 text-[11px] leading-relaxed text-rb-500">
          This event names no position. It is on this timeline because it fell inside this position&rsquo;s life and
          moved its figures, not because the holder did anything.
          {clearedSpan ? (
            <>
              {" "}
              The second figure is this position&rsquo;s debt read at block {block(clearedSpan.fromBlock)} less its debt
              read at block {block(clearedSpan.atBlock)} &mdash; the two blocks this redemption sits between.
            </>
          ) : null}
          {ctx.eventType === "batch_liquidated" && ctx.accountsTopic ? (
            <>
              {" "}
              The positions it covered arrive as one hash ({ctx.accountsTopic.slice(0, 10)}&hellip;), so the list cannot
              be recovered from the event.
            </>
          ) : null}
        </p>
      ) : null}
      <AlchemixStateAtBlock
        state={ctx.stateAtBlockFromReading}
        syntheticSymbol={sym}
        mytSymbol={mytSymbol}
        eventBlock={coords.blockNumber}
        coords={coords}
      />
    </>
  );
}
