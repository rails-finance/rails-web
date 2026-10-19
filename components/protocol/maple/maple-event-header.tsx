"use client";

// Maple event header — adapter onto the shared ChainTruthRow grammar.
//
// The timeline's head (mode "row", rails-ops decision 0045) is words: the
// past-participle kind (`mapleT1Kind`, lib/maple/event-label.ts), a
// transfer's counterparty as its clause, and the pink "by" chip where someone
// else moved the position. The spine carries the figures; a fill's wait since
// its request is a note in the Figures sheet.
//
// The event page's card (mode "title") maps the signed amount(s) this event
// moved into the shared row spec, each traced via <Prov>. Value-bearing events
// (deposit / withdraw / fill) lead with the asset amount; queue and transfer
// events lead with the share amount.

import type { AssetFlow, MapleContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { PartyChip, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  flankedLegProv,
  sharesLegProv,
  transferAmountProv,
  externalActorProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";
import { getKnownInfrastructure } from "@/lib/shared/known-infrastructure";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatWait } from "@/lib/maple/row-times";
import {
  isRouterDeposit,
  isSyrupRouter,
  mapleT1Kind,
  mapleT1PartyName,
  MAPLE_T1,
  TRANSFER_LABEL,
} from "@/lib/maple/event-label";
import { formatNumber } from "@/lib/utils/format";

export interface MapleEventHeaderProps {
  actionLabel: string;
  ctx: MapleContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own movements, read for the contract behind each leg. A pool
   *  share token is minted per pool and was never going to appear in the house
   *  symbol table, so without an address that leg has nothing to draw but a
   *  letter; the underlying is named there too and the same lookup covers both.
   *  Each leg asks about its OWN symbol, which is what keeps the asset and the
   *  share apart in a deposit that moved both. */
  flows?: AssetFlow[];
  /** Queue fills: unix seconds of the request this fill paid, where loaded. */
  requestAt?: number;
  /** "row": the timeline's head, in words; "title" (default): the event
   *  page's card, with the figures. */
  mode?: "row" | "title";
}

/** T1's head row spec (the card's `head` slot). */
export function useMapleHeadSpec({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
  requestAt,
  mode = "title",
}: MapleEventHeaderProps): ChainTruthRowSpec {
  const coords: MapleCoords = { txHash, blockNumber, pool: ctx.pool, account: wallet };
  const deltas: ChainTruthDelta[] = [];

  // The flanked leg — the same builder + signed-value convention the card's
  // spine echo calls, so the two can never disagree on the sign.
  const flanked = flankedLegProv(ctx, coords);
  // Each amount names its token in words (the phone row has no spine to
  // carry it): a request moves shares, a fill pays the asset. One rounding
  // rule, Polaris's: the row, the spine, the opened grid and the card state
  // an amount in full to three decimals.
  if (flanked)
    deltas.push({
      ...flanked,
      address: soleFlowAddress(flows, flanked.symbol),
      suffix: flanked.symbol,
      display: formatNumber(Math.abs(flanked.value)),
    });

  // The share leg rides beside the asset leg on deposits/withdraws (mint/burn).
  // The card draws it as the spine's second row from this same builder, so the
  // hand-off at ≥sm has somewhere to land.
  const shares = sharesLegProv(ctx, coords);
  if (shares)
    deltas.push({
      ...shares,
      address: soleFlowAddress(flows, shares.symbol),
      suffix: shares.symbol,
      display: formatNumber(Math.abs(shares.value)),
    });

  const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
  // Which pool the row is in (a wallet's two pools interleave), then what
  // the amount is and where it went.
  const what =
    ctx.eventType === "request"
      ? "shares moved into the queue"
      : ctx.eventType === "request_fill"
        ? requestAt != null && timestamp >= requestAt
          ? `paid to the wallet, ${formatWait(timestamp - requestAt)} after the request`
          : "paid to the wallet"
        : ctx.eventType === "transfer_in" && isSyrupRouter(ctx.counterparty)
          ? "deposited through the router"
          : undefined;
  const note = what ? `${ctx.assetSymbol} pool · ${what}` : `${ctx.assetSymbol} pool`;

  // Party chips: a transfer counterparty is a NEUTRAL party of the event
  // itself; only a true external action is a verdict. A known infrastructure
  // counterparty (the CCIP bridge escrow, a SyrupRouter, a lending pool)
  // renders its registry name over the truncated address — the chip's
  // existing `name` seam; unknowns keep the bare address.
  const party =
    ctx.eventType === "transfer_in" && ctx.counterparty
      ? {
          prefix: "from",
          address: ctx.counterparty,
          name: getKnownInfrastructure(ctx.counterparty, MAINNET_CHAIN_ID)?.name,
          prov: transferAmountProv(ctx.poolSymbol, "in", coords),
          ens: true,
        }
      : ctx.eventType === "transfer_out" && ctx.counterparty
        ? {
            prefix: "to",
            address: ctx.counterparty,
            name: getKnownInfrastructure(ctx.counterparty, MAINNET_CHAIN_ID)?.name,
            prov: transferAmountProv(ctx.poolSymbol, "out", coords),
            ens: true,
          }
        : undefined;

  const externalActor =
    externalBy && wallet && ctx.txFrom && ctx.caller
      ? {
          address: externalBy,
          prov: externalActorProv(
            { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, caller: ctx.caller },
            coords,
          ),
          tip: isTransfer
            ? "“by” is the address that sent the transaction; “from” is the wallet the shares came from."
            : undefined,
        }
      : undefined;

  if (mode === "row") {
    // A transfer's counterparty is the clause; shares from the SyrupRouter
    // read as the wallet's deposit made through it.
    const clause = party && {
      ...party,
      prefix: isRouterDeposit(ctx) ? MAPLE_T1.through : party.prefix,
      name: mapleT1PartyName(party.address),
    };
    return {
      label: mapleT1Kind(ctx),
      deltas: [],
      clauses: clause ? [<PartyChip key="party" party={clause} />] : undefined,
      externalActor,
    };
  }

  return {
    label: isTransfer ? TRANSFER_LABEL[ctx.eventType as keyof typeof TRANSFER_LABEL] : actionLabel,
    // A transfer is a custody row: `Shares received 400 ◎ from 0x…`, the
    // verb kept before the amount.
    custody: isTransfer,
    custodyLabel: isTransfer,
    deltas,
    note,
    externalActor,
    party,
  };
}
