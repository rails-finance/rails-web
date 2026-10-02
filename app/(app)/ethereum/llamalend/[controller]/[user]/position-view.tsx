"use client";

// LlamaLend position detail — reference depth, chain-state-first, the
// 3-section anatomy (card → economics → timeline). The route is TWO segments
// because that is literally the protocol's grain: (controller, user) — each
// controller is an ISOLATED market (one collateral, one borrowed token), so
// one page per user would assert a single health across markets that share
// nothing. /llamalend/[user] alone 404s deliberately — no page exists for it.
//
// Every value is chain-direct or chain-derived: position state + timeline
// replayed from the captured Controller events (the emitted UserState
// absolutes — a lag, never a running sum), and THE DISTINCTIVE SURFACE — the
// live soft-liquidation read — from /api/chain/llamalend/position: ONE
// multicall of user_state (the converted amount lives in NO event) +
// read_user_tick_numbers + get_sum_xy (the two-contract cross-check) + A +
// get_base_price + price_oracle, with the band edges from the exact integer
// p_oracle_up port. The first paint (card + flows + timeline from the index)
// never waits on RPC round-trips; the risk surfaces stream in when the read
// lands, and a chainStale response simply leaves them unrendered. The card's
// state legs upgrade from the listing snapshot to the live head read when it
// lands.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DRAINED_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLlamalendEvent } from "@/lib/shared/types/event-shape";
import { fetchLlamalendPositions } from "@/lib/api/fetch-llamalend-positions";
import type { LlamalendPositionSummary } from "@/lib/sources/api/llamalend-positions";
import { fetchLlamalendTimeline } from "@/lib/api/fetch-llamalend-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchLlamalendChainPosition, type LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LLAMALEND_LIQUIDATION_RUNS } from "@/lib/llamalend/timeline-runs";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { LlamalendEventCard } from "@/components/protocol/llamalend/llamalend-event-card";
import {
  LlamalendPositionCard,
  viewFromSummary,
  viewFromChain,
  type LlamalendPositionView,
} from "@/components/protocol/llamalend/llamalend-position-card";
import { LlamalendPositionExplanation } from "@/components/protocol/llamalend/llamalend-position-explanation";
import {
  LlamalendConvertedDetail,
  LlamalendRiskDetail,
  LlamalendRiskHeadline,
  llamalendHasRisk,
} from "@/components/protocol/llamalend/llamalend-risk-slot";
import {
  llamalendLifetimeWithOpening,
  llamalendLostToSoftLiq,
  llamalendSoldInBands,
  replayLlamalendLifetime,
} from "@/lib/llamalend/economics";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { LlamalendFlowsNote, llamalendFlowsContent } from "@/components/protocol/llamalend/llamalend-flows-note";
import { useLlamalendFlows } from "@/hooks/useLlamalendFlows";
import {
  llamalendLoanMarks,
  llamalendLoans,
  llamalendNextRowMap,
  llamalendPreviousStatedMap,
} from "@/lib/llamalend/event-figures";
import { LlamalendLoansLine, LlamalendOwnerOutcomeLine } from "@/components/protocol/llamalend/llamalend-loans-line";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const LlamalendExportMenu = dynamic(
  () => import("@/components/protocol/llamalend/llamalend-export-menu").then((m) => m.LlamalendExportMenu),
  { ssr: false },
);

