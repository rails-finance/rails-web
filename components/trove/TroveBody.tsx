"use client";

// The Liquity V2 Trove page's body: the top row, the position card, the
// Lifetime flows panel and the timeline, in the page's order and wrappers. The
// Trove page (app/(app)/ethereum/liquity-v2/trove/…/trove-view.tsx) and the home
// page's live example (components/home/live-example-frame.tsx) both render it,
// so the example draws what the page draws (rails-ops TO-DO-ui-jobs 335). What
// differs is data: the page reads its events, the head and the daily prices in
// the browser; the example's arrive with the home page, and it draws no top
// row, no export shapes and a still timeline toolbar.

import { useCallback, useMemo, type ReactNode } from "react";
import type { TroveSummary } from "@/types/api/trove";
import type { TroveStateData } from "@/types/api/troveState";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCollSurplusClaimEvent, isLiquityEvent } from "@/lib/shared/types/event-shape";
import type { DayObs } from "@/lib/shared/price-series";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";
import type { TimelineBoundary } from "@/lib/shared/timeline-boundary";
import type { PositionCardExports } from "@/components/shared/position-card";
import type { LiquityTroveSurplus } from "@/components/protocol/liquity-family/types";
import { troveWords } from "@/lib/liquity/event-templates";
import { TroveSummaryStack } from "@/components/trove/TroveSummaryStack";
import { LifetimeFlowsPanel, type FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import {
  liquityFlowTimeline,
  liquityFocusEvents,
  unpricedEvents,
  type LiquityFlowEvent,
} from "@/lib/shared/liquity-flows";
import {
  FlowFocusContext,
  useFlowFocusRoot,
  useFlowFocusValue,
  type FlowFocusValue,
} from "@/components/shared/flow-focus-context";
import { troveLives } from "@/lib/shared/liquity-flows-explanation";
import { computeLiquityEconomics } from "@/lib/liquity/economics";
import { LiquityFlowsExplanation } from "@/lib/liquity/economics-explanation";
import { liquityLifetimeFlowsContent } from "@/lib/shared/learn-more-content";
import { CollSurplusClaimCard } from "@/components/protocol/liquity-family/coll-surplus-claim-card";
import { CollSurplusCtx, type CollSurplusState } from "@/components/protocol/liquity-family/coll-surplus-context";
import { LiquityEventCard } from "@/components/protocol/liquity/liquity-event-card";
import { LiquityTroveMetaContext, type LiquityTroveMeta } from "@/components/protocol/liquity/event-prose-render";
import { UsersGlyph } from "@/components/shared/rate-pill";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LIQUITY_TIMELINE_RUNS } from "@/lib/liquity/timeline-runs";
import { PreviousEventContext } from "@/components/protocol/liquity/delegate-run-sheet";
import type { SpineKey } from "@/components/shared/mobile-spine";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";

/** The phone spine view's key row. */
const LIQUITY_SPINE_KEY: SpineKey = {
  keyLeft: troveWords("spine_to_wallet"),
  keyRight: troveWords("spine_into_trove"),
};

/** The Lifetime flows replay and the day focus the panel and the timeline
 *  share (components/shared/flow-focus-context.tsx). The timeline waits for
 *  the clock (`now`, set on mount) and the daily prices' read. */
export function useTroveFlows({
  flowEvents,
  collSymbol,
  debtSymbol,
  surplusClaimed,
  now,
  daily,
  open,
  price,
  liveState,
}: {
  flowEvents: LiquityFlowEvent[];
  collSymbol: string;
  debtSymbol: string;
  surplusClaimed: boolean;
  now: number | null;
  daily: { obs: DayObs[] | null; settled: boolean };
  open: boolean;
  price: number | undefined;
  liveState: TroveStateData | undefined;
}): { flowTimeline: FlowTimeline | null; flowFocus: FlowFocusValue } {
  const flowTimeline = useMemo(
    () =>
      now == null || !daily.settled
        ? null
        : liquityFlowTimeline(flowEvents, {
            collSymbol,
            debtSymbol,
            surplusClaimed,
            now,
            dailyColl: daily.obs,
            priceView: { collateralType: collSymbol },
            live: open
              ? {
                  price: price ?? null,
                  ...(liveState
                    ? {
                        coll: liveState.collateral.entire,
                        debt: liveState.debt.entire,
                        redistColl: liveState.collateral.redistGain,
                        redistDebt: liveState.debt.redistGain,
                        batchFee: liveState.rates.accruedBatchManagementFee,
                      }
                    : {}),
                }
              : null,
          }),
    [flowEvents, collSymbol, debtSymbol, surplusClaimed, now, open, price, liveState, daily.settled, daily.obs],
  );
  // The panel and the timeline are tied by the day: "Show timeline to {date}",
  // each day's mark, and each card's sum as of its event, read from the same
  // replay.
  const focusEvents = useMemo(
    () => liquityFocusEvents(flowEvents, collSymbol, debtSymbol),
    [flowEvents, collSymbol, debtSymbol],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(focusEvents), flowTimeline);
  return { flowTimeline, flowFocus };
}

