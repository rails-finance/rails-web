"use client";

// f(x) position detail — chain-state-first, the 3-section anatomy (card →
// economics → timeline). The [position] URL param is the `<pool>-<id>` slug
// (e.g. wsteth-416), parsed with parseFxPositionSlug.
//
// One timeline fetch carries the whole page: the rails route returns the
// position summary (with the SETTLED chain lane — the pool's own getPosition /
// getPositionDebtRatio / ownerOf, swept at a named head block) alongside the
// raw event rows. Because f(x) socializes funding, rebalances and write-offs
// with no per-position event, the settled lane is the ONLY valid current
// state; the timeline is history, and the card's reconciliation line
// quantifies the gap between the two (the socialized lane), always surfaced.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import { parseFxPositionSlug } from "@/lib/fx/asset-catalog";
import { fetchFxTimeline } from "@/lib/api/fetch-fx-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { withOpeningActors } from "@/lib/shared/external-actor";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { FX_TICK_REBALANCE_RUNS } from "@/lib/fx/timeline-runs";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { FxEventCard } from "@/components/protocol/fx/fx-event-card";
import { FxPositionCard, viewFromSummary, type FxPositionView } from "@/components/protocol/fx/fx-position-card";
import { FxPositionExplanation } from "@/components/protocol/fx/fx-position-explanation";
import { FxLoansLine } from "@/components/protocol/fx/fx-loans-line";
import { fxLoans } from "@/lib/fx/loans";
import { summariseFxExternalActors } from "@/lib/fx/external-actor";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { FxDriftPanel } from "@/components/protocol/fx/fx-drift-panel";
import { FxSocializedReadsContext } from "@/lib/fx/socialized-reads";
import { useFxPositionReads, useFxPricesAt } from "@/lib/fx/use-event-state";
import { fetchFxDrift, FxDriftError, type FxDriftResult } from "@/lib/sources/api/fx-drift";
import { computeFxEconomics, fxDebtFlowsWithOpening } from "@/lib/fx/economics";
import { fxNoTxParts } from "@/lib/fx/no-tx-parts";
import { fxLiquidationMoved } from "@/lib/fx/row-figures";
import { fxEconomicsExplanation, fxEconomicsContent } from "@/lib/fx/economics-explanation";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const FxExportMenu = dynamic(() => import("@/components/protocol/fx/fx-export-menu").then((m) => m.FxExportMenu), {
  ssr: false,
});