interface LlamalendPositionViewProps {
  /** The market's own Controller, normalised by the server route — anything
   *  that is not an address answered 404 before this component existed. */
  controller: string;
  /** The borrower, same. */
  user: string;
  initialPosition: LlamalendPositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a borrower with no captured events in this market — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

/** The whole-history flows: merged with the opening balance on a windowed
 *  page, replayed otherwise; undefined while the whole is not known. */
function precomputedLifetimeFor(
  view: LlamalendPositionView,
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null,
  known: boolean,
) {
  if (!known) return undefined;
  if (opening)
    return llamalendLifetimeWithOpening(events, opening, {
      collateral: view.collateralDecimals,
      borrowed: view.borrowedDecimals,
    });
  return replayLlamalendLifetime(events);
}

export default function LlamalendPositionView({
  controller,
  user,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: LlamalendPositionViewProps) {
  // Keyed on the timeline, not the row: a pair this Controller has never seen
  // is a real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<LlamalendPositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — the
  // overwhelming majority — `cutoffBlock` comes back null, no second request
  // is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<LlamalendChainResponse | null>(null);
  // Whether the live read has answered (or failed): the Lifetime flows panel
  // waits for it, since today's figures and price are its.
  const [chainSettled, setChainSettled] = useState(false);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !controller || !user) return;
    (async () => {
      setLoading(true);
      try {
        const [pData, tData] = await Promise.all([
          fetchLlamalendPositions({ controller, user, limit: 1 }),
          fetchLlamalendTimeline(controller, user, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } catch (err) {
        // A down index leaves the page in its explicit not-found state; the
        // chain lane below is independent and still reads.
        console.error("llamalend detail index fetch failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [controller, user, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's
  // arithmetic as a lifetime. A failure is a stated failure for the same
  // reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — only a server-side
    // failure leaves it null with a cutoff block set, which is exactly the
    // case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/llamalend/timeline/summary",
      params: { controller, user },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, user, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // The live per-position read — THE soft-liquidation surface. Off the
  // critical path; a failure returns chainStale and the risk surfaces simply
  // stay unrendered.
  useEffect(() => {
    if (!controller || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLlamalendChainPosition({ controller, user });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
      if (!cancelled) setChainSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [controller, user]);

  // Upgrade the card's state legs to the live user_state read when it landed —
  // the same slots at one head, converted amount included. When the INDEX has
  // no row (backend down / not yet caught up) but the chain read shows a live
  // loan, the card renders from the chain alone — chain-state-first, with
  // empty history metadata rather than a blank page.
  const liveView = useMemo<LlamalendPositionView | null>(() => {
    if (!view && chain && chain.hasLoan) return viewFromChain(chain);
    if (!view || !chain || view.status !== "open" || !chain.hasLoan) return view;
    return {
      ...view,
      collateral: chain.collateral ?? view.collateral,
      collateralRaw: chain.collateralRaw ?? view.collateralRaw,
      debt: chain.debt ?? view.debt,
      debtRaw: chain.debtRaw ?? view.debtRaw,
      converted: chain.converted,
      convertedRaw: chain.convertedRaw,
      inSoftLiq: chain.inSoftLiq,
      healthFull: chain.healthFull,
      healthFullRaw: chain.healthFullRaw,
      liquidatable: chain.healthFull != null ? chain.healthFull < 0 : null,
      convertedCrossCheckExact: chain.convertedCrossCheckExact,
      priceOracle: chain.priceOracle ?? view.priceOracle,
      stateBasis: "chain",
      collateralUsd:
        chain.borrowedIsCrvusd && chain.priceOracle != null && chain.collateral != null
          ? chain.collateral * chain.priceOracle
          : view.collateralUsd,
      debtUsd: chain.borrowedIsCrvusd && chain.debt != null ? chain.debt : view.debtUsd,
    };
  }, [view, chain]);

  const llamalendEvents = useMemo(() => events.filter(isLlamalendEvent), [events]);
  // The card's transaction count, raised to the distinct transactions the
  // whole history holds: the index counts the borrower's own, and a
  // liquidation is someone else's.
  const cardView = useMemo<LlamalendPositionView | null>(() => {
    if (!liveView || cutoffBlock != null) return liveView;
    const txs = new Set(llamalendEvents.map((e) => e.txHash).filter(Boolean)).size;
    return txs > liveView.txCount ? { ...liveView, txCount: txs } : liveView;
  }, [liveView, llamalendEvents, cutoffBlock]);
  const previousStated = useMemo(() => llamalendPreviousStatedMap(llamalendEvents), [llamalendEvents]);
  const nextRows = useMemo(() => llamalendNextRowMap(llamalendEvents), [llamalendEvents]);
  // The loans this page holds (a closed loan and a later one share the key);
  // read only over the whole history.
  const loans = useMemo(
    () => (cutoffBlock == null ? llamalendLoans(llamalendEvents) : []),
    [llamalendEvents, cutoffBlock],
  );
  // Which row opens or closes each loan; read only over the whole history.
  const loanMarks = useMemo(
    () => (cutoffBlock == null ? llamalendLoanMarks(llamalendEvents) : null),
    [llamalendEvents, cutoffBlock],
  );

  const tl = useTimelineEvents(llamalendEvents, {
    storageKey: `llamalend-${controller}-${user}`,
    protocolKey: "llamalend",
    window: historyWindow,
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: false,
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's: the card's soft-liquidation figures state nothing until
  // the opening balance is known.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lost = useMemo(() => {
    if (!liveView) return null;
    const lifetime = precomputedLifetimeFor(liveView, llamalendEvents, opening, lifetimeKnown);
    return llamalendLostToSoftLiq(liveView, lifetime);
  }, [liveView, llamalendEvents, opening, lifetimeKnown]);
  const soldInBands = useMemo(() => {
    if (!liveView) return null;
    const lifetime = precomputedLifetimeFor(liveView, llamalendEvents, opening, lifetimeKnown);
    return llamalendSoldInBands(liveView, lifetime);
  }, [liveView, llamalendEvents, opening, lifetimeKnown]);
  // A liquidated loan's outcome for the owner, on a page holding one loan.
  const ownerOutcome = useMemo(() => {
    if (!liveView || liveView.status !== "liquidated" || loans.length !== 1) return null;
    const lifetime = precomputedLifetimeFor(liveView, llamalendEvents, opening, lifetimeKnown);
    if (!lifetime) return null;
    const kept = lifetime.borrowed - lifetime.repaid;
    const lost = lifetime.collateralAdded - lifetime.collateralWithdrawn;
    if (kept <= 0 || lost <= 0) return null;
    return { kept, lost, repaidAny: lifetime.repaid > 0, withdrewAny: lifetime.collateralWithdrawn > 0 };
  }, [liveView, llamalendEvents, opening, lifetimeKnown, loans]);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchLlamalendTimeline(controller, user);
    const served = (res.events ?? []).filter(isLlamalendEvent);
    // The proxy's page cap, passed through rather than absorbed: a download
    // that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.totalEvents ?? served.length) - served.length, 0),
    };
  }, [controller, user]);

  // The Lifetime flows panel replays the position's whole history
  // (lib/llamalend/flows.ts): the page's rows where they are all of it, else
  // the flat history read once (the CSV's read); a read short of the whole
  // history is a failed read.
  const flowLive = useMemo(
    () =>
      chain && !chain.chainStale
        ? {
            price: chain.priceOracle,
            coll: chain.hasLoan ? chain.collateral : 0,
            debt: chain.hasLoan ? chain.debt : 0,
            converted: chain.hasLoan ? chain.converted : 0,
          }
        : null,
    [chain],
  );
  const flows = useLlamalendFlows({
    controller,
    user,
    wholeEvents: historyWindow.state === "whole" ? llamalendEvents : null,
    fetchAll: fetchAllHistory,
    collSymbol: liveView?.collateralSymbol ?? null,
    debtSymbol: liveView?.borrowedSymbol ?? null,
    open: liveView?.status === "open",
    live: flowLive,
    liveSettled: chainSettled,
  });
  const flowFocus = flows.read !== "failed" ? flows.focus : null;

  // The top row's price dropdown: the AMM's own oracle price of the
  // collateral — only where the borrowed token is crvUSD (~$1); a WETH-
  // denominated price is not a dollar and never renders as one.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!chain || chain.chainStale || !chain.borrowedIsCrvusd) return [];
    if (typeof chain.priceOracle !== "number" || chain.priceOracle <= 0) return [];
    return [{ symbol: chain.collateralSymbol, address: "", price: chain.priceOracle }];
  }, [chain]);

  if (!controller || !user) {
    return (
      <div className="py-8">
        <p className="text-sm text-rb-500">
          Not a LlamaLend position — the route is /llamalend/&lt;controller&gt;/&lt;user&gt;, two addresses (each
          controller is an isolated market).
        </p>
      </div>
    );
  }

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="llamalend"
          wallet={user}
          owner={{ wallet: user }}
          assets={stripAssets}
          closed={liveView != null && liveView.status !== "open"}
        >
          {liveView && (
            <LlamalendExportMenu
              controller={controller}
              user={user}
              view={liveView}
              chain={chain}
              events={llamalendEvents}
              csvFilename={`llamalend-${controller.slice(0, 10)}-${user.slice(0, 10)}-activity.csv`}
              fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
              history={markdownHistoryScope(historyWindow, llamalendEvents)}
              scopeNote={exportScopeNote(historyWindow, llamalendEvents, "this position's whole history")}
            />
          )}
        </DetailTopRow>

        {loading ? (
          <DetailBodySkeleton />
        ) : (
          <>
            {cardView && liveView && (
              <LlamalendPositionCard
                v={cardView}
                bands={chain?.hasLoan ? chain.bands : null}
                receipts
                viewHref={tl.viewHref}
                // Closed by default, remembered per viewer and position (ui-jobs
                // 209). The health from the live read is the third headline;
                // the soft-liquidation multiple, what the AMM sold and the band
                // axis sit under it in the opened layer, the converted amount
                // under Collateral, all inside the card's receipts scope.
                // Mounted only while the loan is live and the read landed.
                disclosureKey={`llamalend:${controller.toLowerCase()}:${user.toLowerCase()}`}
                risk={
                  chain && liveView.status === "open" && llamalendHasRisk(chain)
                    ? {
                        value: <LlamalendRiskHeadline chain={chain} />,
                        detail: <LlamalendRiskDetail chain={chain} lost={lost} sold={soldInBands} />,
                      }
                    : undefined
                }
                collateralDetail={
                  chain && liveView.status === "open" ? <LlamalendConvertedDetail chain={chain} /> : undefined
                }
                // Passed whatever the status and before the chain read lands:
                // the pane, and the copy-view link at its foot, mount with the
                // card. A closed account, a read still pending or a read with no
                // loan narrates nothing.
                bodyExtra={
                  loans.length > 1 ? (
                    <LlamalendLoansLine loans={loans} />
                  ) : ownerOutcome ? (
                    <LlamalendOwnerOutcomeLine
                      {...ownerOutcome}
                      borrowedSymbol={liveView.borrowedSymbol}
                      collateralSymbol={liveView.collateralSymbol}
                    />
                  ) : undefined
                }
                explanation={
                  <LlamalendPositionExplanation
                    chain={liveView.status === "open" ? chain : null}
                    closed={
                      liveView.status !== "open" && historyWindow.state === "whole"
                        ? { view: liveView, events: llamalendEvents }
                        : null
                    }
                    lost={lost}
                    sold={soldInBands}
                    factory={liveView.factory ?? null}
                    liquidationCount={liveView.liquidationCount}
                    eventCount={liveView.eventCount}
                  />
                }
              />
            )}
            {/* Lifetime flows: the bars and the line over the position's replay
          (lib/llamalend/flows.ts), in the market's borrowed token, in place of
          the tower (TO-DO-ui-jobs 206). */}
            {liveView && (
              <LifetimeFlowsPanel
                scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                read={flows.read}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <LlamalendFlowsNote
                      facts={flows.facts}
                      collSymbol={liveView.collateralSymbol}
                      debtSymbol={liveView.borrowedSymbol}
                    />
                  </div>
                }
                learnMore={llamalendFlowsContent()}
              />
            )}
            <ChainTruthTimeline
              csvExportCeiling={DRAINED_ROW_CEILING}
              // Matches `LlamalendEventCard`'s own `persistKey={`llamalend:${event.id}`}`
              // — lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount.
              persistKeyPrefix="llamalend"
              closed={liveView ? liveView.status !== "open" : undefined}
              tl={tl}
              runs={LLAMALEND_LIQUIDATION_RUNS}
              toolbarLeading={
                liveView ? (
                  <TimelineActivityHeader
                    events={llamalendEvents}
                    closed={liveView.status !== "open"}
                    // When the position actually opened, not when the window
                    // does.
                    firstAt={opening?.firstTimestamp}
                    tenurePending={!lifetimeFiguresKnown(historyWindow)}
                    labelLastActivity
                    reopenedAt={
                      loans.length > 1 && loans[loans.length - 1].closedAt == null
                        ? loans[loans.length - 1].openedAt
                        : null
                    }
                  />
                ) : undefined
              }
              renderCard={(event, meta) =>
                isLlamalendEvent(event) ? (
                  <LlamalendEventCard
                    event={event}
                    eventNumber={meta.eventNumber}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    previousStated={previousStated.get(event.id) ?? null}
                    loanMark={loanMarks?.get(event.id) ?? null}
                    marketDiscount={chain?.marketLiquidationDiscount ?? null}
                    next={nextRows.get(event.id) ?? null}
                  />
                ) : null
              }
            />
            {/* Ambient oracle-price pill, fixed bottom-right. */}
            <ProvInspectorLayer />
          </>
        )}
      </div>
    </FlowFocusContext.Provider>
  );
}
