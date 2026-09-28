"use client";

// Morpho position detail — a reference-depth explorer at reference depth: one view,
// the chain's own values.
// Two lanes feed it: the live index (position summary + replayed
// timeline) and the LIVE chain lane (/api/chain/morpho/position — the
// singleton's own slots at head, the market's own oracle and IRM), which powers
// the risk surfaces (narration, HF runway, borrow-capacity strip, market rates)
// and upgrades the current-debt figure to head. Morpho exposes no public
// health getter, so the health surfaces replicate the internal _isHealthy
// arithmetic — verified against mainnet by scripts/verify-morpho-chain.mjs.
// Provenance: the position card and the economics tower are each a receipts
// scope, read by the page-level inspector.

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";
import type { MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import {
  fetchMorphoTimeline,
  fetchMorphoGroupedTimeline,
  type MorphoGroupedTimelineResult,
} from "@/lib/api/fetch-morpho-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchMorphoPosition, type MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MORPHO_FOLDER_REGISTER, MORPHO_LIQUIDATION_RUNS } from "@/lib/morpho/timeline-runs";
import { interleaveRowPlan, servedFoldersEnabled } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { MorphoEventCard } from "@/components/protocol/morpho/morpho-event-card";
import {
  MorphoPositionCard,
  viewFromSummary,
  type MorphoPositionView,
} from "@/components/protocol/morpho/morpho-position-card";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeMorphoEconomics, morphoLifetimeWithOpening } from "@/lib/morpho/economics";
import { morphoEconomicsExplanation, morphoEconomicsContent } from "@/lib/morpho/economics-explanation";
import { MorphoRiskSlot } from "@/components/protocol/morpho/morpho-risk-slot";
import {
  MorphoPositionExplanation,
  MorphoClosedPositionExplanation,
} from "@/components/protocol/morpho/morpho-position-explanation";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the V4 spoke page.
const MorphoExportMenu = dynamic(
  () => import("@/components/protocol/morpho/morpho-export-menu").then((m) => m.MorphoExportMenu),
  { ssr: false },
);

interface MorphoPositionViewProps {
  /** `<marketId>-<user>`, as it appears in the URL. */
  positionId: string;
  initialPosition: MorphoPositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a (market, user) pair with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
  /** The grouped answer WHOLE, when the load read its history as ROWS (the
   *  default; `?folders=0` reads the flat window). Its row plan puts the
   *  folders back between the ungrouped events, and its folders carry the
   *  arithmetic the whole-history reductions read. */
  initialGrouped: MorphoGroupedTimelineResult | null;
}

