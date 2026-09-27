"use client";

// Alchemist transaction detail: the figures the logs carry, the ones they do
// not, and where the position stood once they had all landed.
//
// TWO GRIDS, AND THE SEAM BETWEEN THEM IS THE POINT. The first is what the logs
// state: amounts the transaction's legs emitted, plus the two a `Repay` does
// not emit and the index resolved when it captured the log. The second is a
// `getCDP` READING at the block, served on the wire, with the reading at the
// previous reading block beside it as the "before" (lib/alchemix/readings-before).
// Both are readings; neither is a balance replayed from the rows above it
// (rails-ops decisions/0032).
//
// ONE READING PER CARD, AND IT COMES FROM WHICHEVER LEG HAS ONE. Every leg of a
// transaction carries the same reading of the same block, so drawing it per leg
// drew the same three figures two and three times over. A custody `transfer`
// carries no reading at all, which is why the leg it is taken from is the first
// STATED one rather than the first leg: a transaction that deposited and handed
// the position on has a reading, and the transfer's absence is not the answer.
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
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { AlchemixStateAtBlock } from "./alchemix-state-at-block";
import {
  collateralTakenRaw,
  useAlchemixUnderlying,
  useReadingBefore,
  type AlchemixReading,
  type AlchemixUnderlyingUnit,
} from "@/lib/alchemix/readings-before";
import { redemptionNet } from "@/lib/alchemix/redemption-net";
import {
  collateralTakenFromReadingsProv,
  debtClearedFromReadingsProv,
  emittedAmountProv,
  redemptionNetProv,
  redemptionNetUnavailableProv,
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
  /** The legs of one transaction this card draws, in log order. */
  legs: AlchemistEvent[];
  mytSymbol: string;
  coordsFor: (leg: AlchemistEvent) => AlchemixCoords;
}

/** What one leg's log states. `before` is the reading before this block, which
 *  a redemption's collateral figure is measured from. */
function legStats(
  leg: AlchemistEvent,
  mytSymbol: string,
  coords: AlchemixCoords,
  before: AlchemixReading | null,
  unit: AlchemixUnderlyingUnit | null,
): ChainTruthStat[] {
  const ctx: AlchemixV3Context = leg.context.data;
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
      stat("Vault shares used to repay the debt", "amount_liquidated", mytSymbol);
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
      // The per-position figures are not in the log: each is this position's
      // reading either side of the redemption, subtracted. A zero stands as an
      // answer; the unavailable case drops the row, which is the only way the
      // two can be told apart.
      const cleared = ctx.debtClearedFromReadings;
      if (cleared?.status === "stated" && cleared.amountRaw != null) {
        stats.push({
          label: "Debt cleared from this position",
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
        const taken = collateralTakenRaw(leg, before);
        if (taken != null) {
          stats.push({
            label: "Collateral taken from this position",
            value: formatExact(scaled(taken) ?? 0),
            symbol: mytSymbol,
            prov: collateralTakenFromReadingsProv(
              mytSymbol,
              taken,
              cleared.fromBlock ?? 0,
              cleared.atBlock ?? 0,
              coords,
            ),
          });
        }
        // The net for the holder, in the underlying: Liquity's redemption
        // P/L, over the same two readings (lib/alchemix/redemption-net).
        const net = redemptionNet(leg, before, unit?.decimals ?? null);
        if (net?.status === "stated" && unit) {
          const n = Number(net.netRaw) / WAD;
          stats.push({
            label: "Net for this position",
            value: formatExact(n),
            display: `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
            symbol: unit.symbol,
            prov: redemptionNetProv(net, sym, mytSymbol, unit.symbol, coords),
          });
        } else if (net?.status === "no-share-price") {
          stats.push({
            label: "Net for this position",
            value: "Not stated",
            display: "No share price read at this block",
            dimmed: true,
            symbol: "",
            prov: redemptionNetUnavailableProv(net.atBlock, coords),
          });
        }
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

  return stats;
}

export function AlchemixEventDetail({ legs, mytSymbol, coordsFor }: AlchemixEventDetailProps) {
  // The reading, taken once from whichever leg states one; with none stated,
  // the first leg's, whose own reason is what the sentence reports.
  const readingLeg = legs.find((l) => l.context.data.stateAtBlockFromReading?.status === "stated") ?? legs[0];
  const readingCtx = readingLeg.context.data;
  const before = useReadingBefore(readingCtx.stateAtBlockFromReading?.blockNumber);
  const unit = useAlchemixUnderlying();
  const stats = legs.flatMap((leg) => legStats(leg, mytSymbol, coordsFor(leg), before, unit));

  // A line-scope row is never a leg of anybody's transaction, so a card that
  // carries one carries it alone and this narrows to that row.
  const lineLeg = legs.find((l) => l.context.data.scope === "line");
  const lineCtx = lineLeg?.context.data;
  const span = lineCtx?.debtClearedFromReadings;
  const clearedSpan =
    span?.status === "stated" && span.fromBlock != null && span.atBlock != null
      ? { fromBlock: span.fromBlock, atBlock: span.atBlock }
      : null;

  return (
    <>
      {/* Both grids are headed, and the first one is why. The shell declares a
          `detailLabel` and renders it nowhere, so a lone heading over the
          second grid would read as covering the pane. Naming this one says
          which figures the transaction emitted and which were read. */}
      {stats.length > 0 ? (
        <h4 className={`${OVERLAY_HEADING} px-5 pt-2 text-rb-500`}>
          {legs.length > 1 ? "What the logs state" : "What the log states"}
        </h4>
      ) : null}
      <ChainTruthDetail stats={stats} symbolText />
      {lineCtx ? (
        <p className="px-5 pb-3 text-[11px] leading-relaxed text-rb-500">
          This event belongs to the whole line. It is on this timeline because it fell inside this position&rsquo;s
          life.
          {clearedSpan ? (
            <>
              {" "}
              The figures for this position are its readings at blocks {block(clearedSpan.fromBlock)} and{" "}
              {block(clearedSpan.atBlock)}, the two this redemption sits between, subtracted.
            </>
          ) : null}
          {lineCtx.eventType === "batch_liquidated" && lineCtx.accountsTopic ? (
            <>
              {" "}
              The positions it covered arrive as one hash ({lineCtx.accountsTopic.slice(0, 10)}&hellip;), so the list
              cannot be recovered from the event.
            </>
          ) : null}
        </p>
      ) : null}
      <AlchemixStateAtBlock
        state={readingCtx.stateAtBlockFromReading}
        syntheticSymbol={readingCtx.syntheticSymbol}
        mytSymbol={mytSymbol}
        eventBlock={readingLeg.blockNumber}
        legCount={legs.length}
        coords={coordsFor(readingLeg)}
        before={before}
      />
    </>
  );
}
