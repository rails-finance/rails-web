"use client";

// Compound V2 event header — adapter onto the shared ChainTruthRow grammar.
// Maps the signed amount(s) this event moved into the shared row spec; traces
// via <Prov>. Genuinely external actions (someone else repaid — including
// Maximillion fronting a cETH repay) get the pink external-actor chip; the
// seizure legs carry NEUTRAL party chips whose prefixes say what happened
// ("seized by" / "seized from") — the collateral was TAKEN, and the copy never
// reads as a send the borrower made.
//
// The timeline's head (mode "row", rails-ops decision 0045) is words: the
// past-participle kind (`cTokenT1Kind`, lib/compound-v2/head-words.ts), a
// transfer's counterparty as its clause, and the chips for what the spine
// cannot show (the liquidator, the seizure's other party, the "by" party).
// The spine carries the figures. The event page's card (mode "title") keeps
// the signed amounts.

import type { AssetFlow, CompoundV2Context } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { PartyChip, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { cTokenT1Caption, cTokenT1Kind } from "@/lib/compound-v2/head-words";
import { COMPOUND_V2_HEAD_WORDS } from "@/lib/compound-v2/event-templates";
import {
  movedDeltaProv,
  transferAmountProv,
  seizeLegProv,
  seizeTokensProv,
  liqDebtRepaidProv,
  externalActorProv,
  type CompoundV2Coords,
} from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";

export interface CompoundV2EventHeaderProps {
  actionLabel: string;
  ctx: CompoundV2Context;
  txHash?: string;
  blockNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's flows, consulted for the contract behind each delta's symbol.
   *  Every lookup below is keyed on the symbol the delta DISPLAYS, never on the
   *  receipt's catalog symbol: the address has to identify the same asset the
   *  mark is drawn for, and on the cToken lane those two deliberately diverge
   *  (cSAI / cWBTC2). A mint moves the underlying and the cToken in one
   *  transaction, so both appear in the flows and matching by symbol is what
   *  keeps the right one. */
  flows?: AssetFlow[];
  /** "row": the timeline's head, in words; "title" (default): the event
   *  page's card, with the figures. */
  mode?: "row" | "title";
}

const isTransferKind = (t: CompoundV2Context["eventType"]) => t === "transfer_in" || t === "transfer_out";

/** The timeline head's words as one line: the phone caption and the row's
 *  accessible name. */
export function compoundV2T1Caption(ctx: CompoundV2Context, actionLabel: string): string {
  const kind = cTokenT1Kind(ctx.eventType, COMPOUND_V2_HEAD_WORDS, actionLabel);
  if (!isTransferKind(ctx.eventType) || !ctx.counterparty) return kind;
  return cTokenT1Caption(kind, COMPOUND_V2_HEAD_WORDS, {
    lead: ctx.eventType === "transfer_out" ? COMPOUND_V2_HEAD_WORDS.to : COMPOUND_V2_HEAD_WORDS.from,
    address: ctx.counterparty,
  });
}

export function compoundV2HeadSpec({
  actionLabel,
  ctx,
  txHash,
  blockNumber,
  externalBy,
  wallet,
  flows,
  mode = "title",
}: CompoundV2EventHeaderProps): ChainTruthRowSpec {
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const cSym = market?.cSymbol ?? `c${ctx.marketSymbol}`;
  const coords: CompoundV2Coords = {
    txHash,
    blockNumber,
    ctoken: market?.ctoken,
    marketLabel: cSym,
    account: wallet,
  };
  const deltas: ChainTruthDelta[] = [];

  if (ctx.eventType === "liquidation") {
    const covered = Number(ctx.assetsDelta ?? "0") || 0;
    if (covered !== 0)
      deltas.push({
        value: covered,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(flows, ctx.marketSymbol),
        prov: liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount),
        debtSide: true,
      });
    const seized = Number(ctx.seizeTokens ?? "0") || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
      const collCSym = collM?.cSymbol ?? `c${ctx.collateralSymbol}`;
      deltas.push({
        value: -seized,
        symbol: collCSym,
        address: soleFlowAddress(flows, collCSym),
        prov: seizeTokensProv(collCSym, coords, ctx.raw?.seizeTokens),
        // A cToken count, named so it does not read as the underlying.
        suffix: collCSym,
      });
    }
  } else if (ctx.eventType === "seize_out" || ctx.eventType === "seize_burn") {
    // Borrower-loss seize legs: no spine flank (the card renders the warning
    // icon there, not a token row), so these stay outside movedDeltaProv.
    const d = Number(ctx.cTokensDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: cSym,
        address: soleFlowAddress(flows, cSym),
        prov: seizeLegProv(cSym, ctx.eventType, coords, ctx.raw?.cTokens),
        suffix: cSym,
      });
  } else {
    // mint/redeem/borrow/repay (underlying) · transfer_in/transfer_out ·
    // seize_in (cToken) — the shared lane movedDeltaProv also serves the
    // card's spine echo from, so header and echo can never drift apart.
    const isCTokenLane =
      ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out" || ctx.eventType === "seize_in";
    const raw = isCTokenLane ? ctx.raw?.cTokens : ctx.raw?.amount;
    const d = Number((isCTokenLane ? ctx.cTokensDelta : ctx.assetsDelta) ?? "0") || 0;
    const prov = movedDeltaProv(ctx.eventType, ctx.marketSymbol, cSym, coords, raw);
    const shown = isCTokenLane ? cSym : ctx.marketSymbol;
    if (d !== 0 && prov)
      deltas.push({
        value: d,
        symbol: shown,
        address: soleFlowAddress(flows, shown),
        prov,
        ...(isCTokenLane ? { suffix: cSym } : {}),
      });
  }

  // Party chips. Transfers name their counterparty neutrally; the seizure
  // legs name theirs with prefixes that say the collateral was TAKEN —
  // "seized by <liquidator>" on the borrower's loss, "seized from <borrower>"
  // on the liquidator's receipt. The burn leg has no counterparty: the tokens
  // cease to exist. A liquidation names its liquidator.
  const party =
    ctx.eventType === "transfer_in" && ctx.counterparty
      ? {
          prefix: "from",
          address: ctx.counterparty,
          prov: transferAmountProv(cSym, "in", coords),
          ens: true,
        }
      : ctx.eventType === "transfer_out" && ctx.counterparty
        ? {
            prefix: "to",
            address: ctx.counterparty,
            prov: transferAmountProv(cSym, "out", coords),
            ens: true,
          }
        : ctx.eventType === "seize_out" && ctx.counterparty
          ? {
              prefix: "seized by",
              address: ctx.counterparty,
              prov: seizeLegProv(cSym, "seize_out", coords, ctx.raw?.cTokens),
            }
          : ctx.eventType === "seize_in" && ctx.counterparty
            ? {
                prefix: "seized from",
                address: ctx.counterparty,
                prov: seizeLegProv(cSym, "seize_in", coords, ctx.raw?.cTokens),
              }
            : ctx.eventType === "liquidation" && ctx.liquidator
              ? {
                  prefix: "by",
                  address: ctx.liquidator,
                  prov: liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount),
                }
              : undefined;

  const critical = ctx.eventType === "liquidation" || ctx.eventType === "seize_out" || ctx.eventType === "seize_burn";
  const externalActor =
    externalBy && wallet && ctx.txFrom && ctx.caller
      ? {
          address: externalBy,
          prov: externalActorProv(
            { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, caller: ctx.caller },
            coords,
          ),
        }
      : undefined;

  if (mode === "row") {
    const transfer = isTransferKind(ctx.eventType);
    return {
      label: cTokenT1Kind(ctx.eventType, COMPOUND_V2_HEAD_WORDS, actionLabel),
      critical,
      deltas: [],
      // A transfer's counterparty is the clause after "Transferred".
      clauses: transfer && party ? [<PartyChip key="party" party={party} />] : undefined,
      // The kind names the seizure, so its party chip reads "by" or "from".
      party: transfer
        ? undefined
        : party && (ctx.eventType === "seize_out" || ctx.eventType === "seize_in")
          ? {
              ...party,
              prefix: ctx.eventType === "seize_out" ? COMPOUND_V2_HEAD_WORDS.by : COMPOUND_V2_HEAD_WORDS.from,
            }
          : party,
      externalActor,
    };
  }

  return {
    label: actionLabel,
    critical,
    // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
    // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
    custody: ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out",
    deltas,
    externalActor,
    party,
  };
}