export default function MorphoPositionView({
  positionId,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
  initialGrouped,
}: MorphoPositionViewProps) {
  // Keyed on the timeline, not the row: a pair the singleton has never seen is
  // a real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<MorphoPositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The same history as ROWS (decision 0019's evening amendment): the index
  // groups this family, because every row carries the position's own running
  // collateral and debt, so a folder leaves nothing here to reconstruct. The
  // grouped answer REPLACES the flat window: `events` holds its ungrouped
  // events and this its row plan and folders.
  const [groupedTail, setGroupedTail] = useState<MorphoGroupedTimelineResult | null>(initialGrouped);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — the
  // overwhelming majority — `cutoffBlock` comes back null, no second request
  // is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [chain, setChain] = useState<MorphoChainPositionResponse | null>(null);
  const [loading, setLoading] = useState(!seeded);
  // Standing display framing (risk view) — a global preference, so the
  // reader's choice on one position carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded) return;
    (async () => {
      setLoading(true);
      try {
        const { market: mkt, user: usr } = splitMorphoPositionId(positionId);
        // The same choice the server half made (`position-page-data.ts`): ONE
        // timeline read, in the shape the URL asked for.
        const asked = servedFoldersEnabled();
        const [pData, flat, grouped] = await Promise.all([
          fetchMorphoPositions({ market: mkt, user: usr, limit: 1 }),
          asked ? null : fetchMorphoTimeline(positionId, { recent: TIMELINE_WINDOW_EVENTS }),
          asked ? fetchMorphoGroupedTimeline(positionId) : null,
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
  }, [positionId, seeded]);

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
      path: "/api/morpho/timeline/summary",
      params: { positionId },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionId, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // Live chain lane — off the critical render path. Reads the singleton's own
  // slots at head (+ the market's oracle and IRM) for the risk surfaces; on
  // failure the response is a chainStale stub and the surfaces simply stay off.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { market: mkt, user: usr } = splitMorphoPositionId(positionId);
        if (!mkt || !usr) return;
        const res = await fetchMorphoPosition({ market: mkt, user: usr });
        if (!cancelled) setChain(res.chainStale ? null : res);
      } catch {
        if (!cancelled) setChain(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [positionId]);

  const morphoEvents = useMemo(() => events.filter(isMorphoEvent), [events]);
  // The served list as ROWS, from the same answer as `morphoEvents`.
  const servedRows = useMemo(
    () => (groupedTail ? interleaveRowPlan(groupedTail.rowPlan, morphoEvents) : undefined),
    [groupedTail, morphoEvents],
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
    events: morphoEvents,
    groupedTail,
    servedRows,
    servedFolders,
    opening,
    historyWindow,
    isEvent: isMorphoEvent,
    readGrouped: (span, signal) => fetchMorphoGroupedTimeline(positionId, { span, signal }),
    readFlat: (span) => fetchMorphoTimeline(positionId, { span }),
    folderPath: `/api/morpho/position/${encodeURIComponent(positionId)}/timeline/folder`,
    folderParams: {},
    storageKey: `morpho-${positionId}`,
    protocolKey: "morpho",
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? morphoEvents : undefined;
  const precomputedLifetime = useMemo(
    () => morphoLifetimeWithOpening(morphoEvents, opening, servedFolders),
    [morphoEvents, opening, servedFolders],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchMorphoTimeline(positionId);
    const served = (res.events ?? []).filter(isMorphoEvent);
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [positionId]);

  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole history so the
  // Explanation can state it once. Derived from the events already on the page;
  // no new field on the position response.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        morphoEvents.map((e) => ({
          txFrom: e.context.data.txFrom,
          poolCaller: e.context.data.caller,
          wallet: e.wallet,
        })),
      ),
    [morphoEvents],
  );

  // On a windowed page the opening balance's own split is added: rails-server
  // reconstructs the same two-fact verdict from the base tables (liquidation
  // excluded, exactly as the rows exclude it), so both halves judge on the
  // same fact and never count one event twice.
  //
  // The folders add theirs the same way: rails-server judges a member by the
  // route's own two-fact verdict, liquidations excluded.
  const externalActivityWithOpening = useMemo(() => {
    const withOpening = withOpeningActors(externalActivity, opening?.actors, opening?.totalEvents ?? 0);
    return servedFolders && servedFolders.length > 0 ? withFolderActors(withOpening, servedFolders) : withOpening;
  }, [externalActivity, opening, servedFolders]);

  // Upgrade the card's current-debt figure to the live head read when the chain
  // lane agrees with the index wei-exact on borrow shares (the verified normal
  // case — scripts/verify-morpho-chain.mjs) — the same toAssetsUp conversion,
  // fresher operands (interest accrued to head in view). On any disagreement
  // the backend pairing stays untouched.
  const liveView = useMemo(() => {
    if (!view || !chain || view.status !== "open") return view;
    if (chain.borrowSharesRaw !== view.borrowSharesRaw || chain.currentDebt <= 0) return view;
    return {
      ...view,
      currentDebt: {
        amount: chain.currentDebt,
        accruedAmount: Math.max(0, chain.currentDebt - view.borrowed),
        totalBorrowAssets: chain.totalBorrowAssetsRaw,
        totalBorrowShares: chain.totalBorrowSharesRaw,
      },
    };
  }, [view, chain]);

  // The top row's price dropdown. Morpho Blue runs no USD oracle: a market's
  // oracle prices the collateral in that market's own loan token, which is the
  // space the liquidation engine judges in, so that is what the collateral row
  // carries. The loan token is the unit it is quoted in and has no price of its
  // own, so its row names the asset and stops there.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    const v = liveView;
    if (!v) return [];
    const out: LatestPriceAsset[] = [];
    if (v.collateralSymbol) {
      const oracle = chain && !chain.chainStale && chain.oraclePrice > 0 ? chain.oraclePrice : undefined;
      out.push({
        symbol: v.collateralSymbol,
        address: v.collateralToken,
        price: oracle,
        unit: oracle ? v.loanSymbol : undefined,
        label: `${v.collateralSymbol} in ${v.loanSymbol} (the market's own oracle)`,
      });
    }
    out.push({ symbol: v.loanSymbol, address: v.loanToken, label: `${v.loanSymbol}, the market's loan token` });
    return out;
  }, [liveView, chain]);

  // A closed position's prices: the market oracle at the closing block, which
  // the index carries on liquidation rows only. A position its owner closed
  // has no read there, and the dropdown is left out.
  const closing = useMemo(() => {
    const v = liveView;
    if (!v || v.status === "open" || !v.collateralSymbol) return undefined;
    const collateralSymbol = v.collateralSymbol;
    return closingPricesAt(morphoEvents, (row) => {
      const price = row.context.data.oraclePriceAtBlock?.loanPerCollateral;
      if (price == null || !(price > 0)) return undefined;
      return [
        {
          symbol: collateralSymbol,
          address: v.collateralToken,
          price,
          unit: v.loanSymbol,
          label: `${collateralSymbol} in ${v.loanSymbol} (the market's own oracle)`,
        },
        { symbol: v.loanSymbol, address: v.loanToken, label: `${v.loanSymbol}, the market's loan token` },
      ];
    });
  }, [liveView, morphoEvents]);

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="morpho"
        assets={stripAssets}
        priceReason={ORACLE_USD_REASON.morpho}
        closed={liveView != null && liveView.status !== "open"}
        closing={closing}
      >
        {liveView && (
          <MorphoExportMenu
            view={liveView}
            chain={chain}
            events={morphoEvents}
            csvFilename={`morpho-${positionId.slice(0, 10)}-activity.csv`}
            // A folder's members are not in `morphoEvents`, so a grouped page
            // reads the whole history for the CSV as a windowed one does.
            fetchAllEvents={historyWindow.state === "whole" && !servedFolders?.length ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, morphoEvents, servedFolders)}
            scopeNote={exportScopeNote(historyWindow, morphoEvents, "this position's whole history", servedFolders)}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {liveView && (
            <MorphoPositionCard
              v={liveView}
              receipts
              viewHref={tl.viewHref}
              // The risk slot rides the card's heading-button row (the Aave V3
              // treatment): the Display menu plus the chosen risk picture —
              // liquidation runway or the borrow-capacity bar (the market's one
              // LLTV line + "available to borrow"). Whatever it draws is on the
              // card face and in the card's receipts scope, so the Provenance
              // list stays 1:1 with the face figures.
              rowExtra={
                chain && chain.healthFactor != null && chain.healthFactor > 0 ? (
                  <MorphoRiskSlot chain={chain} />
                ) : undefined
              }
              // The Explanation is now pure layman prose about those same face
              // figures — no secondary figure-strips. The borrow-capacity strip
              // is absorbed into the risk slot above; the market rates live on
              // the market view (where pool-wide rate context belongs).
              // A terminal position narrates from the replay + the timeline
              // already on the page (no chain overlay needed); the open pane
              // still needs the live overlay for the oracle and health facts
              // and declines without it.
              explanation={
                liveView.status !== "open" ? (
                  <MorphoClosedPositionExplanation v={liveView} events={morphoEvents} folders={servedFolders} />
                ) : chain ? (
                  <MorphoPositionExplanation
                    chain={chain}
                    txCount={liveView.txCount}
                    everLiquidated={liveView.everLiquidated}
                    externalActivity={externalActivityWithOpening}
                  />
                ) : undefined
              }
            />
          )}
          {liveView &&
            (() => {
              const towerData = computeMorphoEconomics(liveView, lifetimeEvents ?? [], undefined, precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={morphoEconomicsExplanation(towerData)}
                  learnMore={morphoEconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            // Matches `MorphoEventCard`'s own `persistKey={`morpho:${event.id}`}`
            // — lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="morpho"
            closed={liveView?.status !== "open"}
            tl={tl}
            runs={MORPHO_LIQUIDATION_RUNS}
            folderRegister={MORPHO_FOLDER_REGISTER}
            readFolderMembers={readFolderMembers}
            segments={segments}
            toolbarLeading={
              <TimelineActivityHeader
                events={tl.sortedEvents}
                folders={servedFolders}
                closed={liveView?.status !== "open"}
                // When the position actually opened, not when the window does.
                firstAt={opening?.firstTimestamp ?? oldestFolderAt}
                tenurePending={!lifetimeFiguresKnown(historyWindow)}
              />
            }
            renderCard={(event, meta) =>
              isMorphoEvent(event) ? (
                <MorphoEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                />
              ) : null
            }
          />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
