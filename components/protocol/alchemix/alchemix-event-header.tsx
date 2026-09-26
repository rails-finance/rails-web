"use client";

// Alchemist transaction header: adapter onto the shared ChainTruthRow grammar.
//
// ONE TRANSACTION, ONE ROW. An opening emits two or three logs from two
// contracts and they arrive here together, so the row states the whole
// transaction the way Liquity V2's opener does: the green `Open` pill, then one
// per-axis verb and magnitude for each leg that moved something
// (`Open  Deposit 169.83 ●  Mint 72.52 ●`). Nothing about a leg's own receipt
// changes: each delta still carries the log field it came from.
//
// FIVE THINGS THIS HEADER GETS RIGHT THAT A GENERIC ONE WOULD NOT.
//
// 1. A REPAY SHOWS TWO DIFFERENT QUANTITIES. The log's `amount` is the vault
//    shares the caller offered; the debt it cleared is a separate figure the
//    contract does not emit, resolved when the log was captured. They are drawn
//    as two deltas with two receipts, never as one number in two places.
//
// 2. A LINE-SCOPE ROW GETS NO ACTOR AND NO AXIS. A redemption names no
//    position and applies one ratio to every open position at once. It rides
//    the caution label with the line's own amount and no delta against this
//    position, because there is no per-position figure in it to draw. It is
//    also never a leg of anybody's transaction: it joins no combined row.
//
// 3. A SINGLE-AXIS ROW NAMES THE ACTION ONCE. On a lone card, deposit,
//    withdraw, mint and burn each move one figure, and the row's own label
//    already says what that move was ("Deposit collateral"); the delta itself
//    carries no second verb, just a signed magnitude, whose sign is the
//    direction, the way Morpho's chain-state rows already read. A per-axis verb
//    belongs to a COMBINED row, where the row label is not itself one of the
//    verbs, and that is what `combined` switches the deltas over to.
//
// 4. A CUSTODY MOVE IS NOT ALWAYS A LATER TRANSFER. The position NFT's own
//    mint, and a same-transaction forwarding hop that follows it, are both
//    `transfer` logs but neither is a change of owner — the mint made the
//    position and the hop is a routing step, both read off `openingInTx`
//    (lib/alchemix/explainer-clauses). On a combined row they carry no delta at
//    all: they say where the position ENDED the transaction, which is one
//    party chip, not two. Only a transfer OUTSIDE the opening, a genuine
//    change of hands, stays the bare custody row: no label, the chip's to/from
//    is the verb, because nothing else moved for it to name.
//
// 5. AN ADVERSE LEG OWNS THE WHOLE ROW. A forced repayment or a liquidation
//    sharing a transaction with the holder's own move makes the row critical or
//    caution: the spine then draws the warning and no token flank, and every
//    delta stays in the header, which is what those two flags already mean.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import { ChainTruthRow, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  custodyPathInTx,
  openingInTx,
  type AlchemistEvent,
  type AlchemixCustodyPath,
} from "@/lib/alchemix/explainer-clauses";
import { emittedAmountProv, resolvedAtCaptureProv, type AlchemixCoords } from "@/lib/alchemix/event-provenance";

const WAD = 1e18;

const scaled = (raw: string | null | undefined): number => {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / WAD : 0;
};

/** The per-axis verb a combined row gives a leg that has none of its own. The
 *  contract's word for the move, not Liquity's: an Alchemist deposits and
 *  mints where a Trove supplies and borrows. */
const AXIS_VERB: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  mint: "Mint",
  burn: "Burn",
};

/** Adverse but chosen-for-you; the spine draws the caution triangle. */
export const ALCHEMIX_CAUTION = new Set([
  "force_repay",
  "self_liquidated",
  "redemption",
  "batch_liquidated",
  "fee_shortfall",
]);

export interface AlchemixEventHeaderProps {
  /** The legs of ONE transaction that this card DRAWS, in log order. It holds
   *  one element for a transaction that emitted one of this position's logs,
   *  and for a leg a reader's type filter has left standing alone. */
  legs: AlchemistEvent[];
  /** Every row sharing the transaction, filtered or not. A `transfer` cannot
   *  tell a position's mint or its forwarding hop from a later change of owner
   *  without them, and a filter must not turn one into the other. */
  siblings: AlchemistEvent[];
  /** The vault share ticker for this line, from the position's own row. */
  mytSymbol: string;
  timestamp: number;
  eventNumber?: number;
  /** Each leg's own coordinates; the emitter differs between the Alchemist and
   *  the position NFT, so a receipt cannot borrow another leg's. */
  coordsFor: (leg: AlchemistEvent) => AlchemixCoords;
}

/** One leg's own row spec. `combined` swaps the single-axis rows over to the
 *  per-axis verb grammar (rule 3) and drops the custody legs' chips, which the
 *  combining step rebuilds once from the opening. */
