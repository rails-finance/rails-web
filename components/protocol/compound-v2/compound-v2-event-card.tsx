"use client";

// Composer: wires the Compound V2 header / detail / explainer into the
// universal EventCard shell (the plain-English explainer rides its own
// second-tier slot).
//
// Two shapes Moonwell's composer never met:
//   • liquidation — ONE card per liquidation (the index merged its repay leg),
//     critical-toned on the spine.
//   • the named seizure legs — seize_out / seize_burn are collateral being
//     TAKEN from this wallet (warning icon, never a token-flow chip that reads
//     like a send); seize_in is the liquidator's receipt (a real inflow).

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { movedDeltaProv, type CompoundV2Coords } from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2ExplainerTeaser, type CompoundV2Event } from "@/lib/compound-v2/explainer-clauses";
import { CompoundV2EventHeader } from "./compound-v2-event-header";
import { CompoundV2EventDetail } from "./compound-v2-event-detail";
import { CompoundV2EventExplainer, compoundV2LearnMoreContent } from "./compound-v2-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface CompoundV2EventCardProps {
  event: CompoundV2Event;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the seize seam (defaults to just this one). */
  siblings?: CompoundV2Event[];
}

// direction "right" = token moves away from the wallet (deposit / repay),
// "left" = toward the wallet (withdraw / borrow). The seize legs never reach
// this map — they render on the warning spine, not as flows. Nor do the
// transfers: a cToken changing hands is a custody move, neither flank, and
// the row wears the paper-plane badge instead (see `tokens`).
const DIRECTION: Partial<Record<CompoundV2Context["eventType"], "right" | "left">> = {
  mint: "right",
  redeem: "left",
  borrow: "left",
  repay: "right",
  liquidation: "left",
  seize_in: "left",
};

export function CompoundV2EventCard({ event, isFirst, isLast, eventNumber, siblings }: CompoundV2EventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const isLiq = ctx.eventType === "liquidation";
  // The borrower's side of a seizure: collateral being taken (or burned as the
  // protocol's cut) — a passive loss, like the liquidation row itself.
  const isSeizeLoss = ctx.eventType === "seize_out" || ctx.eventType === "seize_burn";
  const isCTokenMove =
    ctx.eventType === "transfer_in" ||
    ctx.eventType === "transfer_out" ||
    ctx.eventType === "seize_in" ||
    ctx.eventType === "seize_out" ||
    ctx.eventType === "seize_burn";
  // cToken-lane events move cTokens (no emitted underlying amount); everything
  // else moves the underlying.
  const d = Number((isCTokenMove ? ctx.cTokensDelta : ctx.assetsDelta) ?? "0") || 0;
  const mag = Math.abs(d);
  const cSymbol = event.flows[0]?.tokenSymbol ?? `c${ctx.marketSymbol}`;
  const symbol = isCTokenMove ? cSymbol : ctx.marketSymbol;
  // Third-party action: the owner neither signed the tx nor was the event's
  // own party. Seize legs and liquidations carry their own critical treatment
  // instead of the external glyph.
  const extBy =
    isLiq || isSeizeLoss || ctx.eventType === "seize_in"
      ? null
      : externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

  const dir = DIRECTION[ctx.eventType];
  const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
  // The header registers its receipt under the CATALOG cSym (market?.cSymbol),
  // not event.flows[0].tokenSymbol — the two diverge on cSAI/cWBTC2 — so the
  // echo's identity is built from the catalog symbol even though the icon
  // above renders the display `symbol`.
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const catalogCSym = market?.cSymbol ?? `c${ctx.marketSymbol}`;
  const coords: CompoundV2Coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    ctoken: market?.ctoken,
    marketLabel: catalogCSym,
    account: event.wallet,
  };
  const provSym = isCTokenMove ? catalogCSym : ctx.marketSymbol;
  const raw = isCTokenMove ? ctx.raw?.cTokens : ctx.raw?.amount;
  // The address goes to the icon chip, which can only ask a CDN about a
  // contract; the symbol alone sends it to the house table. It is looked up
  // under the DISPLAYED `symbol` rather than the receipt's `provSym`, because
  // the address has to identify the same asset the mark is being drawn for —
  // and on the cToken lane those two deliberately differ (cSAI/cWBTC2). A mint
  // moves the underlying and the cToken in one transaction, so both symbols
  // appear in the flows; matching by symbol picks out the right one, and a
  // symbol carried by two flows is left unresolved rather than guessed at.
  //
  // A transfer is a custody move: the token's icon wears the paper-plane badge
  // and neither flank is drawn — the two flanks are "out to the wallet" and
  // "into the protocol", and a transfer to another account is neither. The
  // header states the amount and the to/from counterparty.
  const tokens =
    isLiq || isSeizeLoss || mag === 0
      ? undefined
      : isTransfer
        ? [{ symbol, address: soleFlowAddress(event.flows, symbol), badge: "send" as const }]
        : !dir
          ? undefined
          : [
              {
                symbol,
                address: soleFlowAddress(event.flows, symbol),
                direction: dir,
                value: mag,
                prov: {
                  // Defined for every eventType reaching this branch (dir is only
                  // set for the lanes movedDeltaProv covers) — the "!" documents
                  // that, rather than papering over a real gap.
                  info: movedDeltaProv(ctx.eventType, ctx.marketSymbol, catalogCSym, coords, raw)!,
                  value: chainTruthDeltaValue(d, false),
                  symbol: provSym,
                },
              },
            ];

  const iconSlot = isLiq ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel="Liquidation"
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : isSeizeLoss ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel="Seizure"
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn
      tokens={tokens}
      externalParty={!!extBy}
      spine={extBy ? "dotted" : "solid"}
      isFirst={isFirst}
      isLast={!!isLast}
    />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <CompoundV2EventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          externalBy={extBy ?? undefined}
          wallet={event.wallet}
          flows={event.flows}
        />
      }
      detail={
        <CompoundV2EventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} wallet={event.wallet} />
      }
      detailLabel="Position state"
      explainer={
        <CompoundV2EventExplainer ctx={ctx} event={event} externalBy={extBy ?? undefined} siblings={sibs} skipLead />
      }
      explainerLabel="Plain English"
      explainerTeaser={compoundV2ExplainerTeaser(ctx, coords, sibs, event, extBy ?? undefined)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={compoundV2LearnMoreContent(ctx)} />}
      persistKey={`compound-v2:${event.id}`}
    />
  );
}
