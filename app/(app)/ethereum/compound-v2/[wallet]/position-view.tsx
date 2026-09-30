"use client";

// Compound V2 position detail — reference depth, chain-state-first, the
// 3-section anatomy (card → economics → timeline). Every value is chain-direct
// or chain-derived: position state + timeline replayed from the captured
// cToken events, and the risk surfaces (runway, borrow capacity, market rates,
// the position narration) read live from the protocol's own contracts via
// /api/chain/compound-v2/position — per-market balances + borrowBalanceStored,
// the Comptroller's oracle prices and collateral factors, and the
// Comptroller's OWN getAccountLiquidity verdict. The tuple (liquidity,
// shortfall) is the chain fact; the HF-style ratio beside it is an
// explicitly-labeled replica.
//
// Compound V2 cross-collateralises its twenty markets through one Comptroller,
// so ONE chain fetch covers the whole account. It rides its own effect + state
// so the first paint (card + tower + timeline from the index) never waits on
// RPC round-trips; the risk surfaces stream in when the read lands, a
// chainStale response simply leaves them unrendered, and the debt rows upgrade
// from the last event's emitted accountBorrows to the live borrowBalanceStored
// (each row's `live` flag carries the basis into the provenance).

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import { fetchCompoundV2Positions } from "@/lib/api/fetch-compound-v2-positions";
import type { CompoundV2PositionSummary } from "@/lib/sources/api/compound-v2-positions";
import {
  fetchCompoundV2Timeline,
  fetchCompoundV2GroupedTimeline,
  type CompoundV2GroupedTimelineResult,
} from "@/lib/api/fetch-compound-v2-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchCompoundV2ChainPosition, type CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { COMPOUND_V2_FOLDER_REGISTER, COMPOUND_V2_LIQUIDATION_RUNS } from "@/lib/compound-v2/timeline-runs";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { interleaveRowPlan, servedFoldersEnabled } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { CompoundV2EventCard } from "@/components/protocol/compound-v2/compound-v2-event-card";
import {
  CompoundV2PositionCard,
  viewFromSummary,
  type CompoundV2PositionView,
} from "@/components/protocol/compound-v2/compound-v2-position-card";
import {
  CompoundV2PositionExplanation,
  CompoundV2ClosedPositionExplanation,
} from "@/components/protocol/compound-v2/compound-v2-position-explanation";
import { CompoundV2RiskSlot } from "@/components/protocol/compound-v2/compound-v2-risk-slot";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import {
  computeCompoundV2Economics,
  compoundV2LifetimeWithOpening,
  computeCompoundV2CardCaptions,
} from "@/lib/compound-v2/economics";
import { compoundV2EconomicsExplanation, compoundV2EconomicsContent } from "@/lib/compound-v2/economics-explanation";
import { compoundV2Ledger, compoundV2PricePairs } from "@/lib/compound-v2/ledger";
import { fetchCompoundV2PricesAt } from "@/lib/api/fetch-compound-v2-prices-at";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { externalActor, summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { liquidationStories } from "@/lib/shared/ctoken-liquidation-story";
import { balancePeaks, withBalancePeaks } from "@/lib/shared/ctoken-peaks";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the Moonwell page.
const CompoundV2ExportMenu = dynamic(
  () => import("@/components/protocol/compound-v2/compound-v2-export-menu").then((m) => m.CompoundV2ExportMenu),
  { ssr: false },
);

interface CompoundV2PositionViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  initialPosition: CompoundV2PositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — an account with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
  /** The grouped answer WHOLE, when the load read its history as ROWS (the
   *  default; `?folders=0` reads the flat window). Its row plan puts the
   *  folders back between the ungrouped events, and its folders carry the
   *  arithmetic the whole-history reductions read. */
  initialGrouped: CompoundV2GroupedTimelineResult | null;
}

