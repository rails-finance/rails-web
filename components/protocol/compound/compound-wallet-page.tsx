"use client";

// Every Compound V3 position one wallet holds on one deployment — state,
// economics and whole history, market by market. Lifted from the Base page;
// the deployment (lib/compound/page-deployment.ts) carries the routes, the
// history's whole-life rule and the words: Base (lib/compound-base/
// page-deployment.ts) reads the index or sweeps the Comets' logs, Arbitrum
// (lib/compound-arbitrum/page-deployment.ts) reads rails-server's per-wallet
// store and waits for its confirmation.
//
// The Ethereum explorer's detail page is ONE (market, wallet) pair, because
// that is what its index hands you a link to. This page is the whole wallet:
// Comet names no accounts, so nothing can hand you a link here — the page
// finds the positions itself by asking every market in the roster about the
// address, and it finds the HISTORY from the index when the index holds the
// whole of it, and by sweeping every Comet's own logs for the address from the
// earliest Comet's first block until then (the route decides; `coverage.source`
// says which answered).
//
// Each market the wallet has ever touched is its own section, and each section
// is the Ethereum page's body: the shared position card with the live risk
// slot, the Lifetime flows panel (lib/compound/flows.ts, in place of the tower,
// rails-ops TO-DO-ui-jobs 206), and a market-scoped timeline. That is deliberate.
// A Comet market is single-base and multi-collateral, nothing is
// cross-collateralised between markets, and they do not all measure in the
// same unit (cWETHv3 quotes in ETH) — so there is no combined health factor to
// state and no total to sum, and each market stands on its own exactly as it
// does on the chain.
//
// A deployment with a page per (market, wallet) — Arbitrum (rails-ops
// reference/arbitrum-position-first-lane.md) — passes `market`: the reads stay
// whole-wallet, and the page draws that one market's section. Without it, as
// on Base, every market the wallet touched is drawn.
//
// Two reads feed the sections, in the order they can answer: the Comets
// (fast — three batched calls at one pinned block — feeds the cards) and the
// history (the index in one read, or the sweep — slow, the whole chain in
// chunks — feeds the timelines, the Lifetime flows panel, and the card's
// principal and peaks). A market with a live balance but no history, or
// history but no live balance (a closed position), is a section either way.
// The history's completeness is a property of the request rather than of the
// explorer, so it is stated under every timeline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import {
  CompoundPositionCard,
  cardSideUsd,
  type CompoundPositionView,
} from "@/components/protocol/compound/compound-position-card";
import { CompoundEventCard } from "@/components/protocol/compound/compound-event-card";
import {
  CompoundPositionExplanation,
  CompoundClosedPositionExplanation,
} from "@/components/protocol/compound/compound-position-explanation";
import { compoundExplorer } from "@/lib/compound/explorer";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { COMPOUND_FOLDER_REGISTER, COMPOUND_LIQUIDATION_RUNS } from "@/lib/compound/timeline-runs";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { CompoundFlowsNote, compoundFlowsContent } from "@/components/protocol/compound/compound-flows-note";
import { CompoundFlowReplayContext } from "@/components/protocol/compound/compound-ledger";
import { useCompoundFlows } from "@/hooks/useCompoundFlows";
import type { CompoundLive } from "@/lib/compound/flows";
import { scaleCompoundChainBalance } from "@/lib/api/fetch-compound-position";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { TimelineConfirmationFooter, TimelineCoverageFooter } from "@/components/shared/timeline-coverage-footer";
import { boundaryFromChainCoverage } from "@/lib/shared/timeline-boundary";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { CaptureSourceProvider, type CaptureSource } from "@/lib/shared/capture-source";
import { CompoundBalanceReadProvider, type CompoundBalanceRead } from "@/components/protocol/compound/balance-read";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { eventsBelowLife, replaySegmentReads } from "@/lib/api/fetch-replay-segment";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import { TIMELINE_WINDOW_ROWS, WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import {
  interleaveRowPlan,
  servedFoldersEnabled,
  type GroupedTimelineFields,
  type ServedFolder,
} from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { ExportMenu, type WholeHistoryFetch } from "@/components/shared/export-menu";
import { compoundExports } from "@/components/protocol/compound/compound-export-menu";
import type { CompoundBaseMarketRows } from "@/lib/compound-base/timeline-folders";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { previousEventById, previousEventByTx } from "@/lib/compound/row-facts";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import { cometViewFromChain } from "@/lib/compound/chain-position-view";
import { CometDeploymentProvider } from "@/lib/compound/deployment-context";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundPageDeployment } from "@/lib/compound/page-deployment";
import { fetchCompoundWallet, type CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import {
  ChainTimelineOverBudget,
  ChainTimelinePending,
  ChainTimelineUnavailable,
  fetchChainTimeline,
} from "@/lib/api/fetch-chain-timeline";
import { retryWhen, useOverBudgetRetry } from "@/hooks/useOverBudgetRetry";
import { FIRST_READ_ASKS, FIRST_READ_GAP_MS, WHOLE_ASKS, WHOLE_GAP_MS } from "@/lib/shared/store-history-asks";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { CometChainTimelineResult, CometMarketReplay } from "@/lib/sources/chain/compound-v3-events";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { StoreFirstRead, SweepInFlight } from "@/components/shared/sweep-in-flight";

/** The history as the route answers it: flat, or — asked `?group=1`, the
 *  page default — as ROWS, where `events` holds only the ungrouped events of
 *  every market and `marketRows` puts each market's folders back between its
 *  own (lib/compound-base/timeline-folders.ts). A history the index cannot
 *  vouch for is answered flat either way, and reads as flat here. */
type CompoundBaseTimeline = CometChainTimelineResult & {
  grouped?: true;
  eventsServed?: number;
  boundBy?: GroupedTimelineFields["boundBy"];
  cutoffBlock?: number | null;
  marketRows?: Record<string, CompoundBaseMarketRows> | null;
};
/** `first-read`: the store is reading this wallet's history for the first
 *  time, and the page asks again. */
type TimelineState = "loading" | "first-read" | "ready" | "unavailable" | "overBudget" | "failed";

/** Prices keyed `${marketKey}:${token}` — each Comet reads its own feeds, so a
 *  token has one price PER MARKET, not one price. */
async function fetchCometPrices(route: string, pairs: string[]): Promise<Record<string, number>> {
  if (pairs.length === 0) return {};
  const res = await fetch(`${route}?pairs=${pairs.join(",")}`, { cache: "no-store" });
  if (!res.ok) return {};
  const data = (await res.json()) as { prices?: Record<string, number> };
  return data.prices ?? {};
}

/** This market's prices, keyed by token — what the view and tower look up. */
function pricesFor(prices: Record<string, number>, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(prices)) if (k.startsWith(`${key}:`)) out[k.slice(key.length + 1)] = v;
  return out;
}

