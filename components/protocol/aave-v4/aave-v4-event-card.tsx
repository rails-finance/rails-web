"use client";

// Composer: wires the Aave V4 header / detail / explainer into the universal
// EventCard shell. Mirrors LiquityEventCard's pattern.
//
// SpineColumn shares the universal event-card API, so the icon-column logic is
// identical across protocols.

import { EventCard } from "@/components/shared/event-card";
import { EventCellGrid } from "@/components/shared/event-cells";
import { eventGas } from "@/components/shared/event-price-row";
import { EventLedgerContext, ROW_CELLS } from "@/components/shared/event-ledger-context";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { AaveV4EventHeader, type AaveV4TxGroup } from "./aave-v4-event-header";
import { aaveV4Label } from "@/lib/aave-v4/event-label";
import { useAaveV4Cells } from "./aave-v4-event-detail";
import { AaveV4EventExplainer, aaveV4LearnMoreContent } from "./aave-v4-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { aaveV4ExplainerTeaser, coordsFor, type AaveV4Event } from "@/lib/aave-v4/explainer-clauses";

export interface AaveV4EventCardProps {
  event: AaveV4Event;
  isLast?: boolean;
  /** Position + total within shared tx_hash. Drives the "X OF Y" chip. */
  txGroup?: AaveV4TxGroup;
  /** Same-transaction sibling events (chronological asc, self included) — the
   *  combined-act / cross-reference seam. Defaults to just this event. */
  siblings?: AaveV4Event[];
  /** 1-based chronological position within the spoke's event list. */
  eventNumber?: number;
  /** The borrow rate (decimal) the previous event on this spoke recorded for
   *  this event's asset. */
  previousRate?: number;
  /** For a repay that clears its debt: the interest that debt accrued over its life. */
  debtLifeInterest?: number;
}

export function AaveV4EventCard({
  event,
  isLast,
  txGroup,
  siblings,
  eventNumber,
  previousRate,
  debtLifeInterest,
}: AaveV4EventCardProps) {
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

  const iconSlot = isLiquidation ? (
    <SpineColumn icon="warning" warningTone="critical" isLast={!!isLast} />
  ) : isCollateralToggle ? (
    // The toggle's own check/cross badge is the event's MEANING, so it keeps
    // the icon corner even when a third party flipped it — the dotted spine and
    // the header's "by …" chip carry that fact instead.
    <SpineColumn
      tokens={[{ symbol: sym, address: symAddress, badge: ctx.enabled ? "check" : "cross" }]}
      externalParty={!!extBy}
      isLast={!!isLast}
    />
  ) : alsoToggled ? (
    <SpineColumn
      tokens={[{ symbol: sym, address: symAddress, badge: "check", direction: "right", value: amt }]}
      externalParty={!!extBy}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn
      tokens={[{ symbol: sym, address: symAddress, direction: isIncoming ? "left" : "right", value: amt }]}
      externalParty={!!extBy}
      isLast={!!isLast}
    />
  );

  // T2: the snapshot as cells (no flows panel: the cells stand as rows), the
  // prices at this block and the gas in the price row (ui-jobs 309).
  const { cells, prices } = useAaveV4Cells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    previousRate,
  });

  return (
    <EventLedgerContext.Provider value={ROW_CELLS}>
      <EventCard
        avatar={null}
        by={extBy ?? undefined}
        caption={aaveV4Label(ctx)}
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
        detail={<EventCellGrid cells={cells} />}
        explainer={
          <AaveV4EventExplainer
            ctx={ctx}
            event={event}
            siblings={siblings ?? [event]}
            previousRate={previousRate}
            debtLifeInterest={debtLifeInterest}
            skipLead
          />
        }
        price={{ gas: eventGas(event.gas), prices }}
        explainerTeaser={aaveV4ExplainerTeaser(ctx, coordsFor(event), siblings ?? [event], event)}
        txHash={event.txHash}
        learnMore={<LearnMore inline content={aaveV4LearnMoreContent(ctx)} />}
        persistKey={`aave-v4:${event.id}`}
      />
    </EventLedgerContext.Provider>
  );
}
