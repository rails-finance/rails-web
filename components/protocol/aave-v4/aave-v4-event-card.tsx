"use client";

// Composer: wires the Aave V4 header / detail / explainer into the universal
// EventCard shell. Mirrors LiquityEventCard's pattern. Bars slot is rendered
// via EventCard's `headerBars` so the change-bar / balance-bar pair sits
// inside the header panel directly under the action row.
//
// SpineColumn shares the universal event-card API, so the icon-column logic is
// identical across protocols.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { AaveV4EventHeader, aaveV4AmountProv, type AaveV4TxGroup } from "./aave-v4-event-header";
import { AaveV4EventDetail } from "./aave-v4-event-detail";
import { AaveV4EventExplainer, aaveV4LearnMoreContent } from "./aave-v4-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { AaveV4BarsSlot } from "./aave-v4-bars-slot";
import { aaveV4ExplainerTeaser, coordsFor, type AaveV4Event } from "@/lib/aave-v4/explainer-clauses";

export interface AaveV4EventCardProps {
  event: AaveV4Event;
  isFirst?: boolean;
  isLast?: boolean;
  /** Position + total within shared tx_hash. Drives the "X OF Y" chip. */
  txGroup?: AaveV4TxGroup;
  /** Same-transaction sibling events (chronological asc, self included) — the
   *  combined-act / cross-reference seam. Defaults to just this event. */
  siblings?: AaveV4Event[];
  /** 1-based chronological position within the spoke's event list. */
  eventNumber?: number;
}

export function AaveV4EventCard({ event, isFirst, isLast, txGroup, siblings, eventNumber }: AaveV4EventCardProps) {
  const ctx = event.context.data;
  const isLiquidation = ctx.eventType === "liquidation";
  const isCollateralToggle = ctx.eventType === "collateral_toggle";
  const isIncoming = ctx.eventType === "withdraw" || ctx.eventType === "borrow";
  const alsoToggled = ctx.alsoToggledCollateral;
  // Third-party action: the position owner neither signed the tx nor made the
  // spoke call. Judged against ctx.owner (the row's own `user` param), NOT
  // event.wallet — the timeline includes rows where the queried wallet was
  // the caller on someone else's position. Such events ride the dotted spine
  // and badge the token icon pink; the header names the actor in a "by …"
  // chip. The flow itself still renders — WHO acted annotates WHAT moved.
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, ctx.owner ?? event.wallet);

  const amt = ctx.amount ? parseFloat(ctx.amount) : undefined;
  const sym = ctx.reserveSymbol ?? "?";
  // The reserve's own contract, read off the event's flows, so the icon chip
  // has an address to ask a CDN about instead of a symbol to look up in the
  // house table. V4's spokes are a curated set whose symbols that table names,
  // so nothing on this explorer is currently drawing a letter — the point is
  // that the mark no longer depends on the table keeping pace with the spokes.
  // A collateral toggle moves no tokens and so carries no flows: it resolves to
  // undefined and falls back to the symbol lookup exactly as before.
  const symAddress = soleFlowAddress(event.flows, ctx.reserveSymbol);

  // The flanking amount echoes the header's amount receipt, so a click on it in
  // the provenance inspector traces to the same figure the header registers.
  // Both ends call ONE builder (aaveV4AmountProv) because the echo matches on
  // `receiptLabel|value|symbol` byte-for-byte and fails SILENTLY on a mismatch —
  // these flanks were bare text until now, untraceable on every row, not just
  // third-party ones. Only attach it when there is an amount to trace: the
  // header registers nothing at zero, so an echo there could only ever miss.
  const amountProv =
    amt != null && amt > 0
      ? aaveV4AmountProv(ctx, {
          spokeName: ctx.spokeName,
          spokeAddress: ctx.spokeAddress,
          txHash: event.txHash,
          blockNumber: event.blockNumber,
        })
      : undefined;

  const iconSlot = isLiquidation ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel="Liquidation"
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : isCollateralToggle ? (
    // The toggle's own check/cross badge is the event's MEANING, so it keeps
    // the icon corner even when a third party flipped it — the dotted spine and
    // the header's "by …" chip carry that fact instead.
    <SpineColumn
      tokens={[{ symbol: sym, address: symAddress, badge: ctx.enabled ? "check" : "cross" }]}
      externalParty={!!extBy}
      spine={extBy ? "dotted" : "solid"}
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : alsoToggled ? (
    <SpineColumn
      tokens={[{ symbol: sym, address: symAddress, badge: "check", direction: "right", value: amt, prov: amountProv }]}
      externalParty={!!extBy}
      spine={extBy ? "dotted" : "solid"}
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn
      tokens={[
        { symbol: sym, address: symAddress, direction: isIncoming ? "left" : "right", value: amt, prov: amountProv },
      ]}
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
        <AaveV4EventHeader
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          txGroup={txGroup}
          eventNumber={eventNumber}
          externalBy={extBy ?? undefined}
        />
      }
      headerBars={<AaveV4BarsSlot eventId={event.id} />}
      detail={
        <AaveV4EventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} wallet={event.wallet} />
      }
      detailLabel="Aave V4 Details"
      explainer={
        <AaveV4EventExplainer ctx={ctx} event={event} siblings={siblings ?? [event]} gas={event.gas} skipLead />
      }
      explainerLabel="Plain English"
      explainerTeaser={aaveV4ExplainerTeaser(ctx, coordsFor(event), siblings ?? [event], event)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={aaveV4LearnMoreContent(ctx)} />}
      persistKey={`aave-v4:${event.id}`}
    />
  );
}