export interface TroveBodyProps {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  debtInFront: number | null;
  trovesAhead: number | null;
  queueDebtTotal?: number | null;
  debtInFrontLoading: boolean;
  surplus?: LiquityTroveSurplus | null;
  /** The card ⋮'s export shapes; null draws the ⋮ with the identity rows and
   *  the provenance row only. */
  exports: PositionCardExports | null;
  /** The position card's foot line while the head read is in flight. */
  loadingMessage: string | null;
  /** The row above the card (DetailTopRow); none on the home page. */
  topRow?: ReactNode;
  /** The loaded Liquity events, oldest first: the timeline heading's tenure. */
  liquityEvents: BaseActivityEvent[];
  /** The page's useTimelineEvents result. */
  tl: TimelineEventsState;
  boundary: TimelineBoundary | null;
  /** The events the Lifetime flows Explanation replays, oldest first. */
  economicsEvents: Parameters<typeof computeLiquityEconomics>[0];
  /** The chronological list a card's previous event is read from (interest
   *  accrued, time since the last); the timeline's own sorted events unless
   *  given. */
  chronoEvents?: readonly BaseActivityEvent[];
  flowEvents: LiquityFlowEvent[];
  flowTimeline: FlowTimeline | null;
  flowFocus: FlowFocusValue;
  /** Where the flows read stands: "reading" until the clock and the daily
   *  prices are in hand. */
  flowsRead: FlowsRead;
  /** The clock the Explanation's debt owed today accrues to. */
  now: number;
  /** The daily prices were read. */
  daily: boolean;
  surplusState: CollSurplusState | null;
  troveMeta: LiquityTroveMeta;
  /** The home page's picture of the page: the Lifetime flows panel keeps no
   *  collapse state and the timeline toolbar draws no controls. */
  still?: boolean;
}

