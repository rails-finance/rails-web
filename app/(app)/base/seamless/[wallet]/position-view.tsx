"use client";

// One wallet's Seamless position on Base — state, economics and whole history.
//
// Structurally the Aave V3 Base page, because Seamless is an Aave V3 fork and
// the same readers, cards and tower serve both. What differs is this market's
// own Pool, its own oracle and its own receipts — and one fact about the market
// itself that changes what the surfaces mean rather than how they are built.
//
// SEAMLESS IS CLOSED. All eighteen reserves were frozen in one transaction in
// April 2025 (lib/seamless/asset-catalog.ts), so no wallet can open a position
// here and no position can grow. Every history this page draws is therefore
// finished business in the part that matters — the supplies and borrows are all
// behind it — even though the timeline is not frozen: repayments, withdrawals
// and liquidations remain possible on a frozen reserve, so events keep arriving
// and the sweep runs to the head like any other. The card's explanation
// drawer says so once (<AaveV3PoolNotes frozen>), rather than the card face
// differing from every other Aave-shaped card.
//
// Three reads, in the order they can answer: the Pool (fast, feeds the card),
// the history (feeds the timeline, the tower's lifetime layer and the card's
// own history), then the oracle for every reserve the position ever touched.
//
// The first two are done on the SERVER and handed down as `initialPosition` and
// `initialTimeline` — the history only when it came from the index, because a
// sweep of the Pool's own logs runs 3-30s and cannot be awaited in a render.
// The effects below are the branch for whatever the server did not seed. The
// history's completeness is a property of the request rather than of the
// explorer, so it is stated under the last event.

import type { AaveLaneInterest } from "@/lib/aave-v3/lane-interest";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