interface FxPositionViewProps {
  /** The `<pool>-<id>` slug. Already parsed by the server route, which answered
   *  404 for anything it could not read. */
  slug: string;
  initialPosition: FxPositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a position id the pool has not opened — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function FxPositionView({
  slug,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: FxPositionViewProps) {
  const parsed = useMemo(() => parseFxPositionSlug(slug ?? ""), [slug]);
  // Keyed on the timeline, not the row: an id the pool has never opened is a
  // real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<FxPositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model, with this page's one twist: the window cuts the
  // mv_fx_events lane ONLY. The ownership and socialized lanes always arrive
  // whole — their pre-cut cards are in `events` already and count themselves —
  // so the opening balance summarises the MV lane below the cut and nothing
  // else. On a position that needs no window — every f(x) position observed
  // so far — `cutoffBlock` comes back null and the page is byte-for-byte what
  // it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !parsed) return;
    (async () => {
      setLoading(true);
      try {
        const tData = await fetchFxTimeline(parsed.pool, parsed.positionId, { recent: TIMELINE_WINDOW_EVENTS });
        setView(tData.position ? viewFromSummary(tData.position) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [parsed, seeded]);

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
    if (opening != null || !parsed) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: `/api/fx/position/${parsed.pool}/${encodeURIComponent(parsed.positionId)}/timeline/summary`,
      params: {},
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  const fxEvents = useMemo(() => events.filter(isFxEvent), [events]);

  // The socialized lane by interval — rails-server's per-position boundary
  // reads (archive getPosition at the position's own event boundaries, cached
  // server-side; the head end is the settled sweep). Fetched once the rows are
  // in (the intervals are bounded by the position's own events), newest
  // intervals first; `unread` older ones arrive on the panel's next request.
  // Shared three ways: the card's collateral-side reconciliation line, the
  // rebalance cards' own-position slice, and the panel's table.
  const [drift, setDrift] = useState<FxDriftResult | null>(null);
  const [driftState, setDriftState] = useState<"idle" | "loading" | "error">("idle");
  const [driftReason, setDriftReason] = useState<string | null>(null);
  const driftRequested = useRef(false);
  const hasOwnEvents = useMemo(
    () =>
      fxEvents.some(
        (e) =>
          e.context.data.eventType === "operate" ||
          (e.context.data.eventType === "liquidation" && !e.context.data.poolWide),
      ),
    [fxEvents],
  );
  const loadDrift = useCallback(async () => {
    if (!parsed) return;
    setDriftState("loading");
    setDriftReason(null);
    try {
      setDrift(await fetchFxDrift(parsed.pool, parsed.positionId));
      setDriftState("idle");
    } catch (err) {
      setDriftReason(err instanceof FxDriftError ? err.reason : null);
      setDriftState("error");
    }
  }, [parsed]);
  useEffect(() => {
    if (loading || !hasOwnEvents || driftRequested.current) return;
    driftRequested.current = true;
    void loadDrift();
  }, [loading, hasOwnEvents, loadDrift]);

  // Rebalance rows sharing a block: the row's getPosition read (block − 1 to
  // the block) covers them together, and the row says so.
  const blockPeers = useMemo(() => {
    const perBlock = new Map<number, number>();
    for (const e of fxEvents)
      if (e.context.data.eventType === "tickRebalance")
        perBlock.set(e.blockNumber, (perBlock.get(e.blockNumber) ?? 0) + 1);
    return perBlock;
  }, [fxEvents]);

  // The socialized rows (rebalances, pool-wide liquidations): the position is
  // read at each of their blocks once, for the card's split, each row's own
  // change in its header and each run's total (lib/fx/socialized-reads.tsx).
  const socializedRows = useMemo(
    () =>
      fxEvents.filter(
        (e) =>
          e.context.data.eventType === "tickRebalance" ||
          (e.context.data.eventType === "liquidation" && e.context.data.poolWide === true),
      ),
    [fxEvents],
  );
  const socializedBlocks = useMemo(() => socializedRows.map((e) => e.blockNumber), [socializedRows]);
  // With the oracle's legs at each block and the one before: the card values
  // what rebalances and redemptions took at the min price they were paid at.
  const socializedReadsMap = useFxPositionReads(
    parsed?.pool ?? "",
    parsed?.positionId ?? "",
    socializedBlocks,
    undefined,
    true,
  );
  const socializedReads = useMemo(() => {
    // The timeline reads newest first, so a block's LAST row is the one drawn
    // on top: it states the block's change, and the rows under it say so.
    const leads = new Set<string>();
    const lastOf = new Map<number, string>();
    const peers = new Map<number, number>();
    for (const e of socializedRows) {
      lastOf.set(e.blockNumber, e.id);
      peers.set(e.blockNumber, (peers.get(e.blockNumber) ?? 0) + 1);
    }
    for (const id of lastOf.values()) leads.add(id);
    return { reads: socializedReadsMap, leads, peers };
  }, [socializedRows, socializedReadsMap]);

  // The socialized rows, for the card's lines (what they took, read per
  // block), and the loans this NFT has carried.
  // What moved the debt without the owner's transaction, part by part: the
  // card's line, its Explanation and the Lifetime flows segment share it.
  const noTxParts = useMemo(
    () =>
      historyWindow.state === "whole" && view
        ? fxNoTxParts(
            fxEvents,
            socializedReadsMap,
            view.settled.debts != null ? (view.socializedDebt ?? view.impliedDebt.amount - view.settled.debts) : null,
          )
        : null,
    [fxEvents, socializedReadsMap, view, historyWindow.state],
  );
  const rebalanceRows = useMemo(() => {
    const reb = socializedRows;
    if (reb.length === 0) return undefined;
    return {
      blocks: reb.map((e) => e.blockNumber),
      firstTs: reb[0].timestamp,
      lastTs: reb[reb.length - 1].timestamp,
      liquidations: reb.filter((e) => e.context.data.eventType === "liquidation").length,
      redemptions: reb.filter((e) => e.context.data.redemption === true).length,
      parts: noTxParts,
      ownEventBlocks: fxEvents
        .filter(
          (e) =>
            e.context.data.eventType === "operate" ||
            (e.context.data.eventType === "liquidation" && !e.context.data.poolWide),
        )
        .map((e) => e.blockNumber),
      reads: socializedReadsMap,
    };
  }, [fxEvents, socializedRows, socializedReadsMap, noTxParts]);
  const loans = useMemo(() => fxLoans(fxEvents), [fxEvents]);
  // Pool-wide liquidations (mig 369) are not in the summary's counts, which
  // come from the per-position LiquidatePosition lane: the card counts them
  // from the rows. A LiquidatePosition that took no collateral and repaid
  // under 0.000001 fxUSD (a keeper's call that found the position already
  // emptied) stays a row and leaves the count (fxLiquidationMoved).
  const emptyLiquidations = useMemo(
    () =>
      fxEvents.filter(
        (e) =>
          e.context.data.eventType === "liquidation" && !e.context.data.poolWide && !fxLiquidationMoved(e.context.data),
      ).length,
    [fxEvents],
  );
  const cardView = useMemo(() => {
    const n = socializedRows.filter((e) => e.context.data.eventType === "liquidation").length;
    if (!view || (n === 0 && emptyLiquidations === 0) || historyWindow.state !== "whole") return view;
    return {
      ...view,
      everLiquidated: view.everLiquidated || n > 0,
      liquidationCount: view.liquidationCount + n - emptyLiquidations,
      activity: { ...view.activity, eventCount: view.activity.eventCount + n - emptyLiquidations },
    };
  }, [view, socializedRows, emptyLiquidations, historyWindow.state]);
  const blockDates = useMemo(() => new Map(fxEvents.map((e) => [e.blockNumber, e.timestamp])), [fxEvents]);

  const tl = useTimelineEvents(fxEvents, { storageKey: `fx-${slug}`, protocolKey: "fx", window: historyWindow });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? fxEvents : undefined;
  const precomputedLifetime = useMemo(() => fxDebtFlowsWithOpening(fxEvents, opening), [fxEvents, opening]);

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    if (!parsed) return { events: [], missing: 0 };
    const res = await fetchFxTimeline(parsed.pool, parsed.positionId);
    const served = (res.events ?? []).filter(isFxEvent);
    return { events: served, missing: 0 };
  }, [parsed]);

  // Who executed this position's events — the SAME verdict each event card
  // renders on its spine, reduced over the whole history so the Explanation can
  // state it once. Derived from the events already on the page; no new field on
  // the timeline response.
  const externalActivity = useMemo(
    () =>
      // On a windowed page the opening balance's own split is added:
      // rails-server reconstructs the same owner-in-force-vs-actor verdict
      // over the MV lane below the cut, so both halves judge on the same fact
      // and never count one event twice.
      withOpeningActors(
        summariseFxExternalActors(fxEvents.map((e) => e.context.data)),
        opening?.actors,
        opening?.totalEvents ?? 0,
      ),
    [fxEvents, opening],
  );

  // The top row's price dropdown: the pool's own oracle price per
  // NORMALIZED unit (the settled amounts' basis), while the position is open.
  // The anchor price read at the settled block, the price the card's USD
  // figure and debt ratio use; the sweep's stored min-leg reading until it
  // lands.
  const settledPx = useFxPricesAt(
    parsed?.pool ?? "",
    parsed?.positionId ?? "",
    view?.status === "open" ? view.settled.block : null,
    true,
  );
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view || view.status !== "open") return [];
    if (settledPx?.anchorPrice != null)
      return [
        {
          symbol: view.normalizedSymbol,
          price: Number(settledPx.anchorPrice) / 1e18,
          label: `${view.normalizedSymbol} · anchor price`,
        },
      ];
    if (view.oracle.priceUsd == null || view.oracle.priceUsd <= 0) return [];
    return [{ symbol: view.normalizedSymbol, price: view.oracle.priceUsd }];
  }, [view, settledPx]);

