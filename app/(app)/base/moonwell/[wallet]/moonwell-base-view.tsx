"use client";

// One wallet's Moonwell position on Base — state, economics and whole history.
//
// Two reads, in the order they can answer. The Comptroller first: what the
// account supplied, what it owes, which supplies it actually entered as
// collateral, and its own verdict on how far the account sits from the
// shortfall line — one burst, because a Compound v2 fork cross-collateralises
// everything through one contract. Then the sweep: every event the wallet's
// markets have emitted for it since the Comptroller's first block, which feeds
// the timeline, the tower's lifetime layer and — when it read every block —
// the card's own history: the principal beside each supply, the peaks a
// closed account shows, its activity meta.
//
// The Comptroller read is always live. The history has two halves and the
// route picks between them: the index when it can vouch for a whole life, the
// sweep until then (app/api/chain/moonwell-base/timeline). The sweep is not the
// Aave one pointed at different topics — a Compound v2 market indexes nothing
// on its own events — so it anchors on the reward distributor, the one contract
// here that indexes the account on every action, and expands each anchored
// transaction (see lib/sources/chain/moonwell-events.ts). Its completeness is a
// property of the request rather than of the explorer, so it is stated under
// the last event — and, because the two halves are a few hundred milliseconds
// against tens of seconds, which one is answering is named BEFORE the wait,
// from the coverage row (sweepWaitCopy below).
//
// Everything on screen is the Ethereum explorer's code: the position card,
// its risk slot and explanation, the event card, its detail grid, its
// explainer, the run-collapse and the economics arithmetic. What differs is
// only the receipts, through the seams the page declares — which chain, which
// capture source, which deployment (its markets, its Comptroller, its route,
// its card receipts) — because a receipt that named a rails-server index
// behind this page, or Ethereum's mToken catalog, or Etherscan for a Base
// transaction, would read as correct until followed.
//
// This is the page's client half. The Comptroller read and the coverage row
// happen on the server above it (lib/moonwell-base/position-page-data.ts) and
// arrive as props, so the position card, its risk slot and its explanation are
// in the first document. The sweep stays here: at ~36s it is far past anything
// a server render can wait for, and the state this component paints while it
// runs is exactly the state the page showed for those 36 seconds anyway.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { MoonwellPositionCard } from "@/components/protocol/moonwell/moonwell-position-card";
import {
  MoonwellClosedPositionExplanation,
  MoonwellPositionExplanation,
} from "@/components/protocol/moonwell/moonwell-position-explanation";
import { MoonwellRiskSlot } from "@/components/protocol/moonwell/moonwell-risk-slot";
import { MoonwellEventCard } from "@/components/protocol/moonwell/moonwell-event-card";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { TimelineFillWell } from "@/components/shared/timeline-fill-well";
import { TimelineCoverageFooter } from "@/components/shared/timeline-coverage-footer";
import { boundaryFromChainCoverage } from "@/lib/shared/timeline-boundary";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { CaptureSourceProvider } from "@/lib/shared/capture-source";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { computeMoonwellCardCaptions, computeMoonwellEconomics } from "@/lib/moonwell/economics";
import { moonwellEconomicsExplanation, moonwellEconomicsContent } from "@/lib/moonwell/economics-explanation";
import { MoonwellDeploymentProvider } from "@/lib/moonwell/deployment-context";
import { makeSweptMoonwellIdentity } from "@/lib/moonwell/swept-card-provenance";
import { makeSweptMoonwellVocabulary } from "@/lib/moonwell/swept-tower-provenance";
import { MOONWELL_ACTIVITY_RUNS, MOONWELL_FOLDER_REGISTER } from "@/lib/moonwell/timeline-runs";
import { interleaveRowPlan, servedFoldersEnabled, type GroupedTimelineFields } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import {
  MOONWELL_BASE_COMPTROLLER,
  MOONWELL_BASE_DEPLOY_BLOCK,
  MOONWELL_BASE_WETH_ROUTER,
} from "@/lib/moonwell-base/asset-catalog";
import { moonwellViewFromChain } from "@/lib/moonwell-base/chain-position-view";
import type { MoonwellChainTimelineResponse } from "@/lib/moonwell-base/chain-timeline";
import { fetchMoonwellChainPosition, type MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";
import { ChainTimelineUnavailable, fetchChainTimeline } from "@/lib/api/fetch-chain-timeline";
import { loadMoonwellShareRates, type MoonwellShareRateResponse } from "@/lib/api/fetch-moonwell-share-rate";
import { shareRateNotesFor, liveShareRateNote, type MarketNote, type ShareRateMarket } from "@/lib/shared/market-note";
import { isMoonwellEvent, type BaseActivityEvent, type MoonwellContext } from "@/lib/shared/types/event-shape";
import { SweepInFlight } from "@/components/shared/sweep-in-flight";
import { useBaseLendingCoverage } from "@/components/shared/base-lending-coverage-banner";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, as on the Ethereum page.
const MoonwellExportMenu = dynamic(
  () => import("@/components/protocol/moonwell/moonwell-export-menu").then((m) => m.MoonwellExportMenu),
  { ssr: false },
);

const POSITION_ROUTE = "/api/chain/moonwell-base/position";
const TIMELINE_ROUTE = "/api/chain/moonwell-base/timeline";
const FOLDER_ROUTE = "/api/chain/moonwell-base/timeline/folder";
const COVERAGE_ROUTE = "/api/moonwell-base/coverage";

/** The history as the route answers it: flat, or — asked `?group=1`, the page
 *  default since leg C of `0019` — as ROWS, where `events` holds only the
 *  ungrouped events and `rowPlan` puts the folders back between them
 *  (lib/moonwell-base/timeline-folders.ts). A history the index cannot vouch
 *  for is answered flat either way, and reads as flat here. */
type MoonwellBaseTimeline = MoonwellChainTimelineResponse & Partial<GroupedTimelineFields>;

/** What the coverage footer names as the thing that was swept. */
const SOURCE_LABEL = "Moonwell's Base markets";

/** Stable empties, so a position with no steps re-renders the timeline no more
 *  than it did before market notes existed. */
const EMPTY_SHARE_RATES: MoonwellShareRateResponse[] = [];
const EMPTY_NOTES: MarketNote[] = [];

/** The Comptroller lists 21 markets on Base; an account cannot have supplied
 *  into more than that, and this is the ceiling on how many share-rate reads
 *  one page load can start. */
const MAX_NOTE_MARKETS = 21;

/**
 * The markets this account ever supplied into — the only ones whose share rate
 * can have moved anything of this position's.
 *
 * `context.data.market` is the market key, and on BASE that key is the mToken
 * address itself: two Base markets both answer `symbol()` = "mUSDC" (the
 * bridged and the native USDC), so the roster keys by address
 * (lib/sources/chain/moonwell-roster.ts). No lookup is needed here, and none is
 * done — Moonwell ETHEREUM keys by a short tag ('weth', 'usdc'), which is one
 * reason that deployment passes no notes.
 *
 * A borrow or a repay is not enough: only a supply-side row states an mToken
 * balance, and a market the account only ever borrowed from holds none of its
 * shares.
 */
function suppliedMarkets(
  events: readonly (BaseActivityEvent & { context: { data: MoonwellContext } })[],
): ShareRateMarket[] {
  const out = new Map<string, ShareRateMarket>();
  for (const e of events) {
    const d = e.context.data;
    if (d.side !== "supply") continue;
    const address = d.market.toLowerCase();
    if (out.has(address) || out.size >= MAX_NOTE_MARKETS) continue;
    out.set(address, { address, key: d.market, symbol: d.marketSymbol });
  }
  return [...out.values()];
}

/**
 * What to say while the history is still coming, given what the index says
 * about itself.
 *
 * The wait is not one wait. The route reads the index when the index can vouch
 * for a whole life and sweeps the chain when it cannot
 * (lib/sources/api/moonwell-base-timeline.ts) — a few hundred milliseconds
 * against six to forty seconds, decided before the request is made and knowable
 * before it returns: the coverage row is a separate, cheap read that says
 * whether the backfill has finished. So the page asks it, and names the wait it
 * is actually in. An unexplained forty seconds reads as a broken page; a stated
 * one reads as what it is.
 */
function sweepWaitCopy(c: ReturnType<typeof useBaseLendingCoverage>) {
  if (c === undefined || c === null)
    return "Reading this wallet’s whole history from the markets’ logs — the sweep runs from the Comptroller’s first block, so it takes a moment.";
  if (c.historyComplete) return "Reading this wallet’s history from the index.";
  const walked =
    c.backfillNextBlock != null && c.backfillTo != null
      ? ` It has walked to block ${c.backfillNextBlock.toLocaleString("en-US")} of ${c.backfillTo.toLocaleString("en-US")}.`
      : "";
  return (
    `Rails’ index of Moonwell Base is still being built, so it cannot vouch for this wallet’s whole life yet.${walked}` +
    " Until it can, the history is swept from the markets’ own logs on every visit, from the Comptroller’s first block — several seconds, and longer for a wallet with many transactions."
  );
}

/** The tower's receipts for this lane — a live sweep from the Comptroller's
 *  first block and a position read pinned to a block, never an index. */
const VOCAB = makeSweptMoonwellVocabulary({
  deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
  positionRoute: `GET ${POSITION_ROUTE}`,
});

/** This deployment, as every card on the page resolves it: the market key IS
 *  the mToken address, the Comptroller and route are Base's, and the position
 *  card's receipts describe live reads and a live sweep. */
const DEPLOYMENT = makeSweptMoonwellIdentity({
  session: "moonwell-base",
  comptroller: { name: "Comptroller (Base)", address: MOONWELL_BASE_COMPTROLLER },
  positionRoute: POSITION_ROUTE,
  router: MOONWELL_BASE_WETH_ROUTER,
  deployBlock: MOONWELL_BASE_DEPLOY_BLOCK,
});

export interface MoonwellBaseViewProps {
  /** Lowercased address. The page validated its shape before rendering this. */
  wallet: string;
  /** The server's Comptroller read, or null when it could not make it — this
   *  component then reads for itself, as it did before the route had a server
   *  half. A stale (RPC-failed) read never arrives here; the loader drops it. */
  initialPosition: MoonwellChainResponse | null;
  initialCoverage: BaseLendingCoverage | null;
}

export default function MoonwellBaseView({ wallet, initialPosition, initialCoverage }: MoonwellBaseViewProps) {
  const seeded = initialPosition != null;

  const [data, setData] = useState<MoonwellChainResponse | null>(initialPosition);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<MoonwellBaseTimeline | null>(null);
  // The markets' own share-rate steps, kept as the endpoint stated them rather
  // than as notes: which steps this position was actually holding across is a
  // pure reduction over the events on the page, so loading more history
  // re-reduces the same steps without a second request.
  const [shareRates, setShareRates] = useState<MoonwellShareRateResponse[]>(EMPTY_SHARE_RATES);
  const [timelineState, setTimelineState] = useState<"loading" | "ready" | "unavailable" | "failed">("loading");
  // The event route renders this same view; `ChainTruthTimeline` reads the
  // same param for its pinned mode.
  const routeParams = useParams<{ eventId?: string | string[] }>();
  const pinnedRoute = routeParams?.eventId != null;

  // Read on the server and handed down, so the sweep's wait is named in the
  // first document instead of ~270ms into it. Seeded, the hook makes no request.
  const coverage = useBaseLendingCoverage(COVERAGE_ROUTE, initialCoverage);

  // Only when the server could not answer. A seeded view goes straight to the
  // sweep below.
  useEffect(() => {
    if (seeded || !wallet) return;
    let cancelled = false;
    setLoading(true);
    fetchMoonwellChainPosition({ wallet, route: POSITION_ROUTE })
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
  //
  // The depth is remembered per wallet (lib/shared/render-depth-store): a
  // reader who loaded the rest of this history and comes back a minute later
  // gets the same depth without pressing again (Miles, 2026-09-02). The
  // store only ever holds depths above the default, so a wallet never dug
  // into costs nothing here.
  //
  // The market notes ride the SAME effect and the same "ready", and the order
  // is forced rather than chosen: which markets to ask about is the account's
  // own supply history, so the note read cannot start before the timeline
  // answers (decision recorded 2026-09-04 — the plan called the two fetches
  // parallel, and they cannot be). What IS decided is that nothing paints in
  // between: `timelineState` stays "loading" until the notes have settled, so
  // a reader gets the events and the notes in one paint and never watches a
  // row insert itself into a list already being read. The wait is bounded by
  // MARKET_NOTE_BUDGET_MS and fails open — no note, never a placeholder.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    setTimelineState("loading");
    setShareRates(EMPTY_SHARE_RATES);
    fetchChainTimeline<MoonwellBaseTimeline>({
      wallet,
      route: TIMELINE_ROUTE,
      mark: "moonwell-base-timeline",
      // `?folders=0` is the way back to the flat list; the test is the one the
      // index arms use, so every grouped page opts out the same way. A PINNED
      // event page reads flat: pinned mode finds its card among the served
      // events, and a grouped answer serves a folder's members only when it is
      // opened — so a liquidation shared by link would read as not found.
      params: servedFoldersEnabled() && !pinnedRoute ? { group: "1" } : undefined,
    })
      .then(async (d) => {
        if (cancelled) return;
        const markets = suppliedMarkets(d.events.filter(isMoonwellEvent));
        const rates = await loadMoonwellShareRates({ markets: markets.map((m) => m.address) }).catch(() => []);
        if (cancelled) return;
        setTimeline(d);
        setShareRates(rates.length > 0 ? rates : EMPTY_SHARE_RATES);
        setTimelineState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setTimelineState(e instanceof ChainTimelineUnavailable ? "unavailable" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, pinnedRoute]);

  const moonwellEvents = useMemo(() => (timeline?.events ?? []).filter(isMoonwellEvent), [timeline]);

  // The served list as ROWS, when the route grouped it. The plan and the
  // events it interleaves come from one answer, so two partitions never meet.
  const servedRows = useMemo(
    () => (timeline?.grouped && timeline.rowPlan ? interleaveRowPlan(timeline.rowPlan, moonwellEvents) : undefined),
    [timeline, moonwellEvents],
  );
  /** The folders, whole and unfiltered — the part of the history the page
   *  holds as aggregates. Every whole-history claim below that is reduced over
   *  `moonwellEvents` adds them, or states nothing it cannot. The tower, the
   *  card's counts and the positions need nothing: the route replayed every row
   *  before it grouped, and those figures ride the replay itself. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );

  // The market notes: each market's steps reduced against THIS position's own
  // events — the step has to sit inside the position's life and the position
  // has to have been holding the market's mTokens across it, and that holding
  // is the slice the note states. Memoised because <ChainTruthTimeline>
  // re-anchors on every change of the array's identity.
  const notes = useMemo(() => {
    if (shareRates.length === 0 || moonwellEvents.length === 0) return EMPTY_NOTES;
    const byAddress = new Map(suppliedMarkets(moonwellEvents).map((m) => [m.address, m]));
    const out = shareRates.flatMap((r) => {
      const market = byAddress.get(r.market.toLowerCase());
      return market ? shareRateNotesFor(r.steps, market, moonwellEvents, servedFolders) : [];
    });
    return out.length > 0 ? out.sort((a, b) => a.to.block - b.to.block) : EMPTY_NOTES;
  }, [shareRates, moonwellEvents, servedFolders]);

  // Live notes: one per market this account has ENTERED (Comptroller
  // membership) and still holds a nonzero live mToken balance in — the
  // market's own live exchange rate against this account's own newest
  // Mint/Redeem in it. A market the account only ever borrowed from, or has
  // fully exited, gets none — `liveShareRateNote` itself drops a market with
  // no Mint/Redeem row of the account's own to compare the live rate against.
  // No separate pending state: by the time this component reaches the branch
  // that mounts <ChainTruthTimeline> at all (`timelineState === "ready"`),
  // `data` and `moonwellEvents` are already both settled, so this is never
  // mid-flight on its own.
  const liveNotes = useMemo(() => {
    if (!data || data.chainStale || moonwellEvents.length === 0) return EMPTY_NOTES;
    const byAddress = new Map(suppliedMarkets(moonwellEvents).map((m) => [m.address, m]));
    const out: MarketNote[] = [];
    for (const m of data.markets) {
      if (!m.entered) continue;
      const rawUnits = Number(m.mtokenBalanceRaw);
      if (!Number.isFinite(rawUnits) || rawUnits <= 0) continue;
      const descriptor = byAddress.get(m.market.toLowerCase());
      if (!descriptor) continue;
      const note = liveShareRateNote(
        moonwellEvents,
        descriptor,
        {
          rate: m.exchangeRate,
          block: data.blockNumber,
          timestamp: data.blockTimestamp || undefined,
          units: rawUnits / 1e8,
        },
        servedFolders,
      );
      if (note) out.push(note);
    }
    return out.length > 0 ? out : EMPTY_NOTES;
  }, [data, moonwellEvents, servedFolders]);

  // "The sweep read every block of this deployment's life." Both conditions
  // are needed: no holes inside the span, AND the span reaching the
  // Comptroller's own first block. A horizon — the sweep ran out of time, or
  // the wallet has more transactions than one request expands — leaves the
  // events contiguous but the history starting later than the protocol, which
  // is enough to disqualify a lifetime total from the words "all time" and a
  // peak from "highest recorded".
  // Which half captured the history — the index once it holds the whole
  // life, the sweep until then — as the route said, and as the receipts'
  // custody line and the export name it.
  const captureSource = timeline?.coverage.source === "index" ? "index" : "sweep";
  const sweptClean =
    timelineState === "ready" &&
    (timeline?.coverage.gaps.length ?? 0) === 0 &&
    timeline?.coverage.fromDeployment === true;

  // The Comptroller read in the shape the shared card and economics take. The
  // sweep adds only what the Comptroller cannot say: the replayed principal
  // beside each current value, whether an emptied account was liquidated,
  // and — from a whole sweep — the peaks and the activity meta.
  const view = useMemo(
    () => (data && !data.chainStale ? moonwellViewFromChain(data, timeline, sweptClean) : null),
    [data, timeline, sweptClean],
  );

  const tl = useTimelineEvents(moonwellEvents, {
    storageKey: `moonwell-base-${wallet}`,
    protocolKey: "moonwell",
    // The rows before the trim, so numbering runs over the whole history —
    // the newest row is numbered `totalEvents` — and the count line states
    // the real total beside the listed rows (rails-ops decision 0019).
    olderCount: timeline?.coverage.omitted?.count ?? 0,
    servedRows,
    eventsServed: servedRows ? timeline?.eventsServed : undefined,
  });

  const readFolderMembers = useCallback(
    (ask: { event?: string; folder?: string }) =>
      fetchTimelineFolderMembers({ path: FOLDER_ROUTE, params: { wallet }, ...ask }),
    [wallet],
  );

  // The CSV on a grouped page: the rows in the order the route served them,
  // each folder opened for its members. `missing` is what no answer can list —
  // a seeded heavy wallet's rows before its seed, or rows below the row cap —
  // and a download short by any of them does not happen.
  const fetchAllHistory = useCallback(async (): Promise<WholeHistoryFetch> => {
    const events: BaseActivityEvent[] = [];
    for (const row of servedRows ?? []) {
      if (row.kind === "event") {
        events.push(row.event);
        continue;
      }
      const opened = await fetchTimelineFolderMembers({
        path: FOLDER_ROUTE,
        params: { wallet },
        folder: row.folder.responseId,
      });
      events.push(...opened.events);
    }
    return { events, missing: timeline?.coverage.omitted?.count ?? 0 };
  }, [servedRows, wallet, timeline]);

  /** The timestamps the activity header measures tenure and freshness from —
   *  the events on the page and each folder's own first and last member, since
   *  the newest thing a position did can sit inside a folder. */
  const headerStamps = useMemo(
    () =>
      servedFolders && servedFolders.length > 0
        ? [...moonwellEvents, ...servedFolders.flatMap((f) => [{ timestamp: f.firstAt }, { timestamp: f.lastAt }])]
        : moonwellEvents,
    [moonwellEvents, servedFolders],
  );

  // Who executed this account's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole history so the
  // Explanation can state it once. Moonwell's party param is the event's own
  // emitted minter/redeemer/payer (`caller`), so a router-proxied mint keeps
  // the owner as signer and does not mark.
  const externalActivity = useMemo(
    () =>
      withFolderActors(
        summariseExternalActors(
          moonwellEvents.map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.caller,
            wallet: e.wallet,
          })),
        ),
        servedFolders,
      ),
    [moonwellEvents, servedFolders],
  );

  // Stat captions (accrued interest, borrow rate). The rates ride the
  // Comptroller read; the interest split attributes against the sweep's
  // WHOLE-life sums — and only when the sweep read every block, because an
  // attribution against a partial history would call missed principal
  // "interest".
  const captions = useMemo(
    () => (view ? computeMoonwellCardCaptions(view, undefined, sweptClean ? timeline?.lifetime : undefined) : null),
    [view, sweptClean, timeline],
  );

  // Silence is only evidence of absence when someone actually listened: a
  // sweep that could not read the chain also comes back with no events.
  const untouched =
    data != null && !data.chainStale && data.markets.length === 0 && sweptClean && timeline?.totalEvents === 0;

  // The Comptroller says this account holds nothing. That alone does not say
  // which of two accounts it is — one that closed, or one that was never
  // opened — and only the history separates them. Until it answers, the card
  // must not pick: given no markets and no events it reads the account as
  // CLOSED and narrates a life it cannot see, dating "last activity" from the
  // Unix epoch and counting zero transactions. That was a 36-second flash while
  // the sweep ran and the client held the page; rendered on the server it would
  // be the account's permanent machine-readable record.
  const nothingOnChain = data != null && !data.chainStale && data.markets.length === 0;
  const historyPending = nothingOnChain && timelineState === "loading";
  const historyUnread = nothingOnChain && (timelineState === "failed" || timelineState === "unavailable");

  // The tower's lifetime layer reads the sums the route reduced over EVERY
  // row, not the capped list of events on this page — and only when the sweep
  // read the whole life. A holed or horizoned sweep keeps the bars (the
  // current state comes from the Comptroller, not the logs) and drops the flows.
  const towerData = useMemo(() => {
    if (!view) return null;
    const built = computeMoonwellEconomics(view, undefined, VOCAB, sweptClean ? timeline?.lifetime : undefined);
    return sweptClean
      ? built
      : {
          ...built,
          flowsNote:
            "Lifetime flows are hidden because the history sweep did not read every block of this position's life — see the note under the timeline for where it stopped or what it missed. Summing what did arrive would label a partial history “all time”. The current balances above are unaffected: they are read from the Comptroller and the markets, not replayed from the events.",
        };
  }, [view, timeline, sweptClean]);

  // The top row's price dropdown: the Comptroller's own oracle price of each market the
  // account currently touches.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view) return [];
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const r of [...view.supplies, ...view.borrows]) {
      const a = r.address.toLowerCase();
      if (seen.has(a)) continue;
      seen.add(a);
      const p = view.priceByAddress?.[a];
      if (typeof p === "number" && p > 0) out.push({ symbol: r.symbol, address: r.address, price: p });
    }
    return out;
  }, [view]);

  return (
    <CaptureSourceProvider value={captureSource}>
      <MoonwellDeploymentProvider value={DEPLOYMENT}>
        <div className="py-8 space-y-6">
          <DetailTopRow session="moonwell-base" wallet={wallet} assets={stripAssets}>
            {view && (
              <MoonwellExportMenu
                wallet={wallet}
                deploymentName="Moonwell (Base)"
                source={captureSource}
                view={view}
                chain={data}
                events={moonwellEvents}
                notes={notes}
                liveNotes={liveNotes}
                csvFilename={`moonwell-base-${wallet.slice(0, 10)}-activity.csv`}
                history={markdownHistoryScope(undefined, moonwellEvents, servedFolders)}
                scopeNote={exportScopeNote(undefined, moonwellEvents, "this wallet's whole history", servedFolders)}
                fetchAllEvents={servedFolders && servedFolders.length > 0 ? fetchAllHistory : undefined}
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
            <SweepInFlight>{sweepWaitCopy(coverage)}</SweepInFlight>
          ) : historyUnread ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">Nothing is supplied or borrowed on any of the Comptroller&rsquo;s markets.</p>
              <p className="text-sm">
                Whether this account ever held a position is a question only its history answers, and that read failed.
                Reload to try again.
              </p>
            </div>
          ) : untouched ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">This wallet has never touched Moonwell on Base.</p>
              <p className="text-sm">
                No supplied assets, no debt, and no events on any of the Comptroller&rsquo;s markets between its first
                block and now.
              </p>
            </div>
          ) : (
            <>
              {view && data && (
                <MoonwellPositionCard
                  v={view}
                  receipts
                  viewHref={tl.viewHref}
                  captions={captions ?? undefined}
                  // The risk slot rides the card's heading-button row (the L1
                  // treatment): the HF runway (1.0 exactly the Comptroller's
                  // shortfall line) and the borrow-capacity lines, every
                  // figure the Comptroller's own. Shown only with debt.
                  rowExtra={
                    view.status === "open" && data.healthFactor != null && data.healthFactor > 0 ? (
                      <MoonwellRiskSlot chain={data} />
                    ) : undefined
                  }
                  // The Explanation is layman prose about those same face
                  // figures. A terminal account narrates from the sweep alone
                  // (peaks, closure); an open one from the Comptroller read.
                  explanation={
                    view.status !== "open" ? (
                      <MoonwellClosedPositionExplanation v={view} />
                    ) : (
                      <MoonwellPositionExplanation
                        chain={data}
                        captions={captions}
                        txCount={view.txCount}
                        liquidationCount={view.liquidationCount}
                        externalActivity={externalActivity}
                      />
                    )
                  }
                />
              )}

              {towerData && timelineState === "ready" && (
                <ChainTruthTower
                  data={towerData}
                  explanation={moonwellEconomicsExplanation(towerData, { deployment: "base" })}
                  learnMore={moonwellEconomicsContent({ deployment: "base" })}
                />
              )}

              {timelineState === "ready" && timeline ? (
                <>
                  <TimelineFillWell fill={timeline.coverage.fill} />
                  <ChainTruthTimeline
                    tl={tl}
                    runs={MOONWELL_ACTIVITY_RUNS}
                    // Both grouping paths: the spec groups a flat answer in the
                    // browser, the register draws the folders the route served.
                    // Only one is in force on a load.
                    folderRegister={MOONWELL_FOLDER_REGISTER}
                    readFolderMembers={readFolderMembers}
                    persistKeyPrefix="moonwell"
                    closed={view?.status !== "open"}
                    // Receipted facts about the MARKETS this account supplied
                    // into, placed between the two of its own events that
                    // bracket each one. Never counted anywhere — see the prop's
                    // own doc comment and lib/shared/market-note.ts.
                    notes={notes}
                    // This account's own live share-rate note per entered
                    // market it still holds — no pending state here (see
                    // `liveNotes`'s own comment): both it and `moonwellEvents`
                    // are already settled by the time this branch mounts.
                    liveNotes={liveNotes}
                    toolbarLeading={
                      <TimelineActivityHeader
                        events={headerStamps}
                        closed={view?.status !== "open"}
                        firstAt={timeline.coverage.firstEventAt}
                      />
                    }
                    emptyLabel={
                      sweptClean
                        ? "This wallet has no Moonwell activity on Base."
                        : "No events to show — the sweep could not read this wallet's history."
                    }
                    footer={<TimelineCoverageFooter coverage={timeline.coverage} sourceLabel={SOURCE_LABEL} />}
                    // On a grouped answer the list covers `eventsServed` — the
                    // folder members are one tap away, not below the cut.
                    boundary={boundaryFromChainCoverage(
                      timeline.coverage,
                      servedRows ? (timeline.eventsServed ?? timeline.events.length) : timeline.events.length,
                    )}
                    renderCard={(event, meta) =>
                      isMoonwellEvent(event) ? (
                        <MoonwellEventCard
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
                <SweepInFlight>{sweepWaitCopy(coverage)}</SweepInFlight>
              ) : (
                <p className="py-6 text-center text-sm text-rb-500">
                  {timelineState === "unavailable"
                    ? "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Comptroller and is unaffected."
                    : "The history sweep failed. Reload to try again — the position above is read live from the Comptroller and is unaffected."}
                </p>
              )}
            </>
          )}

          <ProvInspectorLayer />
        </div>
      </MoonwellDeploymentProvider>
    </CaptureSourceProvider>
  );
}