import { AaveV3PositionCard } from "@/components/protocol/aave-v3/aave-v3-position-card";
import {
  AaveV3ClosedPositionExplanation,
  AaveV3PositionExplanation,
} from "@/components/protocol/aave-v3/aave-v3-position-explanation";
import { AaveV3PoolNotes, type AaveV3FrozenMarket } from "@/components/protocol/aave-v3/aave-v3-pool-notes";
import { AaveV3RiskSlot } from "@/components/protocol/aave-v3/aave-v3-risk-slot";
import { AaveV3CtEventCard } from "@/components/protocol/aave-v3/aave-v3-ct-event-card";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { TimelineFillWell } from "@/components/shared/timeline-fill-well";
import { TimelineCoverageFooter } from "@/components/shared/timeline-coverage-footer";
import { boundaryFromChainCoverage } from "@/lib/shared/timeline-boundary";
import { TimelineActivityHeader, CHAIN_TRUTH_USD_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { CaptureSourceProvider } from "@/lib/shared/capture-source";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { eventsBelowLife, replaySegmentReads, type ReplayGroupedFields } from "@/lib/api/fetch-replay-segment";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import { WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import { interleaveRowPlan, servedFoldersEnabled, type GroupedTimelineFields } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import { AAVE_V3_FOLDER_REGISTER, AAVE_V3_TIMELINE_RUNS } from "@/lib/aave-v3/timeline-runs";
import {
  computeAaveV3CardCaptions,
  computeAaveV3Economics,
  unpricedAaveV3FlowAddresses,
} from "@/lib/aave-v3/chain-truth-tower";
import { aaveV3EconomicsExplanation, aaveV3EconomicsContent } from "@/lib/aave-v3/economics-explanation";
import { v3ViewFromChain, type V3SweptHistory } from "@/lib/aave-v3/chain-position-view";
import { V3PoolProvider, type V3PoolIdentity } from "@/lib/aave-v3/pool-context";
import { SEAMLESS_LIVE_CARD_DEPLOYMENT, SEAMLESS_TOWER_VOCABULARY } from "@/lib/seamless/position-provenance";
import {
  SEAMLESS_CHAIN_ID,
  SEAMLESS_FREEZE_BLOCK,
  SEAMLESS_FREEZE_DATE,
  SEAMLESS_FREEZE_TX,
  SEAMLESS_POOL,
} from "@/lib/seamless/asset-catalog";
import { fetchAaveV3Position, type AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import {
  ChainTimelineUnavailable,
  fetchChainTimeline,
  type ChainTimelineResponse,
} from "@/lib/api/fetch-chain-timeline";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { SweepInFlight } from "@/components/shared/sweep-in-flight";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, as on the Ethereum page.
const AaveV3ExportMenu = dynamic(
  () => import("@/components/protocol/aave-v3/aave-v3-export-menu").then((m) => m.AaveV3ExportMenu),
  { ssr: false },
);

const POSITION_ROUTE = "/api/chain/seamless/position";
const TIMELINE_ROUTE = "/api/chain/seamless/timeline";
const FOLDER_ROUTE = "/api/chain/seamless/timeline/folder";

/** The history as the route answers it: flat, or — asked `?group=1`, the
 *  page default — as ROWS, where `events` holds only the ungrouped events and
 *  `rowPlan` puts the folders back between them
 *  (lib/aave-v3-base/timeline-folders.ts). A history the index cannot vouch
 *  for is answered flat either way, and reads as flat here. */
type BaseTimeline = ChainTimelineResponse & ReplayGroupedFields;
const PRICES_ROUTE = "/api/chain/seamless/oracle-prices";

/** The Pool, named for the coverage footer's "swept X from its first block". */
const SOURCE_LABEL = "the Seamless Pool";

/** What every receipt on this page names as the contract behind its value —
 *  Seamless's own Pool, not the Aave Pool whose interface it answers — and
 *  the route the live read came through. */
const POOL_IDENTITY: V3PoolIdentity = {
  name: "Seamless Pool",
  protocol: "Seamless",
  address: SEAMLESS_POOL,
  positionRoute: POSITION_ROUTE,
};

/** The freeze, for the explanation drawer's one Seamless-specific sentence. */
const FROZEN: AaveV3FrozenMarket = {
  chainId: SEAMLESS_CHAIN_ID,
  tx: SEAMLESS_FREEZE_TX,
  block: SEAMLESS_FREEZE_BLOCK,
  date: SEAMLESS_FREEZE_DATE,
};

async function fetchSeamlessPrices(assets: string[]): Promise<Record<string, number>> {
  if (assets.length === 0) return {};
  const res = await fetch(`${PRICES_ROUTE}?assets=${assets.join(",")}`, { cache: "no-store" });
  if (!res.ok) return {};
  const data = (await res.json()) as { prices?: Record<string, number> };
  return data.prices ?? {};
}

interface SeamlessPositionViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** The Pool's own read of this account, done on the server. `null` means the
   *  server could not answer (or answered with a stale stub), and the effect
   *  below reads it from the browser exactly as this page always did. */
  initialPosition: AaveV3PositionChainResponse | null;
  /** The history in the route's own wire shape, present when the index
   *  vouched for the whole life — or, for one of the handful of addresses too
   *  heavy to send whole, for the horizon it states instead, which the
   *  coverage carries and `sweptClean` below reads. `null` means the client
   *  sweeps, exactly as it always did. */
  initialTimeline: unknown | null;
}

export default function SeamlessPositionView({ wallet, initialPosition, initialTimeline }: SeamlessPositionViewProps) {
  // The Pool read is the whole of this page's server half — the sweep is not,
  // and its own effect runs on every visit regardless.
  const seeded = initialPosition != null;

  const [data, setData] = useState<AaveV3PositionChainResponse | null>(initialPosition);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  // Rehydrated through the same function the fetch client runs on a response
  // body, so a seeded timeline and a fetched one are the same object.
  const timelineSeeded = initialTimeline != null;
  const [timeline, setTimeline] = useState<BaseTimeline | null>(() =>
    initialTimeline != null ? (rehydrateChainTimelineWire(initialTimeline) as BaseTimeline) : null,
  );
  // The event route renders this same view, flat: pinned mode finds its card
  // among the served events, and a folder's members arrive only when opened.
  const routeParams = useParams<{ eventId?: string | string[] }>();
  const pinnedRoute = routeParams?.eventId != null;
  const [timelineState, setTimelineState] = useState<"loading" | "ready" | "unavailable" | "failed">(
    timelineSeeded ? "ready" : "loading",
  );
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Only when the server could not answer. A seeded view has the card's
  // figures in its first paint and never asks again.
  useEffect(() => {
    if (seeded || !wallet) return;
    let cancelled = false;
    setLoading(true);
    fetchAaveV3Position({ wallet, route: POSITION_ROUTE })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(d.chainStale ? "The read failed — reload to retry." : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the position");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, seeded]);

  // The sweep, off the critical path. "Could not sweep" and "swept, found
  // nothing" are kept apart — one is our failure, the other is the history.
  useEffect(() => {
    if (timelineSeeded || !wallet) return;
    let cancelled = false;
    setTimelineState("loading");
    fetchChainTimeline<BaseTimeline>({
      wallet,
      route: TIMELINE_ROUTE,
      mark: "seamless-timeline",
      // `?folders=0` is the way back to the flat list, the test every grouped
      // page shares.
      params: servedFoldersEnabled() && !pinnedRoute ? { group: "1" } : undefined,
    })
      .then((d) => {
        if (cancelled) return;
        setTimeline(d);
        setTimelineState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setTimelineState(e instanceof ChainTimelineUnavailable ? "unavailable" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, timelineSeeded, pinnedRoute]);

  const events = useMemo<BaseActivityEvent[]>(() => timeline?.events ?? [], [timeline]);
  const aaveEvents = useMemo(() => events.filter(isAaveV3Event), [events]);

  // The served list as ROWS, when the route grouped it; the plan and the
  // events it interleaves come from one answer.
  const servedRows = useMemo(
    () => (timeline?.grouped && timeline.rowPlan ? interleaveRowPlan(timeline.rowPlan, aaveEvents) : undefined),
    [timeline, aaveEvents],
  );
  /** The folders, whole and unfiltered. Every whole-history claim below that
   *  is reduced over `aaveEvents` adds them, or states nothing it cannot. The
   *  tower, the card's counts and the peaks need nothing: the route replayed
   *  every row before it grouped, and those figures ride the replay. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  const groupedTail = useMemo<GroupedTimelineFields | null>(
    () =>
      timeline?.grouped && timeline.rowPlan && timeline.eventsServed != null
        ? {
            grouped: true,
            rowPlan: timeline.rowPlan,
            eventsServed: timeline.eventsServed,
            boundBy: timeline.boundBy ?? null,
          }
        : null,
    [timeline],
  );
  /** The stamps the activity header measures tenure and freshness from: the
   *  events on the page and each folder's first and last member. */
  const headerStamps = useMemo(
    () =>
      servedFolders && servedFolders.length > 0
        ? [...aaveEvents, ...servedFolders.flatMap((f) => [{ timestamp: f.firstAt }, { timestamp: f.lastAt }])]
        : aaveEvents,
    [aaveEvents, servedFolders],
  );

  // The tower's lifetime layer and the card's captions read THESE, not the
  // events above. The list is capped for a long history; these sums are not,
  // so "all time" and "incl. interest" stay true.
  const lifetime = timeline?.lifetime;
  const laneInterest = (timeline as { laneInterest?: AaveLaneInterest[] } | null)?.laneInterest;

  // "The sweep read every block of this Pool's life." Both conditions are
  // needed: no holes inside the span, AND the span reaching the Pool's own
  // first block. A horizon leaves the events contiguous but the history
  // starting later than the protocol, which is enough to disqualify a lifetime
  // total from the words "all time" — and a peak from "highest recorded".
  // Which store the events reached the page through — the coverage says.
  // The route serves the index when it can vouch for the whole life and
  // sweeps the chain otherwise, and the receipts' custody line and the
  // footer must name the one that actually answered.
  const captureSource = timeline?.coverage.source === "index" ? "index" : "sweep";
  const sweptClean =
    timelineState === "ready" &&
    (timeline?.coverage.gaps.length ?? 0) === 0 &&
    timeline?.coverage.fromDeployment === true;

  // The sweep as the card view consumes it: only a WHOLE sweep fills the peaks
  // and the activity meta (lib/aave-v3/chain-position-view).
  const history = useMemo<V3SweptHistory | null>(
    () => (timeline ? { timeline, whole: sweptClean } : null),
    [timeline, sweptClean],
  );

  // Every reserve the position holds now, plus every reserve its history ever
  // moved. One shot per wallet: an asset the oracle will not price stays
  // unpriced rather than driving a retry loop.
  const pricedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.chainStale) return;
    if (pricedRef.current === wallet) return;
    const view = v3ViewFromChain(data, "seamless", undefined, events);
    const wanted = new Set<string>(view.supplies.concat(view.borrows).map((r) => r.address.toLowerCase()));
    for (const a of unpricedAaveV3FlowAddresses(view, events, timeline?.lifetime)) wanted.add(a);
    if (wanted.size === 0) return;
    pricedRef.current = wallet;
    let cancelled = false;
    fetchSeamlessPrices([...wanted])
      .then((p) => {
        if (!cancelled && Object.keys(p).length > 0) setPrices(p);
      })
      .catch(() => {
        // The tower stays on the token-only list, which is what no price means.
      });
    return () => {
      cancelled = true;
    };
  }, [data, events, timeline, wallet]);

  const view = useMemo(
    () => (data && !data.chainStale ? v3ViewFromChain(data, "seamless", prices, events, history) : null),
    [data, prices, events, history],
  );

  // The month read (hooks/useTimelineSegment.ts): a month the preload does
  // not hold is sliced from the route's replay (`&from=&to=`), whose running
  // figures are the whole replay's. Months below a seed's cut have no day
  // counts, so the grid draws them and refuses the click; the boundary card
  // states them.
  const segmentReads = useMemo(() => replaySegmentReads(TIMELINE_ROUTE, wallet), [wallet]);
  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events: aaveEvents,
    groupedTail,
    servedRows,
    servedFolders,
    opening: null,
    lifeBelow: timeline?.belowByDay,
    eventsBelowLife: eventsBelowLife(timeline?.coverage.omitted?.count, timeline?.belowByDay),
    // The rows before the trim, so numbering runs over the whole history and
    // the count line states the real total (rails-ops decision 0019).
    olderCount: timeline?.coverage.omitted?.count ?? 0,
    historyWindow: WHOLE_HISTORY,
    isEvent: isAaveV3Event,
    readGrouped: segmentReads.readGrouped,
    readFlat: segmentReads.readFlat,
    folderPath: FOLDER_ROUTE,
    folderParams: { wallet },
    storageKey: `seamless-${wallet}`,
    protocolKey: "aave-v3",
  });

  // The CSV on a grouped page: the rows in the order the route served them,
  // each folder opened for its members. `missing` is what no answer lists —
  // a seeded wallet's rows before its seed, or rows below the row cap — and a
  // download short by any of them does not happen.
  const fetchAllHistory = useCallback(async (): Promise<WholeHistoryFetch> => {
    const all: BaseActivityEvent[] = [];
    for (const row of servedRows ?? []) {
      if (row.kind === "event") {
        all.push(row.event);
        continue;
      }
      const opened = await fetchTimelineFolderMembers({
        path: FOLDER_ROUTE,
        params: { wallet },
        folder: row.folder.responseId,
      });
      all.push(...opened.events);
    }
    return { events: all, missing: timeline?.coverage.omitted?.count ?? 0 };
  }, [servedRows, wallet, timeline]);

  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole history so the
  // Explanation can state it once.
  const externalActivity = useMemo(
    () =>
      withFolderActors(
        summariseExternalActors(
          aaveEvents.map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.poolCaller,
            wallet: e.wallet,
          })),
        ),
        servedFolders,
      ),
    [aaveEvents, servedFolders],
  );

  // Stat captions (accrued interest, borrow rate). The rate rides the Pool
  // read; the interest split attributes against the sweep's WHOLE-life sums —
  // and only when the sweep read every block, because an attribution against
  // a partial history would call missed principal "interest".
  const captions = useMemo(
    () => (view && data ? computeAaveV3CardCaptions(view, undefined, data, sweptClean ? lifetime : undefined) : null),
    [view, data, sweptClean, lifetime],
  );

  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view) return [];
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const r of [...view.supplies, ...view.borrows]) {
      const a = r.address.toLowerCase();
      if (seen.has(a)) continue;
      seen.add(a);
      const p = prices[a];
      if (typeof p === "number" && p > 0) out.push({ symbol: r.symbol, address: r.address, price: p });
    }
    return out;
  }, [view, prices]);

  // Silence is only evidence of absence when someone actually listened: a sweep
  // that could not read the chain also comes back with no events.
  const untouched =
    data != null &&
    !data.chainStale &&
    data.totalCollateralUsd === 0 &&
    data.totalDebtUsd === 0 &&
    data.reserves.length === 0 &&
    sweptClean &&
    // On a grouped answer the list covers `eventsServed`, folder members
    // included; `events` holds only the ungrouped ones.
    (timeline?.grouped ? (timeline.eventsServed ?? 0) : events.length) === 0 &&
    // A seeded heavy wallet can draw no rows at all — its whole life sits
    // before the seed's cut and travelled as state. That is not "never
    // touched": the boundary card states the count (rails-ops decision 0019).
    (timeline?.coverage.omitted?.count ?? 0) === 0;

  // The Pool says this account holds nothing. That alone does not say which of
  // two accounts it is — one that closed, or one that was never opened — and
  // only the history separates them. Until it answers, the card must not pick:
  // given no balances and no events it reads the account as CLOSED and narrates
  // a life it cannot see, dating "its record closed on" from the Unix epoch.
  // That was a flash while the sweep ran and the client held the page; rendered
  // on the server it would be the account's permanent machine-readable record.
  const nothingOnChain = view != null && view.status !== "open";
  const historyPending = nothingOnChain && timelineState === "loading";
  const historyUnread = nothingOnChain && (timelineState === "failed" || timelineState === "unavailable");

  // The tower's lifetime layer is labelled "all time" and is only entitled to
  // that word if the sweep read every block. A holed sweep keeps the bars (the
  // current state comes from the Pool, not the logs) and drops the flows.
  const towerData = useMemo(() => {
    if (!view) return null;
    const built = computeAaveV3Economics(
      view,
      undefined,
      SEAMLESS_TOWER_VOCABULARY,
      sweptClean ? lifetime : undefined,
      // Each lane's net moved beside its chain balance (decision 0033): a side
      // holding one reserve splits into that net and the interest on top.
      sweptClean ? laneInterest : undefined,
    );
    return sweptClean
      ? built
      : {
          ...built,
          flowsNote:
            "Lifetime flows are hidden because the history sweep did not read every block of this position's life — see the note under the timeline for where it stopped or what it missed. Summing what did arrive would label a partial history “all time”. The current balances above are unaffected: they are read from the Pool, not replayed from the events.",
        };
  }, [view, lifetime, sweptClean, laneInterest]);

  return (
    <CaptureSourceProvider value={captureSource}>
      <V3PoolProvider pool={POOL_IDENTITY}>
        <div className="py-8 space-y-6">
          <DetailTopRow
            session="seamless"
            wallet={wallet}
            assets={stripAssets}
            closed={view != null && view.status !== "open"}
          >
            {view && (
              <AaveV3ExportMenu
                wallet={wallet}
                protocolName="Seamless"
                marketName="Base"
                source={captureSource}
                view={view}
                chain={data}
                captions={captions}
                events={aaveEvents}
                history={markdownHistoryScope(undefined, aaveEvents, servedFolders)}
                scopeNote={exportScopeNote(undefined, aaveEvents, "this wallet's whole history", servedFolders)}
                fetchAllEvents={servedFolders && servedFolders.length > 0 ? fetchAllHistory : undefined}
                csvFilename={`seamless-${wallet.slice(0, 10)}-activity.csv`}
              />
            )}
          </DetailTopRow>

          {loading ? (
            <DetailBodySkeleton />
          ) : error ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">Couldn&apos;t read this position.</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : historyPending ? (
            <SweepInFlight>
              Reading this wallet&rsquo;s whole history from the Pool&rsquo;s logs — the sweep runs from the
              Pool&rsquo;s first block, so it takes a moment.
            </SweepInFlight>
          ) : historyUnread ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">Nothing is supplied or borrowed on this Pool.</p>
              <p className="text-sm">
                Whether this account ever held a position is a question only its history answers, and that read failed.
                Reload to try again.
              </p>
            </div>
          ) : untouched ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">This wallet has never touched Seamless.</p>
              <p className="text-sm">
                No supplied assets, no debt, and no events on the Pool between its first block and now — and because the
                market has been closed to new positions since April 2025, nothing can start here.
              </p>
            </div>
          ) : (
            <>
              {view && data && (
                <AaveV3PositionCard
                  v={view}
                  receipts
                  viewHref={tl.viewHref}
                  deployment={SEAMLESS_LIVE_CARD_DEPLOYMENT}
                  captions={captions ?? undefined}
                  // The risk slot rides the card's heading-button row (the L1
                  // treatment). Shown only with debt — both views need it.
                  rowExtra={
                    view.status === "open" && view.borrows.length > 0 && view.healthFactor != null ? (
                      <AaveV3RiskSlot chain={data} />
                    ) : undefined
                  }
                  // The Explanation: the L1 prose about the face figures, then
                  // what is particular to THIS Pool — eMode, a supply that
                  // backs nothing (pre-3.2 accounting here), and the freeze.
                  explanation={
                    view.status !== "open" ? (
                      <>
                        <AaveV3ClosedPositionExplanation
                          v={view}
                          events={aaveEvents}
                          folders={servedFolders}
                          marketPhrase="Seamless market"
                        />
                        <AaveV3PoolNotes chain={data} collateralAccounting="pre-3.2" frozen={FROZEN} />
                      </>
                    ) : (
                      <>
                        <AaveV3PositionExplanation
                          chain={data}
                          captions={captions}
                          view={view}
                          externalActivity={externalActivity}
                        />
                        <AaveV3PoolNotes chain={data} collateralAccounting="pre-3.2" frozen={FROZEN} />
                      </>
                    )
                  }
                />
              )}

              {towerData && timelineState === "ready" && (
                <ChainTruthTower
                  data={towerData}
                  explanation={aaveV3EconomicsExplanation(towerData, { label: "Seamless" })}
                  learnMore={aaveV3EconomicsContent({ label: "Seamless" })}
                />
              )}

              {timelineState === "ready" && timeline ? (
                <>
                  <TimelineFillWell fill={timeline.coverage.fill} />
                  <ChainTruthTimeline
                    // Matches `AaveV3CtEventCard`'s own
                    // `persistKey={`aave-v3:${event.id}`}` — lets pinned mode
                    // (the per-event share route) force a landed card's detail
                    // panel open on its first mount.
                    persistKeyPrefix="aave-v3"
                    closed={view?.status !== "open"}
                    tl={tl}
                    // Both grouping paths: the specs group a flat answer in the
                    // browser, the register draws the folders the route served.
                    runs={AAVE_V3_TIMELINE_RUNS}
                    folderRegister={AAVE_V3_FOLDER_REGISTER}
                    readFolderMembers={readFolderMembers}
                    segments={segments}
                    displayItems={CHAIN_TRUTH_USD_DISPLAY_ITEMS}
                    toolbarLeading={
                      <TimelineActivityHeader
                        events={headerStamps}
                        closed={view?.status !== "open"}
                        firstAt={timeline.coverage.firstEventAt}
                      />
                    }
                    emptyLabel={
                      sweptClean
                        ? "This wallet has no Seamless activity."
                        : "No events to show — the sweep could not read this wallet's history."
                    }
                    footer={<TimelineCoverageFooter coverage={timeline.coverage} sourceLabel={SOURCE_LABEL} />}
                    // On a grouped answer the list covers `eventsServed`; a month
                    // read holds no card, the grid holding the other months.
                    boundary={
                      tl.historyWindow.state === "span"
                        ? null
                        : boundaryFromChainCoverage(
                            timeline.coverage,
                            servedRows ? (timeline.eventsServed ?? timeline.events.length) : timeline.events.length,
                          )
                    }
                    renderCard={(event, meta) =>
                      isAaveV3Event(event) ? (
                        <AaveV3CtEventCard
                          event={event}
                          eventNumber={meta.eventNumber}
                          isFirst={meta.isFirst}
                          isLast={meta.isLast}
                        />
                      ) : null
                    }
                  />
                </>
              ) : timelineState === "loading" ? (
                <SweepInFlight>
                  Reading this wallet&rsquo;s whole history from the Pool&rsquo;s logs — the sweep runs from the
                  Pool&rsquo;s first block, so it takes a moment.
                </SweepInFlight>
              ) : (
                <p className="py-6 text-center text-sm text-rb-500">
                  {timelineState === "unavailable"
                    ? "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Pool and is unaffected."
                    : "The history sweep failed. Reload to try again — the position above is read live from the Pool and is unaffected."}
                </p>
              )}
            </>
          )}

          <ProvInspectorLayer />
        </div>
      </V3PoolProvider>
    </CaptureSourceProvider>
  );
}
