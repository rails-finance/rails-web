"use client";

// Maple position detail — chain-state-first, the 3-section anatomy (card →
// economics → timeline). Every value is chain-direct or chain-derived:
// position state + timeline replayed from the captured pool/queue events; the
// current redeemable value and the access band ride the per-pool chain read
// the listing proxy already takes (exit/NAV rates + the liquid/deployed
// split — one multicall, no per-wallet RPC). A lender has no liquidation
// surface, so no risk gauges are asserted — the card, the pool band, the
// Lifetime flows panel and the timeline carry the whole page.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import { fetchMaplePositions } from "@/lib/api/fetch-maple-positions";
import type { MaplePositionSummary } from "@/lib/sources/api/maple-positions";
import {
  fetchMapleTimeline,
  fetchMapleGroupedTimeline,
  type MapleGroupedTimelineResult,
} from "@/lib/api/fetch-maple-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MAPLE_FOLDER_REGISTER, MAPLE_QUEUE_FILL_RUNS } from "@/lib/maple/timeline-runs";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { useMountedNow } from "@/hooks/useMountedNow";
import { interleaveRowPlan, servedFoldersEnabled } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { MapleEventCard } from "@/components/protocol/maple/maple-event-card";
import { MaplePoolStatsBand } from "@/components/protocol/maple/maple-pool-stats-band";
import {
  MaplePositionCard,
  viewFromSummary,
  type MaplePositionView,
} from "@/components/protocol/maple/maple-position-card";
import { MaplePositionExplanation } from "@/components/protocol/maple/maple-position-explanation";
import { computeMapleCardCaptions, mapleFlowSummaries, mapleLifetimeWithOpening } from "@/lib/maple/economics";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { MapleFlowsNote, mapleFlowsContent } from "@/components/protocol/maple/maple-flows-note";
import { MapleFlowsPoolSwitch } from "@/components/protocol/maple/maple-flows-pools";
import { MapleFlowsPoolContext } from "@/components/protocol/maple/maple-ledger";
import { useMapleFlows } from "@/hooks/useMapleFlows";
import type { MapleLive } from "@/lib/maple/flows";
import {
  mapleBoundaryFolders,
  mapleHoldings,
  mapleLives,
  mapleRowTimes,
  mapleSinceLastEvent,
  mapleStretchFolders,
} from "@/lib/maple/row-times";
import { MapleSinceLastEventRow } from "@/components/protocol/maple/maple-since-last-event";
import type { FolderMembersReader } from "@/lib/shared/folder-members";
import { DetailBackButton, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import { poolExitRateProv } from "@/lib/maple/event-provenance";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { getCcipEscrow, getProtocolContract } from "@/lib/shared/known-infrastructure";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { MapleCustodyCard } from "@/components/protocol/maple/maple-custody-card";
import type { MapleCustodyHolding } from "@/lib/sources/chain/maple-custody";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const MapleExportMenu = dynamic(
  () => import("@/components/protocol/maple/maple-export-menu").then((m) => m.MapleExportMenu),
  { ssr: false },
);

interface MaplePositionViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  initialPosition: MaplePositionSummary | null;
  /** Per-pool chain state, which rides the positions envelope. */
  initialPoolState: Record<string, MaplePoolState> | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a lender with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
  /** The grouped answer WHOLE, when the load read its history as ROWS (the
   *  default; `?folders=0` reads the flat window). Its row plan puts the
   *  folders back between the ungrouped events, and its folders carry the
   *  arithmetic the whole-history reductions read. */
  initialGrouped: MapleGroupedTimelineResult | null;
}

