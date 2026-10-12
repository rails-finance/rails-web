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
import { FX_POOLS, parseFxPositionSlug } from "@/lib/fx/asset-catalog";
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
import { FxDriftPanel } from "@/components/protocol/fx/fx-drift-panel";
import { FxSocializedReadsContext } from "@/lib/fx/socialized-reads";
import { useFxPositionReads, useFxPricesAtRead } from "@/lib/fx/use-event-state";
import { fxInTxFunding, fxOperateBlocks } from "@/lib/fx/in-tx-funding";
import { currentHolder, withHolderSpans } from "@/lib/fx/holders";
import { FxHolderLine } from "@/components/protocol/fx/fx-holder-line";
import { fetchFxDrift, FxDriftError, type FxDriftResult } from "@/lib/sources/api/fx-drift";
import { fxNoTxParts } from "@/lib/fx/no-tx-parts";
import { fxLiquidationMoved } from "@/lib/fx/row-figures";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { FxFlowsNote, fxFlowsContent } from "@/components/protocol/fx/fx-flows-note";
import { useFxFlows } from "@/hooks/useFxFlows";
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

  // The ownership rows carry when each sending holder took the position.
  const fxEvents = useMemo(
    () => withHolderSpans(events.filter(isFxEvent), view?.openedBy).filter(isFxEvent),
    [events, view?.openedBy],
  );

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

  // Funding the pool books inside the position's own transactions: the position
  // read at each operate row's block, once, for the card, the stretch table and
  // each row's collateral tile (lib/fx/in-tx-funding.ts).
  const operateBlocks = useMemo(() => fxOperateBlocks(fxEvents), [fxEvents]);
  const operateReads = useFxPositionReads(parsed?.pool ?? "", parsed?.positionId ?? "", operateBlocks, 120);
  const inTxFunding = useMemo(
    () => (historyWindow.state === "whole" ? fxInTxFunding(fxEvents, operateReads) : null),
    [fxEvents, operateReads, historyWindow.state],
  );
  const ownPeers = useMemo(() => {
    const perBlock = new Map<number, number>();
    for (const e of fxEvents)
      if (e.context.data.eventType === "operate") perBlock.set(e.blockNumber, (perBlock.get(e.blockNumber) ?? 0) + 1);
    return perBlock;
  }, [fxEvents]);
  const holder = useMemo(
    () => currentHolder(fxEvents, view?.owner, view?.openedBy),
    [fxEvents, view?.owner, view?.openedBy],
  );
  const rowKinds = useMemo(() => {
    let rebalances = 0;
    let redemptions = 0;
    let poolLiquidations = 0;
    let transfers = 0;
    for (const e of fxEvents) {
      const d = e.context.data;
      if (d.eventType === "transfer") transfers += 1;
      else if (d.eventType === "tickRebalance") d.redemption ? (redemptions += 1) : (rebalances += 1);
      else if (d.eventType === "liquidation" && d.poolWide) poolLiquidations += 1;
    }
    return { rebalances, redemptions, poolLiquidations, transfers };
  }, [fxEvents]);

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
  // A LiquidatePosition that took no collateral and repaid under 0.000001
  // fxUSD (a keeper's call that found the position already emptied) stays a
  // row and is out of the count (fxLiquidationMoved); the Explanation names
  // those rows. The card's count is the server's `liquidation_count`, which
  // adds the pool-wide liquidations and applies the same rule.
  const emptyLiquidations = useMemo(
    () =>
      fxEvents.filter(
        (e) =>
          e.context.data.eventType === "liquidation" && !e.context.data.poolWide && !fxLiquidationMoved(e.context.data),
      ).length,
    [fxEvents],
  );
  const blockDates = useMemo(() => new Map(fxEvents.map((e) => [e.blockNumber, e.timestamp])), [fxEvents]);

  const tl = useTimelineEvents(fxEvents, {
    storageKey: `fx-${slug}`,
    protocolKey: "fx",
    window: historyWindow,
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: false,
  });

  // On a windowed page the row count reads the MERGED history: unknown until
  // the opening balance is.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);

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
  const { value: settledPx, settled: settledPxIn } = useFxPricesAtRead(
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

  // The Lifetime flows panel replays the position's whole history
  // (lib/fx/flows.ts): the page's rows where they are all of it, else the
  // flat history read once (the CSV's read). Today's figures are the pool's
  // settled read at the anchor price, the card's.
  const poolMeta = parsed ? FX_POOLS[parsed.pool] : null;
  const flowLive = useMemo(
    () =>
      view && view.status === "open"
        ? {
            price:
              settledPx?.anchorPrice != null
                ? Number(settledPx.anchorPrice) / 1e18
                : view.oracle.priceUsd != null && view.oracle.priceUsd > 0
                  ? view.oracle.priceUsd
                  : null,
            coll: view.settled.colls,
            debt: view.settled.debts,
          }
        : null,
    [view, settledPx],
  );
  const flows = useFxFlows({
    pool: parsed?.pool ?? null,
    positionId: parsed?.positionId ?? null,
    normalizes: poolMeta != null && poolMeta.tokenSymbol !== poolMeta.normalizedSymbol,
    wholeEvents: historyWindow.state === "whole" ? fxEvents : null,
    fetchAll: fetchAllHistory,
    collSymbol: view?.normalizedSymbol ?? null,
    open: view?.status === "open",
    live: flowLive,
    liveSettled: settledPxIn,
    enabled: view != null,
  });
  const flowFocus = flows.read !== "failed" ? flows.focus : null;

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
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="fx"
          owner={{ wallet: view?.owner }}
          assets={stripAssets}
          closed={view != null && view.status !== "open"}
          closing={closing}
        >
          {view && (
            <FxExportMenu
              view={view}
              events={fxEvents}
              drift={drift}
              reads={historyWindow.state === "whole" ? socializedReadsMap : undefined}
              parts={noTxParts}
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
                v={view}
                receipts
                viewHref={tl.viewHref}
                // Closed by default, remembered per viewer and position (ui-jobs
                // 209).
                positionSummary
                drift={drift}
                rebalanceRows={historyWindow.state === "whole" ? rebalanceRows : undefined}
                inTxFunding={inTxFunding}
                bodyExtra={
                  holder || loans.length > 1 || loans.at(-1)?.ending === "liquidated" ? (
                    <>
                      {holder ? <FxHolderLine holder={holder} /> : null}
                      {loans.length > 1 || loans.at(-1)?.ending === "liquidated" ? <FxLoansLine loans={loans} /> : null}
                    </>
                  ) : undefined
                }
                explanation={
                  <FxPositionExplanation
                    v={view}
                    parts={noTxParts}
                    emptyLiquidations={historyWindow.state === "whole" ? emptyLiquidations : 0}
                    externalActivity={externalActivity}
                    // The full record's row count: the loaded rows plus the
                    // MV-lane events the opening balance summarised (the raw
                    // lanes always load whole, so they are already counted).
                    // Unknown while the opening balance is in flight.
                    timelineRows={lifetimeKnown ? fxEvents.length + (opening?.totalEvents ?? 0) : undefined}
                    rowKinds={rowKinds}
                  />
                }
              />
            )}
            {/* Lifetime flows: the bars and the line over the position's replay
              (lib/fx/flows.ts), in fxUSD, in place of the tower (TO-DO-ui-jobs
              206). */}
            {view && (
              <LifetimeFlowsPanel
                scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                read={flows.read}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <FxFlowsNote
                      facts={flows.facts}
                      collSymbol={view.normalizedSymbol}
                      tokenSymbol={poolMeta?.tokenSymbol ?? view.poolSymbol}
                    />
                  </div>
                }
                learnMore={fxFlowsContent()}
              />
            )}
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
                inTx={inTxFunding}
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
                      isLast={meta.isLast}
                      blockPeers={
                        event.context.data.eventType === "tickRebalance"
                          ? blockPeers.get(event.blockNumber)
                          : event.context.data.eventType === "operate"
                            ? ownPeers.get(event.blockNumber)
                            : undefined
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
    </FlowFocusContext.Provider>
  );
}
