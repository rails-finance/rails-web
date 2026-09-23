"use client";

// Composer: wires the MakerDAO header / detail into the universal EventCard
// shell, with the Plain English explainer + per-mechanic Learn More alongside
// the chain-state detail grid (reference depth).

import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { dinkProv, dartProv, type MakerCoords } from "@/lib/makerdao/event-provenance";
import { makerdaoExplainerTeaser } from "@/lib/makerdao/explainer-clauses";
import { MakerDAOEventHeader } from "./makerdao-event-header";
import { MakerDAOEventDetail } from "./makerdao-event-detail";
import { MakerDAOEventExplainer, makerdaoLearnMoreContent } from "./makerdao-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface MakerDAOEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "makerdao"; data: MakerDAOContext } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

export function MakerDAOEventCard({ event, isFirst, isLast, eventNumber }: MakerDAOEventCardProps) {
  const ctx = event.context.data;
  const isGrab = ctx.eventType === "grab";
  const isFork = ctx.eventType === "fork-out" || ctx.eventType === "fork-in";
  const isGive = ctx.eventType === "give";
  // LockStake auction lifecycle (zero-delta markers; the paired grab carries
  // the seizure) — critical treatment like grab, no token chips.
  const isLseLiq = ctx.eventType === "lse-kick" || ctx.eventType === "lse-take" || ctx.eventType === "lse-remove";
  const dink = Number(ctx.dink);
  const dart = Number(ctx.dart);
  // Third-party action: the owner neither signed the tx nor initiated it
  // through their own proxy (txTo plays the party-param role — Maker's Vat
  // has none, but a DSProxy is auth-gated so the entry contract discriminates
  // exactly). Passive events ride the dotted spine; the pink external-party
  // glyph replaces the token flow, and the header keeps the moved amounts
  // plus the "by 0x…" chip. Judged against the owner IN FORCE at the event's
  // block (ownerAt, era-aware) — the current owner may postdate a give.
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.txTo }, ctx.ownerAt ?? event.wallet);

  // Echo: the header registers dinkProv/dartProv on every frob/fork/grab with
  // a nonzero delta (makerdao-event-header.tsx pushes unconditionally), bare
  // ONLY on a frob (perAxis there collapses to `eventType === "frob"` — isOpen
  // and its negation cover the whole frob domain) and signed otherwise. The
  // spine itself only ever shows dink+dart tokens for frob/fork (isGrab hides
  // both, isFork hides dart) — echo exactly the legs actually rendered below.
  const coords: MakerCoords = { txHash: event.txHash, blockNumber: event.blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const labeled = ctx.eventType === "frob";

  // Token chips: collateral (dink) + debt (dart; DAI, or USDS on LockStake
  // urns). direction "right" = toward the protocol (deposit / repay), "left" =
  // toward the wallet (withdraw / generate). A fork moves the debt WITH the
  // collateral — nothing is minted or burned — so fork rows show only the
  // collateral chip (its vault-scope direction is real); the header deltas and
  // explainer carry the debt figure.
  const tokens = isGrab
    ? undefined
    : [
        ...(dink !== 0
          ? [
              {
                symbol: ctx.collateralSymbol,
                direction: (dink > 0 ? "right" : "left") as "right" | "left",
                value: Math.abs(dink),
                prov: {
                  info: dinkProv(ctx.collateralSymbol, coords),
                  value: chainTruthDeltaValue(dink, labeled),
                  symbol: ctx.collateralSymbol,
                },
              },
            ]
          : []),
        ...(dart !== 0 && !isFork
          ? [
              {
                symbol: ilkDebtSymbol(ctx.ilk),
                // DAI or USDS depending on the ilk, and the debt flow names the
                // ERC-20 the join actually minted — which is what the icon chip
                // needs, since a symbol alone only reaches the house table. The
                // COLLATERAL row above gets no such treatment: a Vat position
                // is identified by ilk, not by contract, so the collateral flow
                // carries no token address to pass on. Its symbol lookup is
                // what draws that chip today and continues to.
                address: soleFlowAddress(event.flows, ilkDebtSymbol(ctx.ilk)),
                direction: (dart > 0 ? "left" : "right") as "right" | "left",
                value: Math.abs(dart),
                prov: {
                  info: dartProv(coords),
                  value: chainTruthDeltaValue(dart, labeled),
                  symbol: ilkDebtSymbol(ctx.ilk),
                },
              },
            ]
          : []),
      ];

  const iconSlot =
    isGrab || isLseLiq ? (
      <SpineColumn
        icon="warning"
        warningTone="critical"
        warningLabel={isGrab ? "Liquidation" : "Auction"}
        spine="dotted"
        isFirst={isFirst}
        isLast={!!isLast}
      />
    ) : isGive ? (
      // An ownership handover is a people event with no token flow — the person
      // glyph with the join badge marks the new owner taking over; dotted spine
      // (nothing moved in the urn).
      <SpineColumn icon="delegate" iconDirection="up" spine="dotted" isFirst={isFirst} isLast={!!isLast} />
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
        <MakerDAOEventHeader
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
      detail={<MakerDAOEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />}
      detailLabel="Vault state"
      explainer={<MakerDAOEventExplainer ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} skipLead />}
      explainerLabel="Plain English"
      explainerTeaser={makerdaoExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={makerdaoLearnMoreContent(ctx)} />}
      persistKey={`makerdao:${event.id}`}
    />
  );
}
