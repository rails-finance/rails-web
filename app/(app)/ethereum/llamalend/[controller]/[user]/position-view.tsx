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
// p_oracle_up port. The first paint (card + tower + timeline from the index)
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
import { LlamalendRiskSlot } from "@/components/protocol/llamalend/llamalend-risk-slot";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeLlamalendEconomics, llamalendLifetimeWithOpening } from "@/lib/llamalend/economics";
import { llamalendEconomicsExplanation, llamalendEconomicsContent } from "@/lib/llamalend/economics-explanation";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { PriceStrip, type PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

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

  const tl = useTimelineEvents(llamalendEvents, {
    storageKey: `llamalend-${controller}-${user}`,
    protocolKey: "llamalend",
    window: historyWindow,
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? llamalendEvents : undefined;
  const precomputedLifetime = useMemo(
    () =>
      liveView
        ? llamalendLifetimeWithOpening(llamalendEvents, opening, {
            collateral: liveView.collateralDecimals,
            borrowed: liveView.borrowedDecimals,
          })
        : undefined,
    [llamalendEvents, opening, liveView],
  );

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

  // Ambient price pill (bottom-right): the AMM's own oracle price of the
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
    <div className="py-8 space-y-6">
      <DetailTopRow session="llamalend" wallet={user}>
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
          {liveView && (
            <LlamalendPositionCard
              v={liveView}
              receipts
              viewHref={tl.viewHref}
              // ⇒ THE DISTINCTIVE SURFACE rides the heading-button row, the
              // same slot a Trove's risk strip uses: health, the converted
              // amount and the band meter — visible without a click, and inside
              // the card's receipts scope, which is what makes those figures
              // inspectable at all. It was a full-width body block while the
              // band axis was section-sized; at the shared runway's compact
              // size it belongs on the row with every sibling's. Mounted only
              // while the loan is live and the chain read landed. The
              // Explanation heading-button narrates the same figures.
              rowExtra={
                chain && chain.hasLoan && liveView.status === "open" ? <LlamalendRiskSlot chain={chain} /> : undefined
              }
              // Passed whatever the status and before the chain read lands:
              // the pane, and the copy-view link at its foot, mount with the
              // card. A closed account, a read still pending or a read with no
              // loan narrates nothing.
              explanation={
                <LlamalendPositionExplanation
                  chain={liveView.status === "open" ? chain : null}
                  liquidationCount={liveView.liquidationCount}
                  eventCount={liveView.eventCount}
                />
              }
            />
          )}
          {liveView &&
            (() => {
              const towerData = computeLlamalendEconomics(liveView, lifetimeEvents, precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={llamalendEconomicsExplanation(towerData)}
                  learnMore={llamalendEconomicsContent()}
                />
              );
            })()}
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
                />
              ) : null
            }
          />
          {/* Ambient oracle-price pill, fixed bottom-right. */}
          <PriceStrip assets={stripAssets} leading={<ProvInspectorToggle />} />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