export function TroveBody({
  trove,
  liveState,
  prices,
  debtInFront,
  trovesAhead,
  queueDebtTotal,
  debtInFrontLoading,
  surplus,
  exports,
  loadingMessage,
  topRow,
  liquityEvents,
  tl,
  boundary,
  economicsEvents,
  chronoEvents,
  flowEvents,
  flowTimeline,
  flowFocus,
  flowsRead,
  now,
  daily,
  surplusState,
  troveMeta,
  still,
}: TroveBodyProps) {
  const currentPrice = prices?.[trove.collateralType.toLowerCase() as keyof OraclePricesData];
  const closed = trove.status !== "open";
  const surplusClaimed = surplus?.claimed != null;
  const lastEventTs = tl.sortedEvents.length > 0 ? tl.sortedEvents[tl.sortedEvents.length - 1].timestamp : null;

  // Delegate-set rate shares the "Interest rate" label with the owner's own
  // rate change; the people glyph marks it as the delegate's action in the
  // "Types of event" filter — a decoration `useTimelineEvents`'s generic
  // eventOptions builder has no slot for, so it's layered on here.
  const tlWithGlyph = {
    ...tl,
    eventOptions: tl.eventOptions.map((o) =>
      o.key === "setBatchManagerAnnualInterestRate" ? { ...o, suffix: <UsersGlyph /> } : o,
    ),
  };

  // Chronological-index lookup for `previousEvent` (interest accrued /
  // time-since-last deltas need the temporally-older event, regardless of
  // display order).
  const chrono = chronoEvents ?? tl.sortedEvents;
  const chronoIndex = useMemo(() => {
    const map = new Map<string, number>();
    chrono.forEach((e, i) => map.set(e.id, i));
    return map;
  }, [chrono]);
  // The same lookup for a delegate run's sheet, whose first member's accrual
  // runs from the event before the run.
  const previousOf = useCallback(
    (id: string) => {
      const idx = chronoIndex.get(id);
      return idx != null && idx > 0 ? chrono[idx - 1] : undefined;
    },
    [chronoIndex, chrono],
  );

  const economics = computeLiquityEconomics(economicsEvents, {
    currentPrice,
    collateralType: trove.collateralType,
    surplusClaimed,
    now,
  });

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        {topRow}
        <TroveSummaryStack
          trove={trove}
          liveState={liveState}
          prices={prices}
          debtInFront={debtInFront}
          trovesAhead={trovesAhead}
          queueDebtTotal={queueDebtTotal}
          debtInFrontLoading={debtInFrontLoading}
          viewHref={tl.viewHref}
          surplus={surplus}
          exports={exports}
          loadingStatus={{ message: loadingMessage, snapshotDate: lastEventTs ?? undefined }}
        />

        {/* Lifetime flows: the bars and the line over the Trove's own event
            replay (lib/shared/liquity-flows.ts). The runway that used to share
            this panel lives in the position card with the current-state
            stats. */}
        {economics && (
          <LifetimeFlowsPanel
            scrubber={flowTimeline ? <LifetimeFlowsScrubber timeline={flowTimeline} /> : null}
            read={flowsRead}
            explanation={
              <LiquityFlowsExplanation
                economics={economics.economics}
                meta={economics.economics._meta}
                now={now}
                currentPrice={currentPrice}
                surplusClaimed={surplusClaimed}
                unpriced={unpricedEvents(flowEvents)}
                lives={troveLives(flowEvents)}
                daily={daily}
              />
            }
            learnMore={liquityLifetimeFlowsContent({ isBatched: economics.economics._meta.isInBatch })}
            // Stated, not left to the route (ui-jobs 61): the home page belongs
            // to no protocol, so it has no collapse setting of its own to read
            // and must not borrow the Trove page's.
            {...(still ? { collapseKey: null } : {})}
          />
        )}

        <CollSurplusCtx.Provider value={surplusState}>
          <LiquityTroveMetaContext.Provider value={troveMeta}>
            <PreviousEventContext.Provider value={previousOf}>
              <ChainTruthTimeline
                // Matches `LiquityEventCard`'s own `persistKey={`liquity-v2:${event.id}`}`
                // — lets pinned mode (the per-event share route) force a landed
                // card's detail panel open on its first mount.
                persistKeyPrefix="liquity-v2"
                closed={closed}
                tl={tlWithGlyph}
                boundary={boundary}
                runs={LIQUITY_TIMELINE_RUNS}
                displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
                spineKey={LIQUITY_SPINE_KEY}
                emptyLabel={troveWords("history_empty")}
                still={still}
                toolbarLeading={
                  <TimelineActivityHeader events={liquityEvents} closed={closed} firstAt={trove.activity?.createdAt} />
                }
                renderCard={(event, meta) => {
                  if (isCollSurplusClaimEvent(event))
                    return (
                      <CollSurplusClaimCard
                        event={event}
                        isLast={meta.isLast}
                        eventNumber={meta.eventNumber}
                        persistPrefix="liquity-v2"
                      />
                    );
                  if (!isLiquityEvent(event)) return null;
                  const idx = chronoIndex.get(event.id);
                  const previousEvent = idx != null && idx > 0 ? chrono[idx - 1] : undefined;
                  return (
                    <LiquityEventCard
                      event={event}
                      addressDisplay="hidden"
                      isLast={meta.isLast}
                      previousEvent={previousEvent}
                      eventNumber={meta.eventNumber}
                      currentPrice={currentPrice}
                    />
                  );
                }}
              />
            </PreviousEventContext.Provider>
          </LiquityTroveMetaContext.Provider>
        </CollSurplusCtx.Provider>
      </div>
    </FlowFocusContext.Provider>
  );
}