interface Section {
  market: CometMarket;
  chain: CompoundMarketChainResponse | null;
  replay: CometMarketReplay | null;
}

const holdsSomething = (live: CompoundMarketChainResponse | null): boolean =>
  live != null && (live.supplyBalanceRaw !== "0" || live.borrowBalanceRaw !== "0" || live.collateral.length > 0);

/** One market's position: card + risk slot, the Lifetime flows panel, and its
 *  own timeline. */
function MarketSection({
  d,
  section,
  wallet,
  view,
  events,
  timeline,
  timelineState,
  firstReadStalled,
  retryIn,
  sweptClean,
  captureSource,
}: {
  d: CompoundPageDeployment;
  section: Section;
  wallet: string;
  view: CompoundPositionView;
  /** This market's events only. */
  events: BaseActivityEvent[];
  timeline: CompoundBaseTimeline | null;
  timelineState: TimelineState;
  /** The page has stopped asking a store that is still on its first read. */
  firstReadStalled: boolean;
  /** Seconds until the page asks an over-budget store again. */
  retryIn: number | null;
  sweptClean: boolean;
  /** Which capture answered — the index or the sweep. Words below differ. */
  captureSource: CaptureSource;
}) {
  const { market, chain, replay } = section;
  const TIMELINE_ROUTE = d.routes.timeline;
  const FOLDER_ROUTE = d.routes.folder ?? d.routes.timeline;
  const compoundEvents = useMemo(() => events.filter(isCompoundEvent), [events]);
  const siblingsByTx = useMemo(() => groupEventsByTx(compoundEvents), [compoundEvents]);
  // Each row's previous row in this market: the interest line's yearly rate
  // and the absorb's "what moved" read from them.
  const previousById = useMemo(() => previousEventById(compoundEvents), [compoundEvents]);
  const previousByTx = useMemo(() => previousEventByTx(compoundEvents), [compoundEvents]);

  // This market's share of a grouped answer: its rows, interleaving its
  // folders with its own ungrouped events.
  const rows = timeline?.grouped ? (timeline.marketRows?.[market.key] ?? null) : null;
  const servedRows = useMemo(
    () => (rows ? interleaveRowPlan(rows.rowPlan, compoundEvents) : undefined),
    [rows, compoundEvents],
  );
  /** The folders, whole and unfiltered. The tower, the card's counts and the
   *  peaks need nothing from them: the route replayed every row before it
   *  grouped, and those figures ride the replay. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  const groupedTail = useMemo<GroupedTimelineFields | null>(
    () =>
      rows
        ? { grouped: true, rowPlan: rows.rowPlan, eventsServed: rows.eventsServed, boundBy: timeline?.boundBy ?? null }
        : null,
    [rows, timeline?.boundBy],
  );

  // The month read (hooks/useTimelineSegment.ts): a month of THIS market the
  // preload does not hold is sliced from the route's replay
  // (`&market=&from=&to=`), whose running figures are the whole replay's. The
  // preload's row cap is the page's, shared by every market, so a month read
  // carries the whole cap (`spanCap`) however few rows this market kept.
  // Months below a seed's cut have no day counts, so the grid draws them and
  // refuses the click; the boundary card states them.
  const segmentReads = useMemo(
    () => replaySegmentReads(TIMELINE_ROUTE, wallet, { market: market.key }),
    [TIMELINE_ROUTE, wallet, market.key],
  );
  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events: compoundEvents,
    groupedTail,
    servedRows,
    servedFolders,
    opening: null,
    lifeBelow: rows?.belowByDay,
    eventsBelowLife: eventsBelowLife(replay?.omitted?.count, rows?.belowByDay),
    // THIS market's rows before the trim (the replay's per-market count, not
    // the wallet-wide one — the page draws one timeline per market), so
    // numbering runs over the market's whole history and the count line
    // states its real total (rails-ops decision 0019).
    olderCount: replay?.omitted?.count ?? 0,
    historyWindow: WHOLE_HISTORY,
    spanCap: rows ? TIMELINE_WINDOW_ROWS : null,
    isEvent: isCompoundEvent,
    readGrouped: segmentReads.readGrouped,
    readFlat: segmentReads.readFlat,
    folderPath: FOLDER_ROUTE,
    folderParams: { wallet, market: market.key },
    storageKey: `${d.csvPrefix}-${market.key}-${view.account}`,
    protocolKey: "compound",
    // Navigated by the Lifetime flows cursor through "Sync to chart": no Dates.
    dates: false,
  });
  const sideUsd = cardSideUsd(view);

  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the market's timeline.
  const externalActivity = useMemo(
    () =>
      withFolderActors(
        summariseExternalActors(
          compoundEvents.map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.funder,
            wallet: e.wallet,
          })),
        ),
        servedFolders,
      ),
    [compoundEvents, servedFolders],
  );

  // Rows read at their blocks state the chain's balance (decision 0033); a
  // market whose last row is not read yet keeps the running-sum wording.
  const vocab = d.vocab(replay?.baseAtChain === true);

  // The Lifetime flows panel replays this market's whole history
  // (lib/compound/flows.ts): the loaded rows where they are all of it, else
  // the rows with each folder opened for its members. A market whose history
  // the sweep did not read whole, or one cut below its newest rows (a seeded
  // heavy wallet), has no read, and the panel draws nothing. The test is per market where the deployment states one
  // (`marketWholeOf`: a horizon or a hole below this Comet's first block
  // leaves its rows all of it), else the wallet's (rails-ops TO-DO-ui-jobs.md
  // item 415).
  const omitted = replay?.omitted?.count ?? 0;
  const marketWhole =
    sweptClean ||
    (timelineState === "ready" && timeline != null && (d.marketWholeOf?.(timeline.coverage, market) ?? false));
  const flowWhole = marketWhole && omitted === 0 && !servedFolders?.length;
  const fetchMarketHistory = useCallback(async () => {
    const all: BaseActivityEvent[] = [...compoundEvents];
    for (const f of servedFolders ?? []) {
      const opened = await fetchTimelineFolderMembers({ path: FOLDER_ROUTE, params: { wallet }, folder: f.responseId });
      all.push(...opened.events.filter((e) => isCompoundEvent(e) && e.context.data.market === market.key));
    }
    all.sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
    return { events: all, missing: omitted };
  }, [compoundEvents, servedFolders, wallet, market.key, omitted, FOLDER_ROUTE]);
  const flowLive = useMemo<CompoundLive | null>(() => {
    if (!chain || chain.chainStale || view.status !== "open") return null;
    const supply = scaleCompoundChainBalance(chain.supplyBalanceRaw || "0", chain.baseDecimals);
    const borrow = scaleCompoundChainBalance(chain.borrowBalanceRaw || "0", chain.baseDecimals);
    return {
      base: supply - borrow,
      coll: Object.fromEntries(
        chain.collateral.map((c) => [c.address.toLowerCase(), scaleCompoundChainBalance(c.balanceRaw, c.decimals)]),
      ),
      prices: Object.fromEntries(Object.entries(view.priceByAddress ?? {}).map(([a, p]) => [a.toLowerCase(), p])),
      supplyApr: chain.supplyApr,
      borrowApr: chain.borrowApr,
    };
  }, [chain, view]);
  const flows = useCompoundFlows({
    wholeEvents: flowWhole ? compoundEvents : null,
    fetchAll: marketWhole && omitted === 0 ? fetchMarketHistory : null,
    deployment: d.explorerDeployment,
    market,
    open: view.status === "open",
    live: flowLive,
  });

  const live = chain && !chain.chainStale ? chain : null;
  const holds = holdsSomething(live);
  // The card ⋮'s exports: this market's position and its rows. A grouped
  // answer's folders hold members the page has not loaded, so the CSV reads
  // them first.
  const exports = compoundExports({
    wallet,
    views: [view],
    chainByMarket: chain ? { [market.key]: chain } : {},
    events: compoundEvents,
    history: markdownHistoryScope(undefined, compoundEvents, servedFolders),
    scopeNote: exportScopeNote(undefined, compoundEvents, "this wallet's whole history in this market", servedFolders),
    fetchAllEvents: servedFolders && servedFolders.length > 0 ? fetchMarketHistory : undefined,
    csvFilename: `${d.csvPrefix}-${market.key}-${wallet.slice(0, 10)}-activity.csv`,
  });
  // The event route draws the sub-nav and the event's card in page mode with
  // the shared column; no position card, no flows panel.
  const onEventPage = useParams<{ eventId?: string }>()?.eventId != null;

  return (
    <FlowFocusContext.Provider value={flows.focus}>
      <CompoundFlowReplayContext.Provider value={flows.replay}>
        <section id={`market-${market.key}`} className="scroll-mt-20 space-y-6">
          {!onEventPage && (
            <CompoundPositionCard
              v={view}
              surface="detail"
              viewHref={tl.viewHref}
              vocab={vocab}
              session={d.session}
              lane={d.lane ? { ...d.lane, source: captureSource } : undefined}
              pagePath={
                d.marketHref ? d.marketHref(market.key, wallet) : `${d.walletHref(wallet)}#market-${market.key}`
              }
              exports={exports}
              // The risk headline and the panel's room and absorb rows from the
              // Comet read; a stale read states no figure, so it draws none.
              live={chain && !live ? undefined : live}
              explanation={
                view.status !== "open" ? (
                  <CompoundClosedPositionExplanation v={view} principalOnly={!replay?.baseAtChain} />
                ) : live ? (
                  <CompoundPositionExplanation
                    chain={live}
                    collateralUsd={sideUsd.supplyUsd}
                    debtUsd={sideUsd.borrowUsd}
                    externalActivity={externalActivity}
                  />
                ) : undefined
              }
            />
          )}

          {/* Lifetime flows: the bars and the line over this market's replay
          (lib/compound/flows.ts), in place of the tower (TO-DO-ui-jobs 206).
          A store whose confirmation is pending holds the panel back; the
          footer's confirmation line says the flows wait for it. */}
          {!onEventPage && timelineState === "ready" && (!d.askUntilWhole || sweptClean) && (
            <LifetimeFlowsPanel
              scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
              read={flows.read}
              explanation={
                <div className="space-y-2 text-sm text-rb-500">
                  <CompoundFlowsNote
                    facts={flows.facts}
                    baseSymbol={market.baseSymbol}
                    ethQuoted={market.quoteUnit === "ETH"}
                  />
                </div>
              }
              learnMore={compoundFlowsContent()}
            />
          )}

          {timelineState === "ready" && timeline ? (
            <ChainTruthTimeline
              // Matches `CompoundEventCard`'s own `persistKey={`compound:${event.id}`}`
              // — lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount. Only ONE
              // `MarketSection` ever mounts this component while an `eventId` is
              // on the URL — see `renderedSectionsWithViews` above for why (this
              // page holds one section per market, each with its own timeline).
              persistKeyPrefix="compound"
              eventPage={(slot) => compoundExplorer.eventPage({ ...slot, wallet, deployment: d.explorerDeployment })}
              closed={view.status !== "open"}
              tl={tl}
              // Both grouping paths: the spec groups a flat answer in the browser,
              // the register draws the folders the route served.
              runs={COMPOUND_LIQUIDATION_RUNS}
              folderRegister={COMPOUND_FOLDER_REGISTER}
              readFolderMembers={readFolderMembers}
              segments={segments}
              // Tenure-first header: when the wallet's activity in THIS market
              // started — the replay's own first-event date, resolved from the
              // market's oldest row even when the drawn list is a capped slice
              // that starts much later. The coverage's `firstEventAt` is the
              // wallet's oldest event across every market, which is a different
              // date, so it is not the one used here.
              toolbarLeading={
                <TimelineActivityHeader
                  events={compoundEvents}
                  folders={servedFolders}
                  closed={view.status !== "open"}
                  firstAt={replay?.firstEventAt ?? null}
                />
              }
              emptyLabel={
                !sweptClean
                  ? d.words.emptyNotWhole
                  : holds
                    ? d.words.heldNoEvent(captureSource !== "sweep")
                    : d.words.emptyMarket
              }
              footer={<TimelineCoverageFooter coverage={timeline.coverage} sourceLabel={d.sourceLabel} />}
              footerWhileMore={<TimelineConfirmationFooter coverage={timeline.coverage} />}
              // On a grouped answer the list covers the market's `eventsServed`; a
              // month read holds no card, the grid holding the other months.
              boundary={
                tl.historyWindow.state === "span"
                  ? null
                  : boundaryFromChainCoverage(
                      { ...timeline.coverage, omitted: replay?.omitted },
                      rows ? rows.eventsServed : compoundEvents.length,
                    )
              }
              renderCard={(event, meta) =>
                isCompoundEvent(event) ? (
                  <CompoundEventCard
                    event={event}
                    eventNumber={meta.eventNumber}
                    isLast={meta.isLast}
                    siblings={siblingsByTx.get(event.txHash) ?? [event]}
                    previous={previousById.get(event.id)}
                    previousTx={previousByTx.get(event.txHash)}
                  />
                ) : null
              }
            />
          ) : timelineState === "loading" ? (
            <SweepInFlight>{d.words.reading}</SweepInFlight>
          ) : timelineState === "first-read" ? (
            <StoreFirstRead words={d.words.firstRead} stalled={firstReadStalled} />
          ) : (
            <p
              className="py-6 text-center text-sm text-rb-500"
              data-history-over-budget={timelineState === "overBudget" ? "" : undefined}
            >
              {timelineState === "overBudget"
                ? (d.words.overBudget?.(retryWhen(retryIn)) ?? d.words.unavailable)
                : timelineState === "unavailable"
                  ? d.words.unavailable
                  : d.words.failed}
            </p>
          )}
        </section>
      </CompoundFlowReplayContext.Provider>
    </FlowFocusContext.Provider>
  );
}