export default function MaplePositionView({
  wallet,
  initialPosition,
  initialPoolState,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
  initialGrouped,
}: MaplePositionViewProps) {
  // The clock arrives after mount, so the server render and a browser at another time draw one text.
  const mountedNow = useMountedNow();
  // Keyed on the timeline, not the row: a wallet with no Maple position is a
  // real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<MaplePositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [poolState, setPoolState] = useState<Record<string, MaplePoolState>>(initialPoolState ?? {});
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The same history as ROWS (decision 0019's evening amendment): the index
  // groups this family, because every row carries the wallet's own share,
  // escrow and principal lanes, so a folder leaves nothing here to
  // reconstruct. The grouped answer REPLACES the flat window: `events` holds
  // its ungrouped events and this its row plan and folders.
  const [groupedTail, setGroupedTail] = useState<MapleGroupedTimelineResult | null>(initialGrouped);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — all but a
  // handful of Maple's lenders — `cutoffBlock` comes back null, no second
  // request is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);

  // Known infrastructure (the CCIP bridge escrows) is not a lender — the page
  // renders the custody view instead of the position scaffolding (the backend
  // returns no roster row and no timeline for these addresses; what the
  // escrow holds rides its own chain read).
  const infra = getCcipEscrow(wallet);
  // A protocol contract (Uniswap V4's PoolManager, CoW's settlement contract)
  // has a Maple record of its own and keeps its timeline, but it is not a
  // lender: the listing leaves it out and the position card never renders for
  // it, so the page opens by saying what the address is.
  const protocolContract = getProtocolContract(wallet, MAINNET_CHAIN_ID);
  const [custody, setCustody] = useState<MapleCustodyHolding[] | null>(null);

  useEffect(() => {
    if (!wallet || !getCcipEscrow(wallet)) return;
    (async () => {
      try {
        const res = await fetch(`/api/chain/maple/custody?address=${wallet}`);
        const data = res.ok ? await res.json() : { holdings: [] };
        setCustody(Array.isArray(data.holdings) ? data.holdings : []);
      } catch {
        setCustody([]); // RPC down — the identity card carries the page alone.
      }
    })();
  }, [wallet]);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet || getCcipEscrow(wallet)) return;
    (async () => {
      setLoading(true);
      try {
        // The same choice the server half made (`position-page-data.ts`): ONE
        // timeline read, in the shape the URL asked for.
        const asked = servedFoldersEnabled();
        const [pData, flat, grouped] = await Promise.all([
          fetchMaplePositions({ wallet, limit: 1, status: undefined }),
          asked ? null : fetchMapleTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
          asked ? fetchMapleGroupedTimeline(wallet) : null,
        ]);
        const tData = grouped ?? flat;
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setPoolState(pData.poolState ?? {});
        setEvents(tData?.events ?? []);
        setCutoffBlock(tData?.cutoffBlock ?? null);
        setGroupedTail(grouped);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately a separate one: the rows land and the list is readable while
  // this is in flight, and every whole-history figure declares itself unknown
  // until it arrives rather than stating the window's arithmetic as a lifetime.
  // A failure is a stated failure for the same reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. The server read it for the same reason the client does, and
    // only a server-side failure leaves it null with a cutoff block set, which
    // is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/maple/timeline/summary",
      params: { wallet },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  const mapleEvents = useMemo(() => events.filter(isMapleEvent), [events]);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. The same narrowing the page applies to its
  // own events applies here, so the spreadsheet and the timeline agree.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchMapleTimeline(wallet);
    const served = res.events ?? [];
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served.filter(isMapleEvent),
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [wallet]);

  // ⚠️ On a windowed page the reducers below must read the MERGED lifetime, not
  // the window's. `lifetimeEvents` is undefined until the opening balance is
  // known, and both reducers treat an absent event list as "no lifetime layer"
  // rather than as an empty one — so the withdrawn segments, the inflow bar and
  // the interest split state nothing while they cannot state the whole, which is
  // the only correct answer between the two requests.
  const lifetimeEvents = lifetimeFiguresKnown(historyWindow) ? mapleEvents : undefined;

  // The served list as ROWS, from the same answer as `mapleEvents`.
  const servedRows = useMemo(
    () => (groupedTail ? interleaveRowPlan(groupedTail.rowPlan, mapleEvents) : undefined),
    [groupedTail, mapleEvents],
  );
  /** The folders the index served, whole and unfiltered: the third
   *  contributor to the page's partition, which every whole-history reduction
   *  below adds to `opening + events`. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  /** The oldest member any folder stands for, so a page whose oldest row is a
   *  folder still dates the wallet from inside it. */
  const oldestFolderAt = useMemo(
    () =>
      servedFolders?.reduce<number | undefined>(
        (min, f) => (min == null || f.firstAt < min ? f.firstAt : min),
        undefined,
      ),
    [servedFolders],
  );
  const precomputedLifetime = useMemo(
    () => mapleLifetimeWithOpening(mapleEvents, opening, servedFolders),
    [mapleEvents, opening, servedFolders],
  );

  // ── ONE SEGMENT OF TIME, navigated by month ─────────────────────────────
  // Decision 0019, amendments 2026-09-24 and 2026-09-25: a month the loaded
  // rows do not hold is read from the index as its segment
  // (hooks/useTimelineSegment.ts). The preload stays the page's whole-history
  // record; the timeline alone swaps.
  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events: mapleEvents,
    groupedTail,
    servedRows,
    servedFolders,
    opening,
    historyWindow,
    isEvent: isMapleEvent,
    readGrouped: (span, signal) => fetchMapleGroupedTimeline(wallet, { span, signal }),
    readFlat: (span) => fetchMapleTimeline(wallet, { span }),
    folderPath: "/api/maple/timeline/folder",
    folderParams: { wallet },
    storageKey: `maple-${wallet}`,
    protocolKey: "maple",
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: false,
  });

  // Who executed this account's events — the SAME verdict each event card
  // renders on its spine, reduced over the whole history so the Explanation can
  // state it once. Queue fills are stripped of their facts rather than dropped:
  // a fill is `onlyRedeemer` (a registered redeemer or the pool delegate), so it
  // must never mark, but it is still one of the account's events and belongs in
  // the denominator — the same exclusion the card makes.
  //
  // On a windowed page the opening balance's own split is added: rails-server
  // makes the SAME exclusion in SQL (`action <> 'request_fill'`) and reads
  // tx_from and caller from the base tables exactly as /timeline does, so both
  // halves judge on the same fact. The two never count one event twice — they
  // are the two sides of an exclusive cut. The folders add theirs the same way:
  // rails-server judges a member by the same rule, queue fills excluded.
  const externalActivity = useMemo(() => {
    const withOpening = withOpeningActors(
      summariseExternalActors(
        mapleEvents.map((e) =>
          e.context.data.eventType === "request_fill"
            ? { wallet: e.wallet }
            : { txFrom: e.context.data.txFrom, poolCaller: e.context.data.caller, wallet: e.wallet },
        ),
      ),
      opening?.actors,
      opening?.totalEvents ?? 0,
    );
    return servedFolders && servedFolders.length > 0 ? withFolderActors(withOpening, servedFolders) : withOpening;
  }, [mapleEvents, opening, servedFolders]);

  // Folder members the page has read, by folder: the reader opens a folder, or
  // the page reads the one holding a pool's first or last row. Their rows date
  // the interest of the rows around them and bound the yield window.
  const [memberEvents, setMemberEvents] = useState<Record<string, BaseActivityEvent[]>>({});
  const readMembers = useCallback<FolderMembersReader>(
    async (ask) => {
      const res = await readFolderMembers(ask);
      setMemberEvents((m) => ({ ...m, [res.folder.responseId]: res.events }));
      return res;
    },
    [readFolderMembers],
  );
  const readFolders = useMemo(() => new Set(Object.keys(memberEvents)), [memberEvents]);
  const rowEvents = useMemo(() => {
    const seen = new Set(mapleEvents.map((e) => e.id));
    const extra = Object.values(memberEvents)
      .flat()
      .filter((e) => isMapleEvent(e) && !seen.has(e.id) && (seen.add(e.id), true));
    return extra.length > 0 ? [...mapleEvents, ...extra] : mapleEvents;
  }, [mapleEvents, memberEvents]);
  // The folders the yield window, the held stretches and the since-last-event
  // line need read: a pool's first or last row, and any row that could have
  // emptied a holding.
  const boundaryFolders = useMemo(() => {
    const need = mapleBoundaryFolders(rowEvents, servedFolders, readFolders);
    const ids = new Set(need.map((f) => f.responseId));
    for (const f of mapleStretchFolders(servedFolders, readFolders)) if (!ids.has(f.responseId)) need.push(f);
    return need;
  }, [rowEvents, servedFolders, readFolders]);
  useEffect(() => {
    for (const f of boundaryFolders) void readMembers({ folder: f.responseId }).catch(() => {});
    // One read per folder: a failed one is not retried, and its figures stay unstated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryFolders.map((f) => f.responseId).join(",")]);

  // Each row's previous row in its pool and, for a queue fill, its request:
  // the period a row's interest covers and how long a fill waited.
  const rowTimes = useMemo(
    () => mapleRowTimes(rowEvents, servedFolders, readFolders),
    [rowEvents, servedFolders, readFolders],
  );
  // The stretches the wallet held shares in each pool, for the yield window
  // and the header's time in the pool: stated only on a page that holds the
  // whole history.
  const holdings = useMemo(
    () => (cutoffBlock == null ? mapleHoldings(rowEvents, servedFolders, readFolders) : undefined),
    [rowEvents, servedFolders, readFolders, cutoffBlock],
  );
  const lives = useMemo(() => (holdings ? mapleLives(holdings) : null), [holdings]);
  // The stretch from the newest row to now, per live pool: the interest no row
  // states, drawn at the head of the timeline.
  const sinceLast = useMemo(
    () =>
      view && view.status === "open"
        ? mapleSinceLastEvent(rowEvents, servedFolders, readFolders, view.pools, (pool) => poolState[pool]?.blockNumber)
        : [],
    [view, rowEvents, servedFolders, readFolders, poolState],
  );
  // Requests the wallet cancelled, counted over the rows and the folders'
  // own counts; unstated on a windowed page, whose older rows are not here.
  const cancelledRequests = useMemo(() => {
    if (cutoffBlock != null) return undefined;
    let n = mapleEvents.filter((e) => e.context.data.eventType === "request_cancel").length;
    for (const f of servedFolders ?? []) n += f.counts.find((c) => c.key === "request_cancel")?.count ?? 0;
    return n;
  }, [mapleEvents, servedFolders, cutoffBlock]);

  // Stat captions (earned interest) — the event stream feeds the split; the
  // rate rides the listing row's per-pool chain read.
  const captions = view ? computeMapleCardCaptions(view, lifetimeEvents, precomputedLifetime) : null;
  // The pools the wallet received shares in by transfer: their interest counts
  // from each batch's worth when it arrived, which the card's Explanation says.
  const receivedPools = view
    ? mapleFlowSummaries(view, lifetimeEvents, precomputedLifetime)
        .filter((p) => p.received > 0)
        .map((p) => p.assetSymbol)
    : [];

  // The access band on the pools this wallet touches — the liquid/deployed
  // split IS the position's risk surface, so it belongs on the page.
  const walletPoolState = useMemo(() => {
    if (!view) return poolState;
    const touched = new Set(view.pools.map((p) => p.pool));
    return Object.fromEntries(Object.entries(poolState).filter(([k]) => touched.size === 0 || touched.has(k)));
  }, [view, poolState]);

  // The top row's price dropdown: one row per pool, its exit rate, the amount
  // one share pays out on withdrawal, in the pool's token. USDC and USDT get
  // no row of their own: amounts stay in the token, and the reason under the
  // list says so once.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    if (!view) return [];
    const out: LatestPriceAsset[] = [];
    for (const p of view.pools) {
      const state = walletPoolState[p.pool];
      const rate = state && !Number.isNaN(state.exitRate) && state.exitRate > 0 ? state.exitRate : undefined;
      out.push({
        symbol: p.symbol,
        address: maplePoolOf(p.pool).pool,
        price: rate,
        unit: rate ? p.assetSymbol : undefined,
        label: `Exit rate: what one ${p.symbol} pays out on withdrawal, in ${p.assetSymbol}`,
        tip: `Exit rate: what one ${p.symbol} pays out on withdrawal now, in ${p.assetSymbol}.`,
        info: rate && state ? poolExitRateProv(p.assetSymbol, p.symbol, state.blockNumber) : undefined,
        moreInWords: true,
      });
    }
    return out;
  }, [view, walletPoolState]);

  // The Lifetime flows panel replays the wallet's whole history, one pool at a
  // time (lib/maple/flows.ts): the page's rows where they are all of it, else
  // the flat history read once (the CSV's read); a read the row ceiling cut
  // short is a failed read. Today's claim and rate are the card's chain read.
  const flowWhole = historyWindow.state === "whole" && !servedFolders?.length;
  const flowLive = useMemo<Record<string, MapleLive>>(() => {
    const out: Record<string, MapleLive> = {};
    for (const p of view?.pools ?? []) {
      const rate = poolState[p.pool]?.exitRate;
      out[p.pool] = {
        claim: p.currentValue,
        rate: rate != null && Number.isFinite(rate) && rate > 0 ? rate : null,
      };
    }
    return out;
  }, [view, poolState]);
  // The pool the panel opens on: the one the wallet holds most of now, else
  // the one it put most into.
  const preferredPool = useMemo(() => {
    const pools = view?.pools ?? [];
    const held = [...pools].sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))[0];
    if (held && (held.currentValue ?? 0) > 0) return held.pool;
    return [...pools].sort((a, b) => b.lifetimeDeposited - a.lifetimeDeposited)[0]?.pool ?? null;
  }, [view]);
  const flows = useMapleFlows({
    wholeEvents: flowWhole ? mapleEvents : null,
    fetchAll: fetchAllHistory,
    live: flowLive,
    preferred: preferredPool,
  });
  const flowFocus = flows.read !== "failed" ? flows.focus : null;

  // The custody view — the factual page for a bridge escrow address. The
  // identity card states what the contract is and links the verified source;
  // the custody card beneath it carries what the escrow holds in the pool,
  // every figure traced to its own chain read. When the chain read degrades,
  // the identity card carries the page alone — no untraced figure renders.
  if (infra) {
    return (
      <div className="py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DetailBackButton session="maple" wallet={wallet} />
          <ToolsMenu />
        </div>
        <ContractIdentityCard
          kicker="Bridge infrastructure"
          name={infra.name}
          wallet={wallet}
          contractName={infra.contractName}
        >
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rb-500">{infra.description}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-rb-500">
            Custody, not lending: the shares this contract holds are not a lender position — it never deposits or
            withdraws on its own. Transfers real lenders make to and from it appear on their own timelines as bridge
            transfers, with this escrow named as the counterparty.
          </p>
        </ContractIdentityCard>
        {custody != null && custody.length > 0 && (
          <MapleCustodyCard infra={infra} holdings={custody} viewHref={tl.viewHref} />
        )}
        <ProvInspectorLayer />
      </div>
    );
  }

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <MapleFlowsPoolContext.Provider value={flowFocus ? flows.pool : null}>
        <div className="py-8 space-y-6">
          <DetailTopRow
            session="maple"
            wallet={wallet}
            owner={{ wallet }}
            assets={stripAssets}
            priceReason={ORACLE_USD_REASON.maple}
            closed={view != null && view.status !== "open"}
          >
            {view && (
              <MapleExportMenu
                view={view}
                events={mapleEvents}
                captions={captions}
                csvFilename={`maple-${wallet}-activity.csv`}
                // A folder's members are not in `mapleEvents`, so a grouped page
                // reads the whole history for the CSV as a windowed one does.
                fetchAllEvents={historyWindow.state === "whole" && !servedFolders?.length ? undefined : fetchAllHistory}
                queued={{
                  protocol: "maple",
                  params: { wallet },
                  totalEvents: lifetimeFiguresKnown(historyWindow) ? tl.totalCount : null,
                }}
                history={markdownHistoryScope(historyWindow, mapleEvents, servedFolders)}
                scopeNote={exportScopeNote(historyWindow, mapleEvents, "this wallet's whole history", servedFolders)}
              />
            )}
          </DetailTopRow>

          {protocolContract && (
            <ContractIdentityCard
              kicker="Protocol contract"
              name={protocolContract.name}
              wallet={wallet}
              contractName={protocolContract.contractName}
            >
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rb-500">
                This address is {protocolContract.role}. It is not a lender position, so the Maple listing leaves it
                out. The timeline below is its record in Maple&rsquo;s pools.
              </p>
            </ContractIdentityCard>
          )}

          {loading ? (
            <DetailBodySkeleton />
          ) : (
            <>
              {view && (
                <MaplePositionCard
                  v={view}
                  receipts
                  viewHref={tl.viewHref}
                  captions={captions ?? undefined}
                  cancelledRequests={cancelledRequests}
                  // The Explanation pane: layman narration of the card's own face
                  // figures (claim, exit rate, escrow, the pool's queue and split).
                  explanation={
                    <MaplePositionExplanation
                      v={view}
                      captions={captions}
                      externalActivity={externalActivity}
                      holdings={holdings}
                      cancelledRequests={cancelledRequests}
                      receivedPools={receivedPools}
                    />
                  }
                />
              )}
              {Object.keys(walletPoolState).length > 0 && <MaplePoolStatsBand poolState={walletPoolState} />}
              {/* Lifetime flows: the bars and the line over the pool's replay
            (lib/maple/flows.ts), in its funds asset, in place of the tower
            (TO-DO-ui-jobs 206). */}
              {view && (
                <LifetimeFlowsPanel
                  scrubber={
                    flows.timeline ? (
                      <>
                        <MapleFlowsPoolSwitch pools={flows.pools} pool={flows.pool} onChange={flows.setPool} />
                        <LifetimeFlowsScrubber key={flows.pool ?? ""} timeline={flows.timeline} />
                      </>
                    ) : null
                  }
                  read={flows.read}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <MapleFlowsNote facts={flows.facts} pools={flows.pools.length} />
                    </div>
                  }
                  learnMore={mapleFlowsContent()}
                />
              )}
              <ChainTruthTimeline
                // The queued export (rails-ops decision 0029) has no row cap: the
                // card offers the CSV whenever the total is known.
                csvExportCeiling={null}
                // Matches `MapleEventCard`'s own `persistKey={`maple:${event.id}`}` —
                // lets pinned mode (the per-event share route) force a landed
                // card's detail panel open on its first mount.
                persistKeyPrefix="maple"
                closed={view ? view.status !== "open" : undefined}
                tl={tl}
                // Tenure-first header: when the account started, how long it has
                // run, how fresh the latest activity is.
                toolbarLeading={
                  view ? (
                    <TimelineActivityHeader
                      events={mapleEvents}
                      folders={servedFolders}
                      closed={view.status !== "open"}
                      // When the position actually opened, not when the window
                      // does — otherwise a wallet with 41,000 events reads as days
                      // old because its oldest loaded card is.
                      firstAt={opening?.firstTimestamp ?? oldestFolderAt}
                      tenurePending={!lifetimeFiguresKnown(historyWindow)}
                      // "in the pool 315 days" runs to today. A wallet that left
                      // and came back names each stretch it held shares.
                      labelTenure={view.status === "open" ? "in the pool" : undefined}
                      lives={lives}
                    />
                  ) : undefined
                }
                runs={MAPLE_QUEUE_FILL_RUNS}
                folderRegister={MAPLE_FOLDER_REGISTER}
                readFolderMembers={readMembers}
                segments={segments}
                liveWindow={
                  sinceLast.length > 0 ? () => <MapleSinceLastEventRow lines={sinceLast} now={mountedNow} /> : undefined
                }
                renderCard={(event, meta) =>
                  isMapleEvent(event) ? (
                    <MapleEventCard
                      event={event}
                      eventNumber={meta.eventNumber}
                      isLast={meta.isLast}
                      times={rowTimes.get(event.id)}
                    />
                  ) : null
                }
              />
              <ProvInspectorLayer />
            </>
          )}
        </div>
      </MapleFlowsPoolContext.Provider>
    </FlowFocusContext.Provider>
  );
}

/** The identity card for an address Rails knows to be a contract rather than a
 *  lender: what it is, and the verified source it was named from. */
function ContractIdentityCard({
  kicker,
  name,
  wallet,
  contractName,
  children,
}: {
  kicker: string;
  name: string;
  wallet: string;
  contractName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="text-[11px] uppercase tracking-wider text-rb-500">{kicker}</div>
      <h1 className="mt-1.5 text-lg font-semibold text-foreground">{name}</h1>
      {children}
      <p className="mt-3 text-sm text-rb-500">
        Contract{" "}
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "address", wallet)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[13px] text-foreground underline decoration-line underline-offset-2 hover:decoration-foreground"
        >
          {wallet}
        </a>{" "}
        — Etherscan-verified as <span className="font-mono text-[13px]">{contractName}</span>.
      </p>
    </div>
  );
}
