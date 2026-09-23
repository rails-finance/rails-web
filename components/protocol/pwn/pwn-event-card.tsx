"use client";

// Composer: wires the PWN header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).

import type { PwnContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import type { SpineValProv } from "@/components/shared/activity-timeline";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { creditAdvancedProv, repayAmountProv, type PwnCoords } from "@/lib/pwn/event-provenance";
import { pwnExplainerTeaser, type PwnEvent } from "@/lib/pwn/explainer-clauses";
import { PwnEventHeader } from "./pwn-event-header";
import { PwnEventDetail } from "./pwn-event-detail";
import { PwnEventExplainer, pwnLearnMoreContent } from "./pwn-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface PwnEventCardProps {
  event: PwnEvent;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the custody cross-reference seam (defaults to just
   *  this one). */
  siblings?: PwnEvent[];
}

export function PwnEventCard({ event, isFirst, isLast, eventNumber, siblings }: PwnEventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const isSeizure = ctx.eventType === "claimed" && ctx.defaulted === true;

  // Token glyph on the spine for the value-moving events. direction "left" =
  // toward the wallet (credit received at creation, repayment claimed by the
  // lender), "right" = toward the protocol (repayment). The LOAN-token lifecycle
  // events (minted / burned) and the renegotiation (extended) move no value —
  // they carry a semantic glyph instead of a token (below).
  const coords: PwnCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    loanId: ctx.loanId,
    version: ctx.version,
  };

  // PWN is peer-to-peer: the credit asset is whatever the two parties agreed
  // on, so its symbol comes from an open set and the house address table is
  // never going to name most of it — which is when the icon chip stops trying
  // and prints an initial. The loan's own flows record the credit contract, so
  // the address is read from there once and shared by every branch below. The
  // helper answers only on a single symbol match, because a mark pinned to the
  // wrong contract states something untrue where a letter states nothing.
  const creditAddress = soleFlowAddress(event.flows, ctx.creditSymbol);
  let tokens:
    | { symbol: string; address?: string; direction: "right" | "left"; value?: number; prov?: SpineValProv }[]
    | undefined;
  if (ctx.eventType === "created" && ctx.creditSymbol) {
    const v = Math.abs(Number(ctx.creditAmount ?? "0"));
    if (v > 0)
      tokens = [
        {
          symbol: ctx.creditSymbol,
          address: creditAddress,
          direction: "left",
          value: v,
          // Echoes the header's creditAdvancedProv (pwn-event-header.tsx) —
          // always positive, so the header's unlabeled (signed) value is "+".
          prov: {
            info: creditAdvancedProv(ctx.creditSymbol, coords),
            value: chainTruthDeltaValue(v, false),
            symbol: ctx.creditSymbol,
          },
        },
      ];
  } else if (ctx.eventType === "paid_back" && ctx.creditSymbol) {
    const v = Math.abs(Number(ctx.loanRepayAmount ?? "0"));
    if (v > 0)
      tokens = [
        {
          symbol: ctx.creditSymbol,
          address: creditAddress,
          direction: "right",
          value: v,
          // Echoes the header's repayAmountProv — same "+"-signed grammar.
          prov: {
            info: repayAmountProv(ctx.creditSymbol, coords),
            value: chainTruthDeltaValue(v, false),
            symbol: ctx.creditSymbol,
          },
        },
      ];
  } else if (ctx.eventType === "claimed" && !ctx.defaulted && ctx.creditSymbol) {
    // Non-default claim: the note holder collects the repaid credit — it flows
    // to the wallet, mirroring `created` but in the opposite direction of
    // `paid_back`. Echoes the header's repayAmountProv (the collected amount
    // IS the terms' repay total), the same "+"-signed grammar as the others.
    const v = Math.abs(Number(ctx.loanRepayAmount ?? "0"));
    if (v > 0)
      tokens = [
        {
          symbol: ctx.creditSymbol,
          address: creditAddress,
          direction: "left",
          value: v,
          prov: {
            info: repayAmountProv(ctx.creditSymbol, coords),
            value: chainTruthDeltaValue(v, false),
            symbol: ctx.creditSymbol,
          },
        },
      ];
    else tokens = [{ symbol: ctx.creditSymbol, address: creditAddress, direction: "left" }];
  }

  // Semantic glyph for the events that move no token. minted/burned are the
  // LOAN-token lifecycle (system side-effects → dotted spine); extended is a
  // deliberate renegotiation → solid.
  const lifecycleIcon =
    ctx.eventType === "minted"
      ? ("mint" as const)
      : ctx.eventType === "burned"
        ? ("burn" as const)
        : ctx.eventType === "extended"
          ? ("extend" as const)
          : undefined;

  const iconSlot = isSeizure ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel="Default"
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : lifecycleIcon ? (
    <SpineColumn
      icon={lifecycleIcon}
      spine={lifecycleIcon === "extend" ? "solid" : "dotted"}
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn tokens={tokens} isFirst={isFirst} isLast={!!isLast} />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <PwnEventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          flows={event.flows}
        />
      }
      detail={<PwnEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />}
      detailLabel="Loan terms"
      explainer={<PwnEventExplainer ctx={ctx} event={event} siblings={sibs} skipLead />}
      explainerLabel="Plain English"
      explainerTeaser={pwnExplainerTeaser(ctx, coords, sibs, event)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={pwnLearnMoreContent(ctx)} />}
      persistKey={`pwn:${event.id}`}
    />
  );
}