  // A closed position's price: the oracle read its closing row's snapshot
  // carries.
  const closing = useMemo(() => {
    if (!view || view.status === "open") return undefined;
    return closingPricesAt(fxEvents, (row) => {
      const usd = Number(row.context.data.oraclePrice);
      return Number.isFinite(usd) && usd > 0 ? [{ symbol: view.normalizedSymbol, price: usd }] : undefined;
    });
  }, [view, fxEvents]);

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="fx" assets={stripAssets} closed={view != null && view.status !== "open"} closing={closing}>
        {view && (
          <FxExportMenu
            view={view}
            events={fxEvents}
            drift={drift}
            csvFilename={`fx-${slug}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, fxEvents)}
            scopeNote={exportScopeNote(historyWindow, fxEvents, "this position's whole history")}
          />
        )}
      </DetailTopRow>

      {/* An unreadable slug never reaches here: the server route answers 404
          with the not-found body beside it. */}
      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {view && (
            // The Explanation pane: layman narration of the card's own face
            // figures, in two moods — the pool's own figures present, or still
            // pending (the card shows dashes and the pane says so plainly).
            <FxPositionCard
              v={cardView ?? view}
              receipts
              viewHref={tl.viewHref}
              drift={drift}
              rebalanceRows={historyWindow.state === "whole" ? rebalanceRows : undefined}
              bodyExtra={
                loans.length > 1 || loans.at(-1)?.ending === "liquidated" ? <FxLoansLine loans={loans} /> : undefined
              }
              explanation={
                <FxPositionExplanation
                  v={cardView ?? view}
                  parts={noTxParts}
                  emptyLiquidations={historyWindow.state === "whole" ? emptyLiquidations : 0}
                  externalActivity={externalActivity}
                  // The full record's row count: the loaded rows plus the
                  // MV-lane events the opening balance summarised (the raw
                  // lanes always load whole, so they are already counted).
                  // Unknown while the opening balance is in flight.
                  timelineRows={lifetimeKnown ? fxEvents.length + (opening?.totalEvents ?? 0) : undefined}
                />
              }
            />
          )}
          {view &&
            (() => {
              const towerData = computeFxEconomics(view, lifetimeEvents ?? [], precomputedLifetime, noTxParts);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={fxEconomicsExplanation(towerData)}
                  learnMore={fxEconomicsContent()}
                />
              );
            })()}
          {/* Per-interval decomposition of the socialized lane — the same
              intervals the card's collateral line and the rebalance cards'
              own-position slices read from. Only meaningful once the position
              has events to bound the intervals. */}
          {view && hasOwnEvents && (
            <FxDriftPanel
              drift={drift}
              state={driftState}
              reason={driftReason}
              onLoad={() => void loadDrift()}
              normalizedSymbol={view.normalizedSymbol}
              blockDates={blockDates}
            />
          )}
          {/* Chain-only positions: the contract minted them via a path that
              emits no Operate (roster verified against getNextPositionId), so
              an empty timeline is the truthful record, not missing data. */}
          {view && fxEvents.length === 0 && (
            <div className="text-sm text-rb-500">
              This position has no recorded events — it was created by a path that logs nothing, so only the
              pool&rsquo;s own current figures above describe it.
            </div>
          )}
          <FxSocializedReadsContext.Provider value={socializedReads}>
            <ChainTruthTimeline
              csvExportCeiling={null}
              // Matches `FxEventCard`'s own `persistKey={`fx:${event.id}`}` —
              // lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount.
              persistKeyPrefix="fx"
              closed={view ? view.status !== "open" : undefined}
              tl={tl}
              runs={FX_TICK_REBALANCE_RUNS}
              // Tenure-first header: when the position started, how long it has
              // run, how fresh the latest activity is.
              toolbarLeading={
                view ? (
                  <TimelineActivityHeader
                    events={fxEvents}
                    closed={view.status !== "open"}
                    // When the position actually opened, not when the window
                    // does.
                    firstAt={opening?.firstTimestamp}
                    tenurePending={!lifetimeFiguresKnown(historyWindow)}
                    reopenedAt={
                      loans.length > 1 && loans[loans.length - 1].closedAt == null
                        ? loans[loans.length - 1].openedAt
                        : null
                    }
                  />
                ) : undefined
              }
              renderCard={(event, meta) =>
                isFxEvent(event) ? (
                  <FxEventCard
                    event={event}
                    eventNumber={meta.eventNumber}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    blockPeers={
                      event.context.data.eventType === "tickRebalance" ? blockPeers.get(event.blockNumber) : undefined
                    }
                  />
                ) : null
              }
            />
          </FxSocializedReadsContext.Provider>
          {/* Ambient oracle-price pill, fixed bottom-right. */}
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
