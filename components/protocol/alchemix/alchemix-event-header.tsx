"use client";

// Alchemist event header — adapter onto the shared ChainTruthRow grammar.
//
// THREE THINGS THIS HEADER GETS RIGHT THAT A GENERIC ONE WOULD NOT.
//
// 1. A REPAY SHOWS TWO DIFFERENT QUANTITIES. The log's `amount` is the vault
//    shares the caller offered; the debt it cleared is a separate figure the
//    contract does not emit, resolved when the log was captured. They are drawn
//    as two deltas with two receipts, never as one number in two places.
//
// 2. A LINE-SCOPE ROW GETS NO ACTOR AND NO AXIS. A redemption names no
//    position and applies one ratio to every open position at once. It rides
//    the caution label with the line's own amount and no delta against this
//    position, because there is no per-position figure in it to draw.
//
// 3. A CUSTODY MOVE IS NOT A FLOW. The position is a freely transferable
//    ERC721; a transfer moves neither axis and renders as the shared custody
//    row, with the counterparty chip carrying the direction.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import { ChainTruthRow, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  emittedAmountProv,
  resolvedAtCaptureProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";

const WAD = 1e18;

const scaled = (raw: string | null | undefined): number => {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / WAD : 0;
};

export interface AlchemixEventHeaderProps {
  ctx: AlchemixV3Context;
  actionLabel: string;
  /** The vault share ticker for this line, from the position's own row. */
  mytSymbol: string;
  timestamp: number;
  eventNumber?: number;
  coords: AlchemixCoords;
}

export function AlchemixEventHeader({
  ctx,
  actionLabel,
  mytSymbol,
  timestamp,
  eventNumber,
  coords,
}: AlchemixEventHeaderProps) {
  const raw = ctx.raw;
  const sym = ctx.syntheticSymbol;
  const deltas: ChainTruthDelta[] = [];

  const shares = (field: string, value: number, label: string): ChainTruthDelta => ({
    value,
    symbol: mytSymbol,
    label,
    axisVerb: true,
    prov: emittedAmountProv(field, mytSymbol, raw[field], coords),
  });
  const synthetic = (field: string, value: number, label: string): ChainTruthDelta => ({
    value,
    symbol: sym,
    label,
    axisVerb: true,
    prov: emittedAmountProv(field, sym, raw[field], coords),
  });

  let spec: ChainTruthRowSpec = { label: actionLabel, deltas };

  switch (ctx.eventType) {
    case "deposit":
      deltas.push(shares("amount", scaled(raw.amount), "Deposit"));
      break;
    case "withdraw":
      deltas.push(shares("amount", scaled(raw.amount), "Withdraw"));
      break;
    case "mint":
      deltas.push(synthetic("amount", scaled(raw.amount), "Mint"));
      break;
    case "burn":
      deltas.push(synthetic("amount", scaled(raw.amount), "Burn"));
      break;
    case "repay": {
      deltas.push(shares("amount", scaled(raw.amount), "Offered"));
      const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
      if (credit != null) {
        deltas.push({
          value: scaled(credit),
          symbol: sym,
          label: "Cleared",
          axisVerb: true,
          // The spine draws the shares that moved; the debt this bought is not
          // a token movement of the holder's, so it keeps its place here.
          noSpineCounterpart: true,
          prov: resolvedAtCaptureProv("debt credit", sym, credit, coords),
        });
      }
      break;
    }
    case "force_repay": {
      deltas.push(shares("credit_to_yield", scaled(raw.credit_to_yield), "Put against the debt"));
      const fee = scaled(raw.protocol_fee_total);
      if (fee > 0) deltas.push(shares("protocol_fee_total", fee, "Fee"));
      spec = { ...spec, labelOnSpine: true };
      break;
    }
    case "self_liquidated":
      deltas.push(shares("amount_liquidated", scaled(raw.amount_liquidated), "Liquidated"));
      spec = { ...spec, labelOnSpine: true };
      break;
    case "liquidated":
      // The chip names the LIQUIDATOR, which is a role, not a verdict about
      // agency: a liquidation is somebody else's act by definition, and the
      // critical spine already says the position was liquidated. The neutral
      // party seam is the right one — the pink actor chip is for a routine
      // action somebody other than the holder executed, which this is not.
      deltas.push(shares("amount", scaled(raw.amount), "Taken"));
      spec = {
        ...spec,
        critical: true,
        party: raw.liquidator
          ? {
              prefix: "by",
              address: raw.liquidator,
              prov: emittedAmountProv("liquidator", mytSymbol, null, coords),
            }
          : undefined,
      };
      break;
    case "repayment_fee":
      deltas.push(shares("fee_in_yield", scaled(raw.fee_in_yield), "Fee"));
      spec = {
        ...spec,
        party: raw.fee_receiver
          ? { prefix: "to", address: raw.fee_receiver, prov: emittedAmountProv("fee_receiver", mytSymbol, null, coords) }
          : undefined,
      };
      break;
    case "transfer": {
      // The party chip names the address that MATTERS, which is not always the
      // one on the side the transfer type is named after: a mint comes from the
      // zero address and a burn goes to it, and neither is worth a chip.
      const t = ctx.transfer;
      const burned = t?.transferType === "burn";
      const counterparty = burned ? t?.fromAddress : t?.toAddress;
      spec = {
        label: actionLabel,
        deltas: [],
        custody: true,
        party: counterparty
          ? {
              prefix: burned ? "from" : "to",
              address: counterparty,
              prov: emittedAmountProv(burned ? "from_addr" : "to_addr", sym, null, coords),
              ens: true,
            }
          : undefined,
      };
      break;
    }
    case "redemption":
      // The line's own figure, drawn with no direction against this position:
      // the event states one total for the whole line and no share-out.
      deltas.push({
        value: scaled(raw.amount),
        symbol: sym,
        label: "Across the whole line",
        noSpineCounterpart: true,
        tone: "caution",
        prov: emittedAmountProv("amount", sym, raw.amount, coords),
      });
      spec = { ...spec, labelOnSpine: true };
      break;
    case "batch_liquidated":
      deltas.push({
        value: scaled(raw.amount),
        symbol: mytSymbol,
        label: "Across the whole batch",
        noSpineCounterpart: true,
        tone: "caution",
        prov: emittedAmountProv("amount", mytSymbol, raw.amount, coords),
      });
      spec = { ...spec, labelOnSpine: true };
      break;
    case "fee_shortfall":
      deltas.push({
        value: scaled(raw.paid),
        symbol: mytSymbol,
        label: "Paid to the liquidator",
        noSpineCounterpart: true,
        tone: "caution",
        prov: emittedAmountProv("paid", mytSymbol, raw.paid, coords),
      });
      spec = { ...spec, labelOnSpine: true };
      break;
    default:
      break;
  }

  return <ChainTruthRow spec={spec} timestamp={timestamp} eventNumber={eventNumber} />;
}
