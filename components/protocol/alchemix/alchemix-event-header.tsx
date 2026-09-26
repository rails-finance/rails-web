"use client";

// Alchemist event header — adapter onto the shared ChainTruthRow grammar.
//
// FOUR THINGS THIS HEADER GETS RIGHT THAT A GENERIC ONE WOULD NOT.
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
// 3. A SINGLE-AXIS ROW NAMES THE ACTION ONCE. Deposit, withdraw, mint and burn
//    each move one figure, and the row's own label already says what that move
//    was ("Deposit collateral"); the delta itself carries no second verb, just
//    a signed magnitude — the sign is the direction, the way Morpho's chain-
//    state rows already read. A per-axis verb belongs only to a COMBINED row
//    (Liquity V2's Open: `Open  Deposit 6 ◊  Borrow 10K ♭`), where the row
//    label is not itself one of the verbs.
//
// 4. A CUSTODY MOVE IS NOT ALWAYS A LATER TRANSFER. The position NFT's own
//    mint, and a same-transaction forwarding hop that follows it, are both
//    `transfer` logs but neither is a change of owner — the mint made the
//    position and the hop is a routing step, both read off `openingInTx`
//    (lib/alchemix/explainer-clauses). Each gets a label that says so, with
//    the counterparty chip kept exactly where a real, later transfer keeps
//    it. Only a transfer OUTSIDE the opening — a genuine change of hands —
//    stays the bare custody row: no label, the chip's to/from is the verb,
//    because nothing else moved for it to name.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import { ChainTruthRow, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { openingInTx, type AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
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
  /** The rows sharing this event's transaction, and this row among them —
   *  the same pair the explainer takes, needed here for the identical reason:
   *  a `transfer` row cannot tell a position's mint or its same-transaction
   *  forwarding hop from a later change of owner without them. */
  siblings?: AlchemistEvent[];
  self?: AlchemistEvent;
}

export function AlchemixEventHeader({
  ctx,
  actionLabel,
  mytSymbol,
  timestamp,
  eventNumber,
  coords,
  siblings,
  self,
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

  let spec: ChainTruthRowSpec = { label: actionLabel, deltas };

  switch (ctx.eventType) {
    // Single-axis rows: the row's own label already names the move
    // ("Deposit collateral", "Mint debt", …), so the delta carries no second
    // verb — a signed magnitude, direction and all, the way Morpho's rows do.
    case "deposit":
      deltas.push({ value: scaled(raw.amount), symbol: mytSymbol, prov: emittedAmountProv("amount", mytSymbol, raw.amount, coords) });
      break;
    case "withdraw":
      deltas.push({ value: -scaled(raw.amount), symbol: mytSymbol, prov: emittedAmountProv("amount", mytSymbol, raw.amount, coords) });
      break;
    case "mint":
      deltas.push({ value: scaled(raw.amount), symbol: sym, prov: emittedAmountProv("amount", sym, raw.amount, coords) });
      break;
    case "burn":
      deltas.push({ value: -scaled(raw.amount), symbol: sym, prov: emittedAmountProv("amount", sym, raw.amount, coords) });
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
      const party = counterparty
        ? {
            prefix: burned ? "from" : "to",
            address: counterparty,
            prov: emittedAmountProv(burned ? "from_addr" : "to_addr", sym, null, coords),
            ens: true,
          }
        : undefined;

      // Two of this row's cases belong to the SAME transaction that opened
      // the position, not to a later change of hands, and each gets a label
      // that says which: the mint's own transfer (openingInTx reads this log
      // regardless of where the NFT ended up) and, where the mint routed
      // through another address, the hop that followed it in the same tx
      // (openingInTx's forwardingMoves). Only a transfer outside both stays
      // the bare custody row below.
      const opening = openingInTx(siblings ?? [], ctx.tokenId);
      if (t?.transferType === "mint") {
        spec = { label: "Mint position", deltas: [], party };
      } else if (self && opening?.forwardingMoves.includes(self)) {
        spec = { label: "Forward position", deltas: [], party };
      } else {
        spec = { label: actionLabel, deltas: [], custody: true, party };
      }
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