export interface CompoundWalletViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** Every Comet's answer about this account, read on the server. `null` means
   *  the read failed (or came back a stale stub) and the effect below reads it
   *  from the browser exactly as this page always did. */
  initialWallet: CompoundWalletChainResponse | null;
  /** The history in the route's own wire shape, present when the index
   *  vouched for the whole life — or, for one of the six addresses too heavy
   *  to send whole, for the horizon it states instead, which the coverage
   *  carries and `sweptClean` below reads. `null` means the client sweeps, as
   *  before. */
  initialTimeline: unknown | null;
  /** The roster key of the one market this page draws. Absent, the page draws
   *  every market the wallet touched. */
  market?: string;
}

export function CompoundWalletView({
  deployment: d,
  wallet,
  initialWallet,
  initialTimeline,
  market: onlyMarket,
}: CompoundWalletViewProps & { deployment: CompoundPageDeployment }) {
  const seeded = initialWallet != null;
  // Rehydrated through the same function the fetch client runs on a response
  // body, so a seeded timeline and a fetched one are the same object.
  const timelineSeeded = initialTimeline != null;

  const [data, setData] = useState<CompoundWalletChainResponse | null>(initialWallet);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<CompoundBaseTimeline | null>(() =>
    initialTimeline != null ? (rehydrateChainTimelineWire(initialTimeline) as CompoundBaseTimeline) : null,
  );
  const [timelineState, setTimelineState] = useState<TimelineState>(timelineSeeded ? "ready" : "loading");
  // The event route renders this same view, flat: pinned mode finds its card
  // among the served events, and a folder's members arrive only when opened.
  const pinnedRouteParams = useParams<{ eventId?: string | string[] }>();
  const pinnedRoute = pinnedRouteParams?.eventId != null;
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Only when the server could not answer. A seeded view has every Comet's
  // figures in its first paint and never asks again.
  useEffect(() => {
    if (seeded || !wallet) return;
    let cancelled = false;
    setLoading(true);
    fetchCompoundWallet({ wallet, route: d.routes.wallet })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(d.chainStale ? "The read failed — reload to retry." : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the positions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, seeded, d]);

  // The sweep, off the critical path. "Could not sweep" and "swept, found
  // nothing" are kept apart — one is our failure, the other is the history.
  // A store on its first read of this wallet answers "pending"; the page asks
  // again a few times, then states that the read goes on.
  const [firstReadStalled, setFirstReadStalled] = useState(false);
  // A 429 from the store: the page waits out its Retry-After and asks again.
  const { asks: overBudgetAsks, retryIn, wait: waitOverBudget } = useOverBudgetRetry();
  useEffect(() => {
    if (timelineSeeded || !wallet) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pendingAnswers = 0;
    setTimelineState("loading");
    setFirstReadStalled(false);
    const ask = () =>
      fetchChainTimeline<CompoundBaseTimeline>({
        wallet,
        route: d.routes.timeline,
        mark: `${d.csvPrefix}-timeline`,
        // `?folders=0` is the way back to the flat list, the test every grouped
        // page shares; the event route reads flat, its card among the events.
        params: d.grouped && servedFoldersEnabled() && !pinnedRoute ? { group: "1" } : undefined,
      })
        .then((d) => {
          if (cancelled) return;
          setTimeline(d);
          setTimelineState("ready");
        })
        .catch((e) => {
          if (cancelled) return;
          if (e instanceof ChainTimelinePending) {
            setTimelineState("first-read");
            if (++pendingAnswers >= FIRST_READ_ASKS) setFirstReadStalled(true);
            else timer = setTimeout(ask, FIRST_READ_GAP_MS);
            return;
          }
          if (e instanceof ChainTimelineOverBudget) {
            waitOverBudget(e.retryAfterSeconds);
            setTimelineState("overBudget");
            return;
          }
          setTimelineState(e instanceof ChainTimelineUnavailable ? "unavailable" : "failed");
        });
    ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wallet, timelineSeeded, pinnedRoute, d, overBudgetAsks, waitOverBudget]);

  // A history the store has not yet confirmed is asked again for a while, and
  // taken once it is the whole life.
  const confirmationPending =
    d.askUntilWhole === true &&
    timelineState === "ready" &&
    timeline != null &&
    timeline.coverage.confirmation?.status === "unconfirmed";
  useEffect(() => {
    if (!confirmationPending || !wallet) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (cancelled || tries++ >= WHOLE_ASKS) return;
      fetchChainTimeline<CompoundBaseTimeline>({ wallet, route: d.routes.timeline, mark: `${d.csvPrefix}-timeline` })
        .then((t) => {
          if (cancelled) return;
          if (d.wholeOf(t.coverage)) setTimeline(t);
          else timer = setTimeout(retry, WHOLE_GAP_MS);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(retry, WHOLE_GAP_MS);
        });
    };
    timer = setTimeout(retry, WHOLE_GAP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [confirmationPending, wallet, d]);

  // A swept answer carries the amounts moved but no balance with interest, so
  // its rows say "reading…" while the page asks the index again, a few times.
  const [balanceRead, setBalanceRead] = useState<CompoundBalanceRead>(d.balanceRead);
  const swept = d.askIndexAgain && timeline != null && timeline.coverage.source !== "index";
  useEffect(() => {
    if (!swept || !wallet) return;
    let cancelled = false;
    let tries = 0;
    const retry = () => {
      if (cancelled) return;
      if (tries++ >= 4) {
        setBalanceRead("unread");
        return;
      }
      fetchChainTimeline<CompoundBaseTimeline>({
        wallet,
        route: d.routes.timeline,
        mark: `${d.csvPrefix}-timeline`,
        params: d.grouped && servedFoldersEnabled() && !pinnedRoute ? { group: "1" } : undefined,
      })
        .then((d) => {
          if (cancelled) return;
          if (d.coverage.source === "index") setTimeline(d);
          else timer = setTimeout(retry, 8000);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(retry, 8000);
        });
    };
    let timer = setTimeout(retry, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [swept, wallet, pinnedRoute, d]);

  const events = useMemo<BaseActivityEvent[]>(() => timeline?.events ?? [], [timeline]);
  // A market page's events are its market's; `untouched` below reads the
  // whole wallet's from `events`.
  const compoundEvents = useMemo(
    () => events.filter(isCompoundEvent).filter((e) => onlyMarket == null || e.context.data.market === onlyMarket),
    [events, onlyMarket],
  );

  // Which capture answered. The receipts' custody line and the footer's
  // whole-life sentence read from this.
  const captureSource: CaptureSource = d.captureSourceOf(timeline?.coverage);

  // "The history covers every block of the deployment's life." Both conditions
  // are needed: no holes inside the span, AND the span reaching the earliest
  // Comet's first block (an index read is served only when both hold). A horizon leaves the events contiguous but the
  // history starting later than the protocol, which is enough to disqualify a
  // lifetime total from the words "all time".
  // The deployment states the rule (`wholeOf`): Arbitrum's also needs the
  // store's history confirmed against the chain.
  const sweptClean = timelineState === "ready" && timeline != null && d.wholeOf(timeline.coverage);

  // The sections: every market the Comets say the wallet holds something in,
  // plus every market the sweep saw it touch — roster order. A market on one
  // list and not the other is a section either way (see the header).
  const sections = useMemo<Section[]>(
    () =>
      d.deployment.markets
        .map((market) => ({
          market,
          chain: data && !data.chainStale ? (data.positions.find((p) => p.market === market.key) ?? null) : null,
          replay: timeline?.markets.find((r) => r.market === market.key) ?? null,
        }))
        .filter((s) => s.chain != null || s.replay != null)
        .filter((s) => onlyMarket == null || s.market.key === onlyMarket),
    [data, timeline, d, onlyMarket],
  );

  // Every token each section's card, tower or lifetime layer could price: the
  // base, the held collateral, and every collateral asset the history ever
  // moved (a withdrawn asset is priced by nothing else on the page). One shot
  // per wallet once the sweep has settled either way, so the lifetime assets
  // are known; a token a market will not price stays unpriced rather than
  // driving a retry loop.
  const pricedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      sections.length === 0 ||
      timelineState === "loading" ||
      timelineState === "first-read" ||
      timelineState === "overBudget"
    )
      return;
    if (pricedRef.current === wallet) return;
    const pairs = new Set<string>();
    for (const s of sections) {
      const key = s.market.key;
      pairs.add(`${key}:${s.market.baseToken.toLowerCase()}`);
      for (const c of s.chain?.collateral ?? []) pairs.add(`${key}:${c.address.toLowerCase()}`);
      for (const a of Object.keys(s.replay?.lifetime.collateral ?? {})) pairs.add(`${key}:${a}`);
      for (const c of s.replay?.peak.collateral ?? []) pairs.add(`${key}:${c.address}`);
    }
    // The answer is kept however the sections change while it is in flight:
    // the prices are this wallet's either way, and dropping them left the
    // one-shot guard set with nothing priced (the card's dollar totals and
    // the flows panel stayed token-only).
    pricedRef.current = wallet;
    const forWallet = wallet;
    fetchCometPrices(d.routes.prices, [...pairs])
      .then((p) => {
        if (pricedRef.current !== forWallet) return;
        if (Object.keys(p).length > 0) setPrices(p);
        else pricedRef.current = null;
      })
      .catch(() => {
        // Nothing priced: the next change may ask again.
        if (pricedRef.current === forWallet) pricedRef.current = null;
      });
  }, [sections, timelineState, wallet, d]);

  const views = useMemo(
    () =>
      sections.map((s) =>
        // `sweptClean` is the last argument for the reason it is the last
        // clause everywhere else on this page: the principal, the peaks, the
        // transaction count and the last-activity stamp are claims about the
        // WHOLE life, and a horizoned history — the API's heavy answer, or a
        // capped sweep — has not read one.
        cometViewFromChain(s.market, wallet, s.chain, s.replay, pricesFor(prices, s.market.key), sweptClean),
      ),
    [sections, wallet, prices, sweptClean],
  );

  // A market's own `ChainTruthTimeline` reads `event/[eventId]` off the URL
  // itself (see chain-truth-timeline.tsx's pinned-mode branch) — it has no
  // way to know it is one of SEVERAL sections on this page, so every section
  // would enter pinned mode at once: the one holding the event draws it, and
  // every other draws a "not found" notice for an event that is not missing,
  // only in a different market. Filtering the RENDERED sections down to the
  // one that actually holds the pinned event is a page-level fix — it keeps
  // that ambiguity out of the shared component (whose own general fix, a
  // `sharePath` redirect prop, belongs to whichever change owns that file
  // next) while still landing on exactly one card here, the same as every
  // single-section family. An id this page cannot place (fabricated, or
  // older than the served window) falls through to every section unfiltered,
  // each stating its own "not found" — the pre-existing behaviour.
  const rawPinnedEventId = Array.isArray(pinnedRouteParams.eventId)
    ? pinnedRouteParams.eventId[0]
    : pinnedRouteParams.eventId;
  const pinnedEventId = rawPinnedEventId != null ? decodeEventId(rawPinnedEventId) : null;
  const pinnedMarketKey = useMemo(
    () => (pinnedEventId ? (compoundEvents.find((e) => e.id === pinnedEventId)?.context.data.market ?? null) : null),
    [pinnedEventId, compoundEvents],
  );
  const sectionsWithViews = useMemo(() => sections.map((s, i) => ({ s, view: views[i] })), [sections, views]);
  const renderedSectionsWithViews = pinnedMarketKey
    ? sectionsWithViews.filter(({ s }) => s.market.key === pinnedMarketKey)
    : sectionsWithViews;

  // A listing row links to its market's card (#market-<key>); the cards
  // render after the Comet read lands, too late for the browser's own jump.
  const sectionCount = renderedSectionsWithViews.length;
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || sectionCount === 0) return;
    const id = window.location.hash.slice(1);
    if (!id.startsWith("market-")) return;
    jumped.current = true;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [sectionCount]);

  // Silence is only evidence of absence when someone actually listened: a
  // sweep that could not read the chain also comes back with no events, and a
  // Comet read that failed also holds nothing.
  // On a grouped answer the lists cover `eventsServed`, folder members
  // included; `events` holds only the ungrouped ones.
  const untouched =
    data != null &&
    !data.chainStale &&
    data.positionsFound === 0 &&
    sweptClean &&
    (timeline?.grouped ? (timeline.eventsServed ?? 0) : events.length) === 0 &&
    (timeline?.coverage.omitted?.count ?? 0) === 0;

  // Every market's folders, whole: the export states and fetches what they
  // hold, since their members are not among `events`.
  const allFolders = useMemo<ServedFolder[] | null>(() => {
    if (!timeline?.grouped || !timeline.marketRows) return null;
    const out: ServedFolder[] = [];
    for (const m of Object.values(timeline.marketRows))
      for (const r of m.rowPlan) if (r.kind === "folder") out.push(r.folder);
    return out;
  }, [timeline]);

  // The CSV on a grouped page: the rows in chain order, each folder opened for
  // its members. `missing` is what no answer lists — a seeded wallet's rows
  // before its seed, or rows below the row cap — and a download short by any
  // of them does not happen.
  const fetchAllHistory = useCallback(async (): Promise<WholeHistoryFetch> => {
    const all: BaseActivityEvent[] = [...compoundEvents];
    for (const f of allFolders ?? []) {
      const opened = await fetchTimelineFolderMembers({
        path: d.routes.folder ?? d.routes.timeline,
        params: { wallet },
        folder: f.responseId,
      });
      all.push(...opened.events);
    }
    all.sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
    return { events: all, missing: timeline?.coverage.omitted?.count ?? 0 };
  }, [compoundEvents, allFolders, wallet, timeline, d]);

  const chainByMarket = useMemo(
    () => Object.fromEntries(sections.flatMap((s) => (s.chain ? [[s.market.key, s.chain] as const] : []))),
    [sections],
  );

  // Ambient oracle-price pill: every priced token the wallet holds, in its
  // market's own unit converted to dollars by the protocol's own feeds.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const v of views) {
      if (v.status !== "open") continue;
      const assets = [
        { symbol: v.base.symbol, address: v.base.address },
        ...v.collateral.filter((c) => c.amount > 0).map((c) => ({ symbol: c.symbol, address: c.address })),
      ];
      for (const a of assets) {
        const addr = a.address.toLowerCase();
        if (seen.has(addr)) continue;
        const p = v.priceByAddress?.[addr];
        if (typeof p === "number" && p > 0) {
          seen.add(addr);
          out.push({ symbol: a.symbol, address: a.address, price: p });
        }
      }
    }
    return out;
  }, [views]);

  return (
    <CaptureSourceProvider value={captureSource}>
      <CompoundBalanceReadProvider value={balanceRead}>
        <CometDeploymentProvider deployment={d.deployment}>
          <div className="py-8 space-y-6">
            <DetailTopRow
              session={d.session}
              wallet={wallet}
              owner={{ wallet }}
              assets={stripAssets}
              closed={views.length > 0 && views.every((v) => v.status !== "open")}
              // Each market's card carries its exports on its ⋮; the event
              // route, which draws no card, keeps the wallet's in the Tools.
              tools={pinnedRoute}
            >
              {pinnedRoute && views.length > 0 && (
                <ExportMenu
                  {...compoundExports({
                    wallet,
                    views,
                    chainByMarket,
                    events: compoundEvents,
                    history: markdownHistoryScope(undefined, compoundEvents, allFolders),
                    scopeNote: exportScopeNote(undefined, compoundEvents, "this wallet's whole history", allFolders),
                    fetchAllEvents: allFolders && allFolders.length > 0 ? fetchAllHistory : undefined,
                    csvFilename: `${d.csvPrefix}-${wallet.slice(0, 10)}-activity.csv`,
                  })}
                />
              )}
            </DetailTopRow>

            {loading ? (
              <DetailBodySkeleton />
            ) : error ? (
              <div className="py-12 text-center text-rb-500">
                <p className="mb-1">Couldn&apos;t read this wallet&apos;s positions.</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : untouched ? (
              <div className="py-12 text-center text-rb-500">
                <p className="mb-1">{d.words.untouchedTitle}</p>
                <p className="text-sm">{d.words.untouchedBody(data?.marketsScanned)}</p>
              </div>
            ) : onlyMarket != null && sections.length === 0 ? (
              // A market page whose Comet holds nothing for the wallet and
              // whose history names it in no event. The wallet's other
              // markets are on the overview.
              <div className="py-12 text-center text-rb-500">
                <p className="mb-1">
                  {sweptClean ? d.words.emptyMarket : (d.words.emptyMarketNow ?? d.words.emptyMarket)}
                </p>
                {!sweptClean && (
                  <p className="text-sm">
                    {timelineState === "loading" || timelineState === "first-read"
                      ? d.words.emptyNowHistory.loading
                      : timelineState === "ready"
                        ? d.words.emptyNowHistory.notWhole
                        : timelineState === "overBudget" && d.words.emptyNowHistory.overBudget
                          ? d.words.emptyNowHistory.overBudget(retryWhen(retryIn))
                          : d.words.emptyNowHistory.failed}
                  </p>
                )}
                <p className="mt-3 text-sm">
                  <Link href={d.walletHref(wallet)} className="text-blue-500 hover:underline">
                    Every market this wallet has touched
                  </Link>
                </p>
              </div>
            ) : sections.length === 0 ? (
              // The Comets hold nothing for this wallet and the sweep could not
              // say whether it ever did: the two facts are stated apart.
              <div className="py-12 text-center text-rb-500">
                <p className="mb-1">{d.words.emptyNowTitle}</p>
                <p className="text-sm">
                  All {data?.marketsScanned} markets were asked, and none holds a balance, a debt or collateral for this
                  address.{" "}
                  {timelineState === "loading" || timelineState === "first-read"
                    ? d.words.emptyNowHistory.loading
                    : timelineState === "ready"
                      ? d.words.emptyNowHistory.notWhole
                      : timelineState === "overBudget" && d.words.emptyNowHistory.overBudget
                        ? d.words.emptyNowHistory.overBudget(retryWhen(retryIn))
                        : d.words.emptyNowHistory.failed}
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {!pinnedRoute && onlyMarket == null && (
                  <p className="text-[11px] text-rb-500">
                    This wallet has a position in{" "}
                    <span className="text-foreground">
                      {sections.length} of {d.words.chainPossessive}{" "}
                      {data?.marketsScanned ?? d.deployment.markets.length}
                    </span>{" "}
                    Compound markets; the others hold nothing for it. Each market is separate: nothing is
                    cross-collateralised between them, so there is no combined health factor here and no total — the
                    markets do not all price in the same unit.
                  </p>
                )}
                {renderedSectionsWithViews.map(({ s, view }) => (
                  <MarketSection
                    d={d}
                    key={s.market.key}
                    section={s}
                    wallet={wallet}
                    view={view}
                    events={compoundEvents.filter((e) => e.context.data.market === s.market.key)}
                    timeline={timeline}
                    timelineState={timelineState}
                    firstReadStalled={firstReadStalled}
                    retryIn={retryIn}
                    sweptClean={sweptClean}
                    captureSource={captureSource}
                  />
                ))}
              </div>
            )}

            <ProvInspectorLayer />
          </div>
        </CometDeploymentProvider>
      </CompoundBalanceReadProvider>
    </CaptureSourceProvider>
  );
}