export default function CompoundV2PositionView({
  wallet,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
  initialGrouped,
}: CompoundV2PositionViewProps) {
  // Keyed on the timeline, not the row: an account Compound V2 has never seen
  // is a real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<CompoundV2PositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The same history as ROWS (decision 0019's evening amendment): the index
  // groups this family, because every row carries its own running state, so a
  // folder standing for a hundred rows leaves nothing here to reconstruct. The
  // grouped answer REPLACES the flat window: `events` holds its ungrouped
  // events and this its row plan and folders, and the two move together.
  const [groupedTail, setGroupedTail] = useState<CompoundV2GroupedTimelineResult | null>(initialGrouped);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on an account that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On an account that does not — the
  // overwhelming majority — `cutoffBlock` comes back null, no second request
  // is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<CompoundV2ChainResponse | null>(null);
  // Standing display framing (risk view) — a global preference, so the
  // reader's choice on one position carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet) return;
    (async () => {
      setLoading(true);
      try {
        // The same choice the server half made (`position-page-data.ts`): ONE
        // timeline read, in the shape the URL asked for.
        const asked = servedFoldersEnabled();
        const [pData, flat, grouped] = await Promise.all([
          fetchCompoundV2Positions({ wallet, limit: 1 }),
          asked ? null : fetchCompoundV2Timeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
          asked ? fetchCompoundV2GroupedTimeline(wallet) : null,
        ]);
        const tData = grouped ?? flat;
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData?.events ?? []);
        setCutoffBlock(tData?.cutoffBlock ?? null);
        setGroupedTail(grouped);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet, seeded]);

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
      path: "/api/compound-v2/timeline/summary",
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

  // The live per-account read (Comptroller verdict / balances / rates) — off
  // the critical path; a failure returns chainStale and the risk surfaces
  // simply stay unrendered.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCompoundV2ChainPosition({ wallet });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  // Upgrade the debt rows to the live borrowBalanceStored when the chain read
  // landed — the `live` flag routes each row (and the interest split) onto the
  // live-lane provenance. Supplies keep the listing row's chain read (same
  // exchangeRateStored basis).
  const liveView = useMemo<CompoundV2PositionView | null>(() => {
    if (!view || !chain || view.status !== "open") return view;
    return {
      ...view,
      borrows: view.borrows.map((b) => {
        const m = chain.markets.find((x) => x.market === b.market);
        return m && m.borrowUnderlying > 0
          ? { ...b, amount: m.borrowUnderlying, amountRaw: m.borrowBalanceRaw, live: true }
          : b;
      }),
    };
  }, [view, chain]);

  const v2Events = useMemo(() => events.filter(isCompoundV2Event), [events]);
  // The tx-sibling seam: each card reaches its same-tx peers so a seize leg can
  // name the debt market of the liquidation it belongs to.
  const siblingsByTx = useMemo(() => groupEventsByTx(v2Events), [v2Events]);

  // The served list as ROWS, from the same answer as `v2Events`.
  const servedRows = useMemo(
    () => (groupedTail ? interleaveRowPlan(groupedTail.rowPlan, v2Events) : undefined),
    [groupedTail, v2Events],
  );
  /** The folders the index served, whole and unfiltered: the third
   *  contributor to the page's partition, which every whole-history reduction
   *  below adds to `opening + events`. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  /** The oldest member any folder stands for, so a page whose oldest row is a
   *  folder still dates the position from inside it. */
  const oldestFolderAt = useMemo(
    () =>
      servedFolders?.reduce<number | undefined>(
        (min, f) => (min == null || f.firstAt < min ? f.firstAt : min),
        undefined,
      ),
    [servedFolders],
  );

  // ── ONE SEGMENT OF TIME, navigated by month ─────────────────────────────
  // Decision 0019, amendments 2026-09-24 and 2026-09-25: a month the loaded
  // rows do not hold is read from the index as its segment
  // (hooks/useTimelineSegment.ts). The preload stays the page's whole-history
  // record; the timeline alone swaps.
  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events: v2Events,
    groupedTail,
    servedRows,
    servedFolders,
    opening,
    historyWindow,
    isEvent: isCompoundV2Event,
    readGrouped: (span, signal) => fetchCompoundV2GroupedTimeline(wallet, { span, signal }),
    readFlat: (span) => fetchCompoundV2Timeline(wallet, { span }),
    folderPath: "/api/compound-v2/timeline/folder",
    folderParams: { wallet },
    storageKey: `compound-v2-${wallet}`,
    protocolKey: "compound-v2",
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the reducers treat an absent event list as "no lifetime
  // layer" rather than as an empty one — so the surfaces state nothing while
  // they cannot state the whole, which is the only correct answer between the
  // two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? v2Events : undefined;
  const precomputedLifetime = useMemo(
    () => compoundV2LifetimeWithOpening(v2Events, opening, servedFolders),
    [v2Events, opening, servedFolders],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchCompoundV2Timeline(wallet);
    const served = (res.events ?? []).filter(isCompoundV2Event);
    // The proxy's page cap, passed through rather than absorbed: a download
    // that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.totalEvents ?? served.length) - served.length, 0),
    };
  }, [wallet]);

  // Who executed this account's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole history so the
  // Explanation can state it once. Derived from the events already on the page;
  // no new field on the position response. V2's party param is the event's own
  // emitted payer/counterparty (`caller`).
  //
  // Liquidations and the seize legs are excluded, exactly as the card excludes
  // them from the external glyph: those carry their own critical treatment and
  // name a LIQUIDATOR — a different party from the third-party actor this
  // counts, on a different kind of event.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        v2Events
          .filter(
            (e) =>
              e.context.data.eventType !== "liquidation" &&
              e.context.data.eventType !== "seize_out" &&
              e.context.data.eventType !== "seize_burn" &&
              e.context.data.eventType !== "seize_in",
          )
          .map((e) => ({ txFrom: e.context.data.txFrom, poolCaller: e.context.data.caller, wallet: e.wallet })),
      ),
    [v2Events],
  );

  // On a windowed page the opening balance's own split is added: rails-server
  // reconstructs the same verdict from the base tables with the same
  // exclusions, so both halves judge on the same fact and never count one
  // event twice. The opening total subtracts the excluded actions (the
  // liquidation row and the three seize legs) from the summarised count, so
  // the proportion divides the same quantity the loaded half counts.
  //
  // The folders add theirs the same way: rails-server judges a member with the
  // same exclusions, and their excluded members leave the total as the
  // opening's do.
  const externalActivityWithOpening = useMemo(() => {
    const excluded = new Set(["liquidation", "seize_out", "seize_in", "seize_burn"]);
    const withOpening = opening
      ? withOpeningActors(
          externalActivity,
          opening.actors,
          opening.totalEvents - opening.byAction.reduce((n, b) => n + (excluded.has(b.key) ? b.count : 0), 0),
        )
      : externalActivity;
    if (!servedFolders || servedFolders.length === 0) return withOpening;
    const merged = withFolderActors(withOpening, servedFolders);
    const folderExcluded = servedFolders.reduce(
      (n, f) => n + f.counts.reduce((m, c) => m + (excluded.has(c.key) ? c.count : 0), 0),
      0,
    );
    return { ...merged, total: merged.total - folderExcluded };
  }, [externalActivity, opening, servedFolders]);

  // Stat captions (accrued interest, borrow rate) — the event stream feeds the
  // interest splits; the rates ride the listing row's per-market chain read.
  // The ledger (each flow at its own block's price, the transfers, seizures
  // and interest on both sides) needs every row on the page: a windowed or
  // grouped history keeps the lifetime layer above.
  const wholeRows = historyWindow.state === "whole" && (servedFolders?.length ?? 0) === 0 && v2Events.length > 0;
  const [eventPrices, setEventPrices] = useState<Map<string, number> | null>(null);
  const pricePairs = useMemo(() => (wholeRows ? compoundV2PricePairs(v2Events) : []), [wholeRows, v2Events]);
  useEffect(() => {
    if (pricePairs.length === 0) return;
    const ac = new AbortController();
    fetchCompoundV2PricesAt(pricePairs, ac.signal)
      .then((m) => setEventPrices(m))
      .catch(() => {
        // Today's prices stand in; the receipts say which.
      });
    return () => ac.abort();
  }, [pricePairs]);
  const ledger = useMemo(
    () => (wholeRows && eventPrices ? compoundV2Ledger(v2Events, eventPrices) : null),
    [wholeRows, eventPrices, v2Events],
  );

  // What each liquidation did, and a closed card's peaks as each row's balance
  // before and after it (interest included), where the page holds every row.
  const cardView = useMemo<CompoundV2PositionView | null>(() => {
    if (!liveView) return liveView;
    const counted = { ...liveView, eventTotal: lifetimeKnown ? tl.totalCount : undefined };
    if (!wholeRows) return counted;
    const liquidations = liquidationStories(
      v2Events.map((e) => {
        const d = e.context.data;
        return {
          timestamp: e.timestamp,
          txHash: e.txHash,
          kind: d.eventType === "liquidation" ? "liquidation" : d.eventType === "repay" ? "repay" : "other",
          market: d.market,
          symbol: d.marketSymbol,
          amount: d.assetsDelta != null ? Math.abs(Number(d.assetsDelta)) : undefined,
          debtBefore: d.debtBefore != null ? Number(d.debtBefore) : undefined,
          debtAfter: d.debtAfter != null ? Number(d.debtAfter) : undefined,
          byOwner: externalActor({ txFrom: d.txFrom, poolCaller: d.caller }, e.wallet) == null,
        };
      }),
    );
    if (liveView.status === "open") return { ...counted, liquidations };
    const peaks = balancePeaks(
      v2Events.map((e) => {
        const d = e.context.data;
        return {
          market: d.market,
          decimals: COMPOUND_V2_MARKET_BY_KEY[d.market]?.decimals ?? 18,
          side: d.side,
          supplyBefore: d.supplyBefore,
          supplyAfter: d.supplyAfter,
          debtBefore: d.debtBefore,
          debtAfter: d.debtAfter,
        };
      }),
    );
    return {
      ...counted,
      liquidations,
      peakSupplies: withBalancePeaks(liveView.peakSupplies, peaks, "supply"),
      peakBorrows: withBalancePeaks(liveView.peakBorrows, peaks, "debt"),
    };
  }, [liveView, wholeRows, v2Events, lifetimeKnown, tl.totalCount]);

  const captions = liveView ? computeCompoundV2CardCaptions(liveView, lifetimeEvents, precomputedLifetime) : null;
  const towerData = liveView ? computeCompoundV2Economics(liveView, lifetimeEvents, precomputedLifetime, ledger) : null;

  // The top row's price dropdown: the on-chain oracle price of each
  // market the account currently touches. Deduped by the underlying token
  // (the two WBTC markets share one asset; cETH keys on its own market).
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view || view.status !== "open") return [];
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const r of [...view.supplies, ...view.borrows]) {
      const cat = COMPOUND_V2_MARKET_BY_KEY[r.market];
      const address = (cat?.underlying ?? cat?.ctoken ?? r.market).toLowerCase();
      if (seen.has(address)) continue;
      seen.add(address);
      const p = view.priceByMarket?.[r.market];
      if (typeof p === "number" && p > 0) out.push({ symbol: r.symbol, address, price: p });
    }
    return out;
  }, [view]);

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="compound-v2"
        wallet={wallet}
        assets={stripAssets}
        closed={liveView != null && liveView.status !== "open"}
      >
        {liveView && (
          <CompoundV2ExportMenu
            wallet={wallet}
            view={liveView}
            chain={chain}
            events={v2Events}
            csvFilename={`compound-v2-${wallet.slice(0, 10)}-activity.csv`}
            // A folder's members are not in the page's events, so a grouped page
            // reads the whole history for the CSV as a windowed one does.
            fetchAllEvents={historyWindow.state === "whole" && !servedFolders?.length ? undefined : fetchAllHistory}
            queued={{
              protocol: "compound-v2",
              params: { wallet },
              totalEvents: lifetimeFiguresKnown(historyWindow) ? tl.totalCount : null,
            }}
            history={markdownHistoryScope(historyWindow, v2Events, servedFolders)}
            scopeNote={exportScopeNote(historyWindow, v2Events, "this wallet's whole history", servedFolders)}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {liveView && cardView && (
            <CompoundV2PositionCard
              v={cardView}
              receipts
              viewHref={tl.viewHref}
              captions={captions ?? undefined}
              // The risk slot rides the card's heading-button row (the Aave V3
              // treatment): the Display menu plus the chosen risk picture — the
              // health-REPLICA runway (1.0 = the Comptroller's shortfall line —
              // the verdict itself is stated in the Explanation below) or the
              // borrow-capacity bar. Whatever it draws is on the card face and
              // in the card's receipts scope, so the Provenance list stays 1:1
              // with the face figures.
              rowExtra={
                chain && liveView.status === "open" && chain.healthReplica != null && chain.healthReplica > 0 ? (
                  <CompoundV2RiskSlot chain={chain} />
                ) : undefined
              }
              // The Explanation is now pure layman prose about those same face
              // figures — no secondary figure-strips. The borrow-capacity strip
              // is absorbed into the risk slot above; the market rates live on
              // the market view (where pool-wide rate context belongs). A
              // terminal account narrates from the index alone (peaks, closure,
              // liquidation record) — it has no live state to read, so the
              // closed mood never waits on the chain lane.
              explanation={
                liveView.status !== "open" ? (
                  <CompoundV2ClosedPositionExplanation v={cardView} />
                ) : (
                  // Passed before the chain read lands (the Fluid treatment):
                  // the pane, and the copy-view link at its foot, mount with
                  // the card rather than with the read.
                  <CompoundV2PositionExplanation
                    chain={chain}
                    liquidationCount={liveView.liquidationCount}
                    captions={captions}
                    txCount={liveView.txCount}
                    externalActivity={externalActivityWithOpening}
                  />
                )
              }
            />
          )}
          {towerData && (
            <ChainTruthTower
              data={towerData}
              explanation={compoundV2EconomicsExplanation(towerData)}
              learnMore={compoundV2EconomicsContent()}
            />
          )}
          <ChainTruthTimeline
            // The queued export (rails-ops decision 0029) has no row cap: the
            // card offers the CSV whenever the total is known.
            csvExportCeiling={null}
            // Matches `CompoundV2EventCard`'s own `persistKey={`compound-v2:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="compound-v2"
            closed={liveView ? liveView.status !== "open" : undefined}
            tl={tl}
            runs={COMPOUND_V2_LIQUIDATION_RUNS}
            folderRegister={COMPOUND_V2_FOLDER_REGISTER}
            readFolderMembers={readFolderMembers}
            segments={segments}
            // Tenure-first header: when the account started, how long it has
            // run, how fresh the latest activity is.
            toolbarLeading={
              liveView ? (
                <TimelineActivityHeader
                  events={v2Events}
                  folders={servedFolders}
                  closed={liveView.status !== "open"}
                  // When the account actually opened, not when the window does.
                  firstAt={opening?.firstTimestamp ?? oldestFolderAt}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              ) : undefined
            }
            renderCard={(event, meta) =>
              isCompoundV2Event(event) ? (
                <CompoundV2EventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  siblings={siblingsByTx.get(event.txHash) ?? [event]}
                />
              ) : null
            }
          />
          {/* Ambient oracle-price pill, fixed bottom-right. */}
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