function legSpec(
  leg: AlchemistEvent,
  mytSymbol: string,
  coords: AlchemixCoords,
  siblings: AlchemistEvent[],
  combined: boolean,
): ChainTruthRowSpec {
  const ctx = leg.context.data;
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

  /** A single-axis move: a signed magnitude on its own card, the axis' own verb
   *  beside a bare magnitude on a combined one. */
  const axis = (value: number, symbol: string): ChainTruthDelta => ({
    value: combined ? Math.abs(value) : value,
    symbol,
    label: combined ? AXIS_VERB[ctx.eventType] : undefined,
    axisVerb: combined || undefined,
    prov: emittedAmountProv("amount", symbol, raw.amount, coords),
  });

  let spec: ChainTruthRowSpec = { label: leg.actionLabel, deltas };

  switch (ctx.eventType) {
    case "deposit":
      deltas.push(axis(scaled(raw.amount), mytSymbol));
      break;
    case "withdraw":
      deltas.push(axis(-scaled(raw.amount), mytSymbol));
      break;
    case "mint":
      deltas.push(axis(scaled(raw.amount), sym));
      break;
    case "burn":
      deltas.push(axis(-scaled(raw.amount), sym));
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
          ? {
              prefix: "to",
              address: raw.fee_receiver,
              prov: emittedAmountProv("fee_receiver", mytSymbol, null, coords),
            }
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
      const opening = openingInTx(siblings, ctx.tokenId);
      if (t?.transferType === "mint") {
        spec = { label: "Mint position", deltas: [], party };
      } else if (opening?.forwardingMoves.includes(leg)) {
        spec = { label: "Forward position", deltas: [], party };
      } else {
        spec = { label: leg.actionLabel, deltas: [], custody: true, party };
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

  return spec;
}

/** The transaction's own row, built from its legs' specs.
 *
 *  THE CHIP SAYS WHERE THE POSITION ENDED THE TRANSACTION, once, and only where
 *  that is somewhere new (rule 4). A periphery contract that takes the NFT,
 *  withdraws and hands it back moves it twice and changes nothing, so a chip
 *  naming either hop would report a change of owner that did not happen; the
 *  round trip is a bullet instead. With no custody chip to draw, a liquidator
 *  or fee receiver named by one of the other legs takes the seam.
 *
 *  The label is the other decision. An opening takes Liquity's green pill and
 *  lets the per-axis verbs carry the moves; an adverse leg takes the row (rule
 *  5); a transaction of custody legs alone stays custody; anything else drops
 *  the row label, which is the shared grammar's signal that the deltas' own
 *  verbs are the sentence. */
export function combineLegSpecs(
  specs: ChainTruthRowSpec[],
  legs: AlchemistEvent[],
  opening: ReturnType<typeof openingInTx>,
  path: AlchemixCustodyPath | null,
  coordsFor: (leg: AlchemistEvent) => AlchemixCoords,
): ChainTruthRowSpec {
  const deltas = specs.flatMap((s) => s.deltas);
  const critical = specs.find((s) => s.critical);
  const onSpine = specs.find((s) => s.labelOnSpine);
  const mintLeg = legs.find((l) => l.context.data.transfer?.transferType === "mint");

  const custodyLeg = path?.moves[path.moves.length - 1];
  const custodyProv = (field: string) =>
    emittedAmountProv(field, custodyLeg!.context.data.syntheticSymbol, null, coordsFor(custodyLeg!));
  const custodyParty =
    opening && mintLeg
      ? {
          prefix: "to" as const,
          address: opening.forwardedTo ?? opening.mintedTo,
          prov: emittedAmountProv("to_addr", mintLeg.context.data.syntheticSymbol, null, coordsFor(mintLeg)),
          ens: true,
        }
      : path?.burnedFrom
        ? { prefix: "from" as const, address: path.burnedFrom, prov: custodyProv("from_addr"), ens: true }
        : path?.moved
          ? { prefix: "to" as const, address: path.to, prov: custodyProv("to_addr"), ens: true }
          : undefined;
  const party = custodyParty ?? specs.find((s, i) => s.party && legs[i].context.data.eventType !== "transfer")?.party;

  if (critical) return { ...critical, deltas, party: critical.party ?? party };
  if (onSpine) return { ...onSpine, deltas, party: onSpine.party ?? party };
  // The pill is only the card's to give where the card DRAWS the mint: a filter
  // that left the deposit standing alone has not left an opening behind.
  if (opening && mintLeg) return { label: "Open", status: "open", deltas, party };
  if (specs.every((s) => s.custody)) return { label: specs[0].label, deltas, custody: true, party };
  return { label: "", deltas, party };
}

/** The token id these legs belong to, from the first leg that names one. */
export function legTokenId(legs: AlchemistEvent[]): string | null {
  return legs.find((l) => l.context.data.tokenId != null)?.context.data.tokenId ?? null;
}

export function AlchemixEventHeader({
  legs,
  siblings,
  mytSymbol,
  timestamp,
  eventNumber,
  coordsFor,
}: AlchemixEventHeaderProps) {
  const combined = legs.length > 1;
  const specs = legs.map((leg) => legSpec(leg, mytSymbol, coordsFor(leg), siblings, combined));
  const tokenId = legTokenId(legs);
  const spec = combined
    ? combineLegSpecs(specs, legs, openingInTx(siblings, tokenId), custodyPathInTx(legs, tokenId), coordsFor)
    : specs[0];

  return <ChainTruthRow spec={spec} timestamp={timestamp} eventNumber={eventNumber} />;
}
