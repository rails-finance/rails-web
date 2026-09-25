"use client";

// The trove page's client half. Every interactive part of the view lives here —
// the timeline filters, the stored UI state, the export menu, the head reads —
// while the page above it is a server component that has already fetched the
// tail. Being a client component does not mean rendering on the client: React
// renders this whole subtree to HTML on the server too. What used to make the
// page blank to a non-JS reader was not the "use client" line, it was fetching
// the data in an effect. The data arrives as props now, so the first byte of the
// document already carries the position.
//
// Seeded or not, the mount path still works: when the server read came back
// empty (a backend blip) `initialTrove` is null and this component fetches the
// tail itself, exactly as it did before the route had a server half.

import { useState, useEffect, useMemo, useRef } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import { TroveSummary, TrovesResponse } from "@/types/api/trove";
import { TroveSummaryStack } from "@/components/trove/TroveSummaryStack";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeLiquityEconomics } from "@/lib/liquity/economics";
import { liquityEconomicsExplanation, liquityRedemptionOutcome } from "@/lib/liquity/economics-explanation";
import { RedeemerSummary } from "@/components/protocol/liquity/redeemer-summary";
import { liquityEconomicsContent } from "@/lib/shared/learn-more-content";
import { TroveStateData, TroveStateResponse } from "@/types/api/troveState";
import { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { useTroveUiState } from "@/hooks/useTroveUiState";
import { useDebtInFront } from "@/hooks/useDebtInFront";
import { useWalletContext } from "@/components/nav/wallet-context";

import { fetchTroveTimeline } from "@/lib/api/fetch-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import { LiquityEventCard } from "@/components/protocol/liquity/liquity-event-card";
import { UsersGlyph } from "@/components/protocol/liquity/liquity-event-header";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LIQUITY_TIMELINE_RUNS } from "@/lib/liquity/timeline-runs";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { priceGapNotesFor, livePriceGapNote } from "@/lib/shared/market-note";
import { TimelineActivityHeader, LIQUITY_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { boundaryStateFromOldestRow } from "@/lib/shared/timeline-boundary-state";
// Lazy chunk: the export dropdown plus its Markdown/CSV serializers are
// interaction-only, so they stay out of the page's initial bundle. A
// mount-time prefetch (below) has the chunk cached before the toolbar renders.
const TroveExportMenu = dynamic(() => import("@/components/trove/TroveExportMenu").then((m) => m.TroveExportMenu), {
  loading: () => null,
});
import { DetailBackButton, DetailTopRow } from "@/components/shared/detail-back-row";
import { LiquityTroveBarsProvider } from "@/lib/liquity/use-trove-bars";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export interface TroveViewProps {
  collateralType: string;
  troveId: string;
  /** The server read's tail. Null on an SSR miss — this component then fetches. */
  initialTrove: TroveSummary | null;
  initialEvents: BaseActivityEvent[] | null;
  /** The trove's whole event count when the served page stopped short of it
   *  (`pagination.hasMore`); null when the rows are the whole history. */
  initialTotalEvents: number | null;
  initialPrices: OraclePricesData | null;
  /** `?hide=op1,op2` decoded on the server — see the page for what it is for. */
  urlHidden: string[] | null;
}

export default function TroveView({
  collateralType,
  troveId,
  initialTrove,
  initialEvents,
  initialTotalEvents,
  initialPrices,
  urlHidden,
}: TroveViewProps) {
  const troveKey = `${collateralType}:${troveId}`;
  // The page keys this component on the trove, so a client-side navigation to a
  // different trove remounts it with the new server-read tail as initial state.
  const seeded = initialTrove != null;

  const [troveData, setTroveData] = useState<TroveSummary | null>(initialTrove);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The whole count when the fetch's `limit` cut the list — the boundary card
  // and the numbering offset (rails-ops decision 0019). Null = whole history.
  const [totalEvents, setTotalEvents] = useState<number | null>(initialTotalEvents);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const { summaryExplanationOpen, setSummaryExplanationOpen } = useTroveUiState(troveKey);

  // Live blockchain data and prices
  const [liveState, setLiveState] = useState<TroveStateData | undefined>(undefined);
  const [prices, setPrices] = useState<OraclePricesData | undefined>(initialPrices ?? undefined);

  // Closed / liquidated troves have ownership transferred to the zero address,
  // so `owner` reads as the burn address. Real wallet lives in `lastOwner`.
  // Plain `owner ?? lastOwner` doesn't help because `0x0000...` is truthy —
  // we need to actively reject the burn address before falling through.
  const effectiveOwner = (() => {
    const o = troveData?.owner?.toLowerCase();
    if (o && o !== "0x0000000000000000000000000000000000000000") return troveData?.owner;
    return troveData?.lastOwner;
  })();

  // Surface the trove owner in the header wallet pill — the WalletContext
  // hydrator only reads /address/* paths, so trove pages need to push the
  // owner explicitly, producing the "Liquity V2 + <owner>" header.
  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!effectiveOwner) return;
    const lower = effectiveOwner.toLowerCase();
    const ens = troveData?.ownerEns ?? null;
    setWallets([lower], { [lower]: ens });
  }, [effectiveOwner, troveData?.ownerEns, setWallets]);

  // Debt in front calculation
  const debtInFrontRate = liveState?.rates.annualInterestRate ?? troveData?.metrics.interestRate;
  const {
    debtInFront,
    trovesAhead,
    queueDebtTotal,
    loading: debtInFrontLoading,
  } = useDebtInFront(
    troveData?.status === "open" ? collateralType : undefined,
    troveData?.status === "open" ? debtInFrontRate : undefined,
    troveData?.status === "open" ? troveId : undefined,
  );
  // The chain trove-state read is the page's one remaining second wave. The
  // oracle price rides in with the server tail, so the economics tower, price
  // runway, and price-derived headline stats all paint complete in the first
  // document instead of popping in a frame later.
  const [enhancementLoading, setEnhancementLoading] = useState({
    blockchain: false,
  });

  // The live-note read: the branch's oracle price and the chain head, fetched
  // fresh (never the server-seeded `prices`, which is a settled-tail figure,
  // not a live one) so the note's receipt can state that both were read
  // "just now" — the two calls can still land a block apart, which the note
  // itself states. `null` until the read lands or fails; `liveOraclePending`
  // is the in-flight flag ChainTruthTimeline reserves the note's slot with.
  const [liveOracle, setLiveOracle] = useState<{ price: number; block: number; timestamp: number } | null>(null);
  const [liveOraclePending, setLiveOraclePending] = useState(true);

  // Mount. A seeded view already holds the tail and goes straight to the head
  // read; an unseeded one fetches the tail first. The ref keeps React's
  // development double-invoke from issuing the reads twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadLiveOracle();
    if (seeded) void loadEnhancements();
    else void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm the export-menu chunk while the data fetch is in flight, so the
  // toolbar paints whole when the loading gate clears (no button pop-in).
  useEffect(() => {
    void import("@/components/trove/TroveExportMenu");
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Reset second-wave chain state when switching source so a stale
      // rails-server reading never lingers under chain-sourced summary data.
      setLiveState(undefined);

      // The rails-server index is the sole serving path. Oracle price is shared
      // (already chain-rooted) and best-effort.
      const trovesQs = `troveId=${troveId}&collateralType=${collateralType}`;
      const trovesUrl = `/api/troves?${trovesQs}`;

      const [troveResponse, timelineResult, pricesResult] = await Promise.all([
        fetch(trovesUrl),
        fetchTroveTimeline({ collateralType, troveId, limit: TIMELINE_WINDOW_EVENTS }).catch((err) => {
          console.error("Failed to fetch trove timeline:", err);
          return null;
        }),
        fetch(`/api/oracle/liquity-v2`)
          .then((r) => (r.ok ? (r.json() as Promise<OraclePricesResponse>) : null))
          .catch((err) => {
            console.error("Failed to fetch oracle prices:", err);
            return null;
          }),
      ]);

      if (!troveResponse.ok) {
        throw new Error(`Failed to fetch trove: ${troveResponse.statusText}`);
      }

      const troveDataResp: TrovesResponse = await troveResponse.json();

      if (!troveDataResp.data || troveDataResp.data.length === 0) {
        setError("Trove not found");
        setLoading(false);
        return;
      }

      setTroveData(troveDataResp.data[0]);
      setEvents(timelineResult?.events ?? []);
      setTotalEvents(timelineResult?.pagination?.hasMore ? timelineResult.totalEvents : null);
      if (pricesResult?.success && pricesResult.data) {
        setPrices(pricesResult.data);
      }

      setLoading(false);
      loadEnhancements();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trove data");
      console.error("Error loading trove data:", err);
      setLoading(false);
    }
  };

  const loadEnhancements = async () => {
    // Second-wave live state, one lane — the api/chain source toggle this
    // comment used to describe is retired (rails-ops decision 0006). The
    // summary's replayed numbers lag to the last event, so this overlay
    // refreshes debt/coll/interest to the latest block and fills the USD/CR
    // the replay leaves at 0.
    setEnhancementLoading({ blockchain: true });

    try {
      // Live accrued state is inherently an RPC read. This frontend route is a
      // pure proxy to RAILS_API_URL, but what it proxies is a real chain read:
      // rails-server's /trove/state/ calls fetchTroveState →
      // publicClient.readContract(getLatestTroveData), behind an in-memory
      // cache (30s fresh, 60s stale-while-revalidate) — not a DB table, and
      // not the indexed backend. Liquity V2's chain lane lives server-side
      // rather than under app/api/chain/, which is easy to misread as absent.
      // It stays a client read rather than joining the server tail so that no
      // document waits on an RPC round trip.
      const stateUrl = `/api/trove/state/${collateralType}/${troveId}`;
      const res = await fetch(stateUrl);
      if (res.ok) {
        const stateResponse: TroveStateResponse = await res.json();
        if (stateResponse.success && stateResponse.data) {
          setLiveState(stateResponse.data);
        }
      } else {
        console.error("Failed to fetch blockchain state");
      }
    } catch (err) {
      console.error("Error parsing blockchain state:", err);
    }
    setEnhancementLoading({ blockchain: false });
  };

  const getEnhancementStatus = (): string | null => {
    return enhancementLoading.blockchain ? "Loading current state..." : null;
  };

  // The live note's own two reads: the branch's oracle price and the chain
  // head, fetched together and independently of the settled `prices` used
  // elsewhere on the page. Best-effort — a failed read simply leaves the live
  // note absent, the same fail-soft rule `/api/head` documents for itself.
  const loadLiveOracle = async () => {
    try {
      const [headRes, oracleRes] = await Promise.all([fetch(`/api/head`), fetch(`/api/oracle/liquity-v2`)]);
      const head = headRes.ok ? ((await headRes.json()) as { blockNumber: number; blockTimestamp: number }) : null;
      const oracleJson = oracleRes.ok ? ((await oracleRes.json()) as OraclePricesResponse) : null;
      const key = collateralType.toLowerCase() as keyof OraclePricesData;
      const price = oracleJson?.success ? oracleJson.data?.[key] : undefined;
      if (head && typeof price === "number" && head.blockNumber > 0) {
        setLiveOracle({ price, block: head.blockNumber, timestamp: head.blockTimestamp });
      }
    } catch (err) {
      console.error("Failed to fetch the live oracle read:", err);
    } finally {
      setLiveOraclePending(false);
    }
  };

  // Liquity-narrowed + chronologically exact. Sort primarily by
  // blockNumber/timestamp, then by log_index (parsed from the event id, which
  // is always `${txHash}_${logIndex}`) — essential when a single tx emits
  // multiple TroveUpdated logs at the same block: without it the within-tx
  // order is whatever the API returned (DESC), and LiquityTroveBarsProvider's
  // running-state walk would process the later log first and compute the
  // earlier event's delta as the wrong sign. useTimelineEvents() below
  // re-sorts by timestamp alone, but Array.prototype.sort is stable — pre-
  // ordering here means its resort preserves this log_index tie-break rather
  // than losing it.
  const liquityEvents = useMemo(() => {
    const logIndex = (e: BaseActivityEvent) => {
      const tail = e.id.split("_").pop();
      const n = Number(tail);
      return Number.isFinite(n) ? n : 0;
    };
    return events
      .filter(isLiquityEvent)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp || logIndex(a) - logIndex(b));
  }, [events]);

  const olderCount = totalEvents != null ? Math.max(0, totalEvents - liquityEvents.length) : 0;
  const tl = useTimelineEvents(liquityEvents, {
    storageKey: `liquity-v2-${troveKey}`,
    protocolKey: "liquity-v2-troves",
    initialHidden: urlHidden,
    olderCount,
  });
  // The boundary card for a `limit`-cut list: the count the route reported,
  // the oldest served row's block and its own before-state.
  const boundary = useMemo(() => {
    const oldest = tl.sortedEvents[0];
    if (olderCount === 0 || totalEvents == null || !oldest) return null;
    return boundaryFromLimit({
      total: totalEvents,
      listed: liquityEvents.length,
      cutBlock: oldest.blockNumber,
      cutAt: oldest.timestamp,
      state: boundaryStateFromOldestRow(oldest),
    });
  }, [olderCount, totalEvents, liquityEvents.length, tl.sortedEvents]);

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
  // display order) — built once over the hook's own sorted list.
  const sortedIndex = useMemo(() => {
    const map = new Map<string, number>();
    tl.sortedEvents.forEach((e, i) => map.set(e.id, i));
    return map;
  }, [tl.sortedEvents]);

  const lastEventTs = tl.sortedEvents.length > 0 ? tl.sortedEvents[tl.sortedEvents.length - 1].timestamp : null;

  // Market notes: the stretches between two of this trove's own events where
  // the branch's oracle price moved far enough to matter to it
  // (lib/shared/market-note.ts). Nothing is fetched — every Liquity V2 row
  // already carries `collateralPrice`, so the note is a reduction of the list
  // already on the page, computed off the FULL sorted list rather than the
  // filtered one: a note is a fact about the market between two events, and
  // hiding an event type must not change which prices bracket it. The timeline
  // then anchors what it can against whatever is actually displayed, and drops
  // the rest.
  // The branch's own MCR and PriceFeed, from the protocol catalog — never
  // `getLiquidationThreshold`, which keeps a second copy of the same constant.
  const branch = useMemo(() => {
    const b = LIQUITY_V2_BRANCHES[collateralType.toLowerCase()];
    return b ? { collateralType: b.symbol, mcr: b.mcr, priceFeed: b.priceFeed } : null;
  }, [collateralType]);
  const notes = useMemo(() => (branch ? priceGapNotesFor(tl.sortedEvents, branch) : []), [tl.sortedEvents, branch]);

  // The live note: this trove's own newest priced event against the branch's
  // oracle price read at the chain head, just now. Open positions only —
  // closed and liquidated troves get none, ever — and only once both the
  // branch is known and the live read has landed.
  const isOpen = troveData?.status === "open";
  const liveNote = useMemo(
    () => (branch && isOpen && liveOracle ? livePriceGapNote(tl.sortedEvents, branch, liveOracle) : null),
    [branch, isOpen, liveOracle, tl.sortedEvents],
  );
  const liveNotes = useMemo(() => (liveNote ? [liveNote] : []), [liveNote]);

  if (loading) {
    // Only an SSR miss reaches this now — a seeded view never renders the
    // skeleton. Real back button (so the nav chrome doesn't pop in) above the
    // shared detail skeleton — position card, economics panel, and timeline
    // spine in their real shapes, so the content lands without a layout jump.
    return (
      <div className="py-8 space-y-6">
        <DetailBackButton session="liquity-v2" />
        <DetailBodySkeleton />
      </div>
    );
  }

  if (error || !troveData) {
    return (
      <>
        <div className="py-8 space-y-6">
          <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400">{error || "Trove not found"}</p>
            <button
              onClick={loadData}
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  // Assets relevant to the position in view, for the top row's price dropdown:
  // the trove's collateral (priced from the Liquity oracle) plus BOLD, the
  // debt asset — hard-pegged to $1 by the protocol's redemption mechanism, so
  // there's no separate price source for it.
  const collateralPrice = prices?.[troveData.collateralType.toLowerCase() as keyof OraclePricesData];
  const stripAssets: PriceStripAsset[] = [
    ...(collateralPrice ? [{ symbol: troveData.collateralType, price: collateralPrice }] : []),
    { symbol: "BOLD", price: 1 },
  ];

  return (
    <>
      <div className="py-8 space-y-6">
        <DetailTopRow session="liquity-v2" wallet={effectiveOwner} assets={stripAssets}>
          <TroveExportMenu
            trove={troveData}
            liveState={liveState}
            prices={prices}
            debtInFront={debtInFront}
            trovesAhead={trovesAhead}
            events={tl.sortedEvents}
            notes={notes}
            liveNotes={liveNotes}
            csvFilename={`liquity-v2-${collateralType}-trove-${troveId.slice(0, 12)}-activity.csv`}
          />
        </DetailTopRow>
        <TroveSummaryStack
          trove={troveData}
          liveState={liveState}
          prices={prices}
          debtInFront={debtInFront}
          trovesAhead={trovesAhead}
          queueDebtTotal={queueDebtTotal}
          debtInFrontLoading={debtInFrontLoading}
          summaryExplanationOpen={summaryExplanationOpen}
          onToggleSummaryExplanation={setSummaryExplanationOpen}
          viewHref={tl.viewHref}
          loadingStatus={{
            message: getEnhancementStatus(),
            snapshotDate: lastEventTs ?? undefined,
          }}
        />

        {/* Lifetime-flow tower — the shared <ChainTruthTower> every other
            explorer draws, fed by the trove's own event replay. The runway
            that used to share this panel now lives in the position card with
            the current-state stats. A mixed wallet (owns this trove AND
            redeemed against others) gets the redeemer block underneath. */}
        {(() => {
          const currentPrice = prices?.[troveData.collateralType.toLowerCase() as keyof OraclePricesData];
          const result = computeLiquityEconomics(tl.sortedEvents, {
            currentPrice,
            collateralType: troveData.collateralType,
          });
          if (!result) return null;
          return (
            <>
              <ChainTruthTower
                data={result.data}
                title="Lifetime flows"
                explanation={liquityEconomicsExplanation(result.economics, result.economics._meta, currentPrice)}
                learnMore={liquityEconomicsContent({ isBatched: result.economics._meta.isInBatch })}
                rowExtra={liquityRedemptionOutcome(result.economics, currentPrice)}
              />
              {result.redeemer && <RedeemerSummary stats={result.redeemer} currentPrice={currentPrice} />}
            </>
          );
        })()}

        <LiquityTroveBarsProvider events={tl.sortedEvents}>
          <ChainTruthTimeline
            // Matches `LiquityEventCard`'s own `persistKey={`liquity-v2:${event.id}`}`
            // — lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="liquity-v2"
            closed={troveData.status !== "open"}
            tl={tlWithGlyph}
            boundary={boundary}
            notes={notes}
            liveNotes={liveNotes}
            liveNotesPending={isOpen && !!branch && liveOraclePending}
            runs={LIQUITY_TIMELINE_RUNS}
            displayItems={LIQUITY_DISPLAY_ITEMS}
            emptyLabel="No transaction history available"
            toolbarLeading={
              <TimelineActivityHeader
                events={liquityEvents}
                closed={troveData.status !== "open"}
                firstAt={troveData.activity?.createdAt}
              />
            }
            renderCard={(event, meta) => {
              if (!isLiquityEvent(event)) return null;
              // previousEvent is always the temporally-older event, regardless
              // of display order, so explainer deltas (interest accrued,
              // time-since-last) stay correct.
              const idx = sortedIndex.get(event.id);
              const previousEvent = idx != null && idx > 0 ? tl.sortedEvents[idx - 1] : undefined;
              return (
                <LiquityEventCard
                  event={event}
                  addressDisplay="hidden"
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  previousEvent={previousEvent}
                  eventNumber={meta.eventNumber}
                  currentPrice={prices?.[troveData.collateralType.toLowerCase() as keyof OraclePricesData]}
                />
              );
            }}
          />
        </LiquityTroveBarsProvider>
      </div>
      <ProvInspectorLayer />
    </>
  );
}
