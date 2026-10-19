"use client";

// Moonwell event header — adapter onto the shared ChainTruthRow grammar. Maps
// the signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Router-proxied mints/redeems carry a NEUTRAL "via 0x…" party chip
// (routing, not a third-party verdict — the owner initiated it); genuinely
// external actions (someone else repaid) get the pink external-actor chip.
//
// The timeline's head (mode "row", rails-ops decision 0045) is words: the
// past-participle kind (`cTokenT1Kind`, lib/compound-v2/head-words.ts), a
// transfer's counterparty as its clause, and the chips for what the spine
// cannot show. The spine carries the figures. The event page's card (mode
// "title") keeps the signed amounts.

import type { AssetFlow, MoonwellContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { PartyChip, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { cTokenT1Caption, cTokenT1Kind } from "@/lib/compound-v2/head-words";
import { MOONWELL_HEAD_WORDS } from "@/lib/moonwell/event-templates";
import {
  assetsDeltaProv,
  transferAmountProv,
  seizeTokensProv,
  liqDebtRepaidProv,
  routerProxiedProv,
  externalActorProv,
} from "@/lib/moonwell/event-provenance";
import { useMoonwellCoords, useMoonwellDeployment } from "@/lib/moonwell/deployment-context";

export interface MoonwellEventHeaderProps {
  actionLabel: string;
  ctx: MoonwellContext;
  txHash?: string;
  blockNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own movements, read for each delta's contract. Unlike the
   *  spine — where an mToken row wears the underlying's mark and the lookup has
   *  to key on that override — a header delta draws its mark under its OWN
   *  symbol, so an mToken row asks the flows about the mToken and an underlying
   *  row asks about the underlying. The address has to identify whatever the
   *  chip is resolving, and here those are the same thing. */
  flows?: AssetFlow[];
  /** "row": the timeline's head, in words; "title" (default): the event
   *  page's card, with the figures. */
  mode?: "row" | "title";
}

const isTransferKind = (t: MoonwellContext["eventType"]) => t === "transfer_in" || t === "transfer_out";

/** The timeline head's words as one line: the phone caption and the row's
 *  accessible name. `partyLead`: the transfer chip's prefix ("to the
 *  liquidator"). */
export function moonwellT1Caption(ctx: MoonwellContext, actionLabel: string, partyLead?: string): string {
  const kind = cTokenT1Kind(ctx.eventType, MOONWELL_HEAD_WORDS, actionLabel);
  if (!isTransferKind(ctx.eventType) || !ctx.counterparty) return kind;
  return cTokenT1Caption(kind, MOONWELL_HEAD_WORDS, {
    lead: partyLead ?? (ctx.eventType === "transfer_out" ? MOONWELL_HEAD_WORDS.to : MOONWELL_HEAD_WORDS.from),
    address: ctx.counterparty,
  });
}

/** A transfer out's chip prefix: the protocol's share of a seizure goes to
 *  the market itself; a seizure's transfer to the liquidator goes to the
 *  contract that called the market, in a transaction someone other than the
 *  owner sent. */
export function moonwellTransferOutLead(
  ctx: MoonwellContext,
  wallet: string | undefined,
  mtoken: string | undefined,
  mSym: string,
): string {
  if (!ctx.counterparty) return "to";
  if (mtoken != null && ctx.counterparty === mtoken.toLowerCase()) return `to the ${mSym} market`;
  return wallet &&
    ctx.caller &&
    ctx.caller.toLowerCase() === ctx.counterparty.toLowerCase() &&
    ctx.txFrom &&
    ctx.txFrom.toLowerCase() !== wallet.toLowerCase()
    ? "to the liquidator"
    : "to";
}

export function useMoonwellHeadSpec({
  actionLabel,
  ctx,
  txHash,
  blockNumber,
  externalBy,
  wallet,
  flows,
  mode = "title",
}: MoonwellEventHeaderProps): ChainTruthRowSpec {
  const dep = useMoonwellDeployment();
  const coords = useMoonwellCoords({ market: ctx.market, symbol: ctx.marketSymbol, txHash, blockNumber, wallet });
  const mSym = coords.marketLabel ?? `m${ctx.marketSymbol}`;
  const deltas: ChainTruthDelta[] = [];

  if (ctx.eventType === "liquidation") {
    const covered = Number(ctx.assetsDelta ?? "0") || 0;
    if (covered !== 0)
      deltas.push({
        value: covered,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(flows, ctx.marketSymbol),
        prov: liqDebtRepaidProv(ctx.marketSymbol, coords),
        debtSide: true,
      });
    const seized = Number(ctx.seizeTokens ?? "0") || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collMSym = ctx.collateralMarket
        ? dep.market(ctx.collateralMarket, ctx.collateralSymbol).mSymbol
        : `m${ctx.collateralSymbol}`;
      deltas.push({
        value: -seized,
        symbol: collMSym,
        // No contract address for an mToken: the icon CDNs hold none, so the
        // chip resolves the mark from the symbol.
        prov: seizeTokensProv(collMSym, coords),
        // An mToken count, named so it does not read as the underlying.
        suffix: collMSym,
      });
    }
  } else if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") {
    const d = Number(ctx.mTokensDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: mSym,
        prov: transferAmountProv(mSym, ctx.eventType === "transfer_in" ? "in" : "out", coords),
        suffix: mSym,
      });
  } else {
    const d = Number(ctx.assetsDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(flows, ctx.marketSymbol),
        prov: assetsDeltaProv(ctx.marketSymbol, ctx.eventType, coords, ctx.raw?.amount),
      });
  }

  // Party chips: the transfer counterparty and the WETH Router are NEUTRAL
  // parties of the event itself; only a true external action is a verdict.
  const party =
    ctx.eventType === "transfer_in" && ctx.counterparty
      ? {
          prefix: "from",
          address: ctx.counterparty,
          prov: transferAmountProv(mSym, "in", coords),
          ens: true,
        }
      : ctx.eventType === "transfer_out" && ctx.counterparty
        ? {
            prefix: moonwellTransferOutLead(ctx, wallet, coords.mtoken, mSym),
            address: ctx.counterparty,
            prov: transferAmountProv(mSym, "out", coords),
            ens: true,
          }
        : ctx.routerProxied && wallet && (ctx.eventType === "mint" || ctx.eventType === "redeem")
          ? {
              prefix: "via",
              address: ctx.caller ?? "",
              prov: routerProxiedProv({ eventType: ctx.eventType, owner: wallet }, coords),
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
          // A contract made the repayment for the wallet that sent the
          // transaction (a liquidation bot's contract, say): both named.
          ...(ctx.eventType === "repay" && ctx.caller.toLowerCase() !== ctx.txFrom.toLowerCase()
            ? {
                prefix: "sent by",
                tip: (
                  <>
                    {ctx.txFrom.slice(0, 6)}…{ctx.txFrom.slice(-4)} sent the transaction. The contract{" "}
                    {ctx.caller.slice(0, 6)}…{ctx.caller.slice(-4)} it called made the repayment.
                  </>
                ),
              }
            : {}),
        }
      : undefined;

  if (mode === "row") {
    const transfer = isTransferKind(ctx.eventType);
    return {
      label: cTokenT1Kind(ctx.eventType, MOONWELL_HEAD_WORDS, actionLabel),
      critical: ctx.eventType === "liquidation",
      deltas: [],
      // A transfer's counterparty is the clause after "Transferred".
      clauses: transfer && party ? [<PartyChip key="party" party={party} />] : undefined,
      party: transfer ? undefined : party,
      externalActor,
    };
  }

  return {
    label: actionLabel,
    critical: ctx.eventType === "liquidation",
    // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
    // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
    custody: ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out",
    deltas,
    externalActor,
    party,
  };
}
