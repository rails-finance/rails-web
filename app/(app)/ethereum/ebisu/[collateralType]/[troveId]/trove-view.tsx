"use client";

// Ebisu Trove detail — reference depth, chain-state-first, the 3-section
// anatomy (card → economics → timeline). Position state + timeline replay the
// captured TroveUpdated events; the risk surfaces (liquidation runway,
// collateral ratio, redemption queue, the narration) read live from the
// branch's own contracts via /api/chain/ebisu/position — getLatestTroveData
// (entire debt/coll with pending redistribution + accrued interest, which
// redemptions shrink without the index necessarily seeing it), the simulated
// fetchPrice, and the TroveManager's OWN getCurrentICR (proven BigInt-exact by
// scripts/verify-liquity-forks-chain.mjs). The chain read rides its own
// effect + state so first paint never waits on RPC; a chainStale response
// simply leaves the risk surfaces unrendered.
// Identity is (branch, troveId): a V2 troveId is keccak(owner, index) with no
// branch, so it is unique only WITHIN a branch — the URL carries both segments.
//
// The trove page's client half. Everything interactive lives here — the
// timeline filters, the stored UI state, the export menu, the live branch
// read — while the page above it is a server component that has already
// fetched the tail. Being a client component does not mean rendering on the
// client: React renders this whole subtree to HTML on the server too. What
// made this page blank to a non-JS reader was not the "use client" line, it
// was fetching the data in an effect.
//
// Seeded or not, the mount path still works: when the server read came back
// empty (a backend blip) `initialTrove` is null and this component fetches
// the tail itself, exactly as it did before the route had a server half.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { forkRedistArrival } from "@/lib/shared/liquity-fork-ops";
import { isCollSurplusClaimEvent, isEbisuEvent } from "@/lib/shared/types/event-shape";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { collSurplusClaimEvent } from "@/lib/shared/liquity-coll-surplus-claim";
import { CollSurplusClaimCard } from "@/components/protocol/liquity-family/coll-surplus-claim-card";
import { EBISU_FORK } from "@/components/protocol/ebisu/ebisu-event-card";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import {
  fetchEbisuTimeline,
  fetchEbisuGroupedTimeline,
  type EbisuGroupedTimelineResult,
} from "@/lib/api/fetch-ebisu-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchLiquityForkPosition, type LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LIQUITY_FORK_FOLDER_REGISTER, liquityForkTimelineRuns } from "@/lib/shared/liquity-fork-timeline-runs";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { interleaveRowPlan, servedFoldersEnabled } from "@/lib/shared/timeline-folder";
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { EbisuEventCard } from "@/components/protocol/ebisu/ebisu-event-card";
import {
  EbisuPositionCard,
  viewFromSummary,
  type EbisuTroveView,
} from "@/components/protocol/ebisu/ebisu-position-card";
import { LiquityForkRiskSlot } from "@/components/protocol/liquity-fork/liquity-fork-risk-slot";
import {
  LiquityForkPositionExplanation,
  LiquityForkClosedExplanation,
} from "@/components/protocol/liquity-fork/liquity-fork-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { useLiquityCollSurplus } from "@/hooks/useLiquityCollSurplus";
import { computeEbisuEconomics, ebisuLifetimeWithOpening } from "@/lib/ebisu/economics";
import {
  liquityForkEconomicsExplanation,
  liquityForkEconomicsContent,
  liquityForkRedemptionOutcome,
} from "@/lib/shared/liquity-fork-economics-explanation";
import { DEBT_SYMBOL, EBISU_DOCS, resolveBranch } from "@/lib/ebisu/asset-catalog";
import { forkMcrAt } from "@/lib/shared/liquity-fork-ops";
import { forkPriceGapNotesFor, liveForkPriceGapNote, type ForkPriceGapBranch } from "@/lib/shared/market-note";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const LiquityForkExportMenu = dynamic(
  () => import("@/components/protocol/liquity-fork/liquity-fork-export-menu").then((m) => m.LiquityForkExportMenu),
  { ssr: false },
);

// Redemption touches collapse into one expandable run row — the V2 trove
// treatment via ChainTruthTimeline's runs seam; the spec is shared across the
// three fork explorers. Module-scope so the timeline's row memo keeps a stable id.
const FORK_RUNS = liquityForkTimelineRuns({ is: isEbisuEvent, debtSymbol: DEBT_SYMBOL });

interface EbisuTroveDetailProps {
  collateralType: string;
  troveId: string;
  /** The server read's tail. Null on an SSR miss — this component then fetches. */
  initialTrove: EbisuTroveSummary | null;
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
  /** The grouped answer WHOLE, when the load read its history as ROWS (the
   *  default; `?folders=0` reads the flat window). Its row plan puts the
   *  folders back between the ungrouped events, and its folders carry the
   *  arithmetic the whole-history reductions read. */
  initialGrouped: EbisuGroupedTimelineResult | null;
}

export default function EbisuTroveDetail({
  collateralType,
  troveId,
  initialTrove,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
  initialGrouped,
}: EbisuTroveDetailProps) {
  // One flag, and the loader guarantees it is truthful: the tail arrives
  // whole (summary AND timeline) or not at all, so a seeded view never
  // states an empty history for a trove whose timeline read simply failed.
  const seeded = initialTrove != null;
  const [view, setView] = useState<EbisuTroveView | null>(() => (initialTrove ? viewFromSummary(initialTrove) : null));
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The same history as ROWS (decision 0019's evening amendment): the index
  // groups this family, because every row carries the Trove's collateral and
  // debt either side of it, so a folder standing for a hundred rows leaves
  // nothing here to reconstruct. The grouped answer REPLACES the flat window:
  // `events` holds its ungrouped events and this its row plan and folders.
  const [groupedTail, setGroupedTail] = useState<EbisuGroupedTimelineResult | null>(initialGrouped);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a Trove that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a Trove that does not — nearly every
  // one on this roster — `cutoffBlock` comes back null, no second request is
  // made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<LiquityForkTroveChainResponse | null>(null);
  // The live read has answered, landed or not — the live note's slot is held
  // only until then.
  const [chainSettled, setChainSettled] = useState(false);
  // Standing display framing (risk view) — a global preference, so the reader's
  // choice on one trove carries to the next.

  // Mount. A seeded view already holds the tail and leaves the fetch alone;
  // an unseeded one reads it exactly as this page always did. The ref keeps
  // React's development double-invoke from issuing the read twice.
  const startedTail = useRef(false);
  useEffect(() => {
    if (seeded || startedTail.current) return;
    startedTail.current = true;
    if (!collateralType || !troveId) return;
    (async () => {
      setLoading(true);
      try {
        // The same choice the server half made (`trove-page-data.ts`): ONE
        // timeline read, in the shape the URL asked for.
        const asked = servedFoldersEnabled();
        const [pData, flat, grouped] = await Promise.all([
          fetchEbisuTroves({ troveId, collateralTypes: [collateralType], limit: 1 }),
          asked ? null : fetchEbisuTimeline(collateralType, troveId, { recent: TIMELINE_WINDOW_EVENTS }),
          asked ? fetchEbisuGroupedTimeline(collateralType, troveId) : null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's arithmetic
  // as a lifetime. A failure is a stated failure for the same reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. Only a server-side failure leaves it null with a cutoff block
    // set, which is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: `/api/ebisu/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary`,
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
  }, [collateralType, troveId, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // The live branch read (trove struct / price / ICR / queue) — off the
  // critical path; a failure returns chainStale and the risk surfaces stay off.
  useEffect(() => {
    if (!collateralType || !troveId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLiquityForkPosition({ protocol: "ebisu", branch: collateralType, troveId });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      } finally {
        if (!cancelled) setChainSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collateralType, troveId]);

  const ebisuEvents = useMemo(() => events.filter(isEbisuEvent), [events]);
  // The served list as ROWS, from the same answer as `ebisuEvents`.
  const servedRows = useMemo(
    () => (groupedTail ? interleaveRowPlan(groupedTail.rowPlan, ebisuEvents) : undefined),
    [groupedTail, ebisuEvents],
  );
  /** The folders the index served, whole and unfiltered: the third
   *  contributor to the page's partition, which every whole-history reduction
   *  below adds to `opening + events`. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  /** The rows' times with every folder's first and last member beside them,
   *  so the tenure and the "ago" pill read the Trove's whole span when its
   *  newest or oldest row is a folder. */
  const activityStamps = useMemo(
    () =>
      servedFolders?.length
        ? [...ebisuEvents, ...servedFolders.flatMap((f) => [{ timestamp: f.firstAt }, { timestamp: f.lastAt }])]
        : ebisuEvents,
    [ebisuEvents, servedFolders],
  );

  const lastLiq = ebisuEvents.find((e) => e.context.data.eventType === "liquidate");
  // Redistributions this life received, stated on the card only when the
  // whole history is loaded, so the count is the life's.
  const redistTally = useMemo(() => {
    if (historyWindow.state !== "whole" || (servedFolders?.length ?? 0) > 0) return null;
    let count = 0;
    let debt = 0;
    let coll = 0;
    for (const e of ebisuEvents) {
      const r = forkRedistArrival(e.context.data);
      if (!r) continue;
      count += 1;
      debt += r.debt;
      coll += r.coll;
    }
    return { count, debt, coll };
  }, [ebisuEvents, historyWindow.state, servedFolders]);
  // The liquidation's surplus at the head: claimable or claimed (the index
  // records the credit, never the claim).
  const surplus = useLiquityCollSurplus({
    protocol: "ebisu",
    branch: collateralType,
    owner: view?.status === "liquidated" ? (view.lastOwner ?? view.owner) : null,
    liquidationTx: lastLiq?.txHash,
  });

  // The claim that paid the surplus out, as its own row (the index has none):
  // added to the served rows, so it is numbered, filtered and exported.
  const claimRow = useMemo(
    () =>
      collSurplusClaimEvent({
        source: surplus,
        family: "ebisu",
        protocolName: "Ebisu",
        chainId: MAINNET_CHAIN_ID,
        symbol: view?.collateralType ?? collateralType,
        owner: view?.lastOwner ?? view?.owner,
        creditTx: lastLiq?.txHash,
        creditKind: "liquidation",
        creditAt: lastLiq?.timestamp ?? null,
      }),
    [surplus, view?.collateralType, collateralType, view?.lastOwner, view?.owner, lastLiq],
  );
  const timelineEvents = useMemo(() => (claimRow ? [...ebisuEvents, claimRow] : ebisuEvents), [ebisuEvents, claimRow]);
  const timelineRows = useMemo(
    () => (servedRows && claimRow ? [...servedRows, { kind: "event" as const, event: claimRow }] : servedRows),
    [servedRows, claimRow],
  );
  const timelineTail = useMemo(
    () => (groupedTail && claimRow ? { ...groupedTail, eventsServed: groupedTail.eventsServed + 1 } : groupedTail),
    [groupedTail, claimRow],
  );

  // ── ONE SEGMENT OF TIME, navigated by month ─────────────────────────────
  // Decision 0019, amendments 2026-09-24 and 2026-09-25: a month the loaded
  // rows do not hold is read from the index as its segment
  // (hooks/useTimelineSegment.ts). The preload stays the page's whole-history
  // record; the timeline alone swaps.
  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events: timelineEvents,
    groupedTail: timelineTail,
    servedRows: timelineRows,
    servedFolders,
    opening,
    historyWindow,
    isEvent: isEbisuEvent,
    readGrouped: (span, signal) => fetchEbisuGroupedTimeline(collateralType, troveId, { span, signal }),
    readFlat: (span) => fetchEbisuTimeline(collateralType, troveId, { span }),
    folderPath: `/api/ebisu/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/folder`,
    folderParams: {},
    storageKey: `ebisu-${collateralType}-${troveId}`,
    protocolKey: "ebisu",
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? ebisuEvents : undefined;
  const precomputedLifetime = useMemo(
    () => ebisuLifetimeWithOpening(ebisuEvents, opening, servedFolders),
    [ebisuEvents, opening, servedFolders],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchEbisuTimeline(collateralType, troveId);
    const served = (res.events ?? []).filter(isEbisuEvent);
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [collateralType, troveId]);

  const liveRisk = chain != null && view?.status === "open";

  // Market notes — the Liquity V2 trove page's price stretches, on this fork:
  // every Ebisu row carries the branch price at its block (server mig 342's
  // every-event filler), so a note is a reduction of the rows on the page,
  // computed off the whole sorted list the way V2 computes it. A stretch with a
  // served folder inside it is skipped: the Trove transacted in it, off the
  // page. Notes are never rows, so they count toward nothing (market-note.ts).
  const noteBranch = useMemo<ForkPriceGapBranch | null>(() => {
    const b = resolveBranch(collateralType);
    if (!b) return null;
    const folders = [
      ...(servedFolders ?? []),
      ...(tl.displayedRows ?? []).flatMap((r) => (r.kind === "folder" ? [r.folder] : [])),
    ];
    return {
      protocol: "ebisu",
      collateralType: b.symbol,
      mcr: b.mcr,
      priceFeed: b.priceFeed,
      debtSymbol: DEBT_SYMBOL,
      mcrAt: (block) => forkMcrAt(b, { block }),
      breaks: folders.map((f) => ({ firstBlock: f.firstBlock, lastBlock: f.lastBlock })),
    };
  }, [collateralType, servedFolders, tl.displayedRows]);
  const notes = useMemo(
    () => (noteBranch ? forkPriceGapNotesFor(tl.sortedEvents, noteBranch) : []),
    [tl.sortedEvents, noteBranch],
  );
  // The live note: the Trove's newest priced row against the branch price the
  // live read simulated at the head. Open Troves only, once that read lands.
  const liveNotes = useMemo(() => {
    if (!noteBranch || !liveRisk || !chain || chain.priceUsd == null) return [];
    const n = liveForkPriceGapNote(tl.sortedEvents, noteBranch, { price: chain.priceUsd, block: chain.blockNumber });
    return n ? [n] : [];
  }, [noteBranch, liveRisk, chain, tl.sortedEvents]);

  // The top row's price dropdown: the branch's own oracle
  // price for the collateral — the live chain read when it landed, else the
  // listing route's PriceFeed resolution carried on the view — plus the
  // fork's stable at its $1 redemption face (no separate price source, as
  // with BOLD). An unpriced branch leaves the strip on its tool slot alone.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view) return [];
    const collateralPrice = chain?.priceUsd ?? view.priceUsd ?? null;
    return [
      ...(collateralPrice != null && collateralPrice > 0
        ? [{ symbol: view.collateralType, price: collateralPrice }]
        : []),
      { symbol: DEBT_SYMBOL, price: 1 },
    ];
  }, [view, chain]);

  // A closed Trove's prices: the branch's lastGoodPrice its closing row
  // carries. A row the filler has not priced leaves the dropdown out.
  const closing = useMemo(() => {
    if (!view || view.status === "open") return undefined;
    return closingPricesAt(ebisuEvents, (row) => {
      const usd = row.context.data.priceAtBlock?.usd;
      return usd != null && usd > 0
        ? [
            { symbol: view.collateralType, price: usd },
            { symbol: DEBT_SYMBOL, price: 1 },
          ]
        : undefined;
    });
  }, [view, ebisuEvents]);

  // Terminal narration: the ending mechanism is exact on this fork (closed =
  // the owner's closeTrove; liquidated = the liquidation), and the seizure legs
  // come from the life's own liquidate event once the timeline lands.
  const terminalPane =
    view && view.status !== "open" ? (
      <LiquityForkClosedExplanation
        status={view.status}
        collateralSymbol={view.collateralType}
        debtSymbol={DEBT_SYMBOL}
        peakCollateral={view.peakCollateral}
        peakDebt={view.peakDebt}
        seizure={
          lastLiq
            ? {
                coll: Number(lastLiq.context.data.collBefore) || 0,
                surplus: Number(lastLiq.context.data.liquidation?.collSurplus ?? 0) || 0,
                debt: Number(lastLiq.context.data.debtBefore) || 0,
              }
            : null
        }
        surplus={surplus}
        redist={redistTally}
        redemptionSource="EbisuBranchManager"
      />
    ) : null;

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="ebisu"
        wallet={view?.owner ?? view?.lastOwner ?? null}
        assets={stripAssets}
        closed={view != null && view.status !== "open"}
        closing={closing}
      >
        {view && (
          <LiquityForkExportMenu
            protocolLabel="Ebisu"
            debtSymbol={DEBT_SYMBOL}
            view={view}
            chain={chain}
            events={ebisuEvents}
            csvFilename={`ebisu-${collateralType}-${troveId.slice(0, 10)}-activity.csv`}
            // A grouped page's `events` hold only the ungrouped rows, so its
            // CSV reads the whole history too.
            fetchAllEvents={historyWindow.state === "whole" && !servedFolders?.length ? undefined : fetchAllHistory}
            claimRow={claimRow}
            history={markdownHistoryScope(historyWindow, ebisuEvents, servedFolders)}
            scopeNote={exportScopeNote(historyWindow, ebisuEvents, "this Trove's whole history", servedFolders)}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {view && (
            <EbisuPositionCard
              v={view}
              receipts
              surplus={surplus}
              viewHref={tl.viewHref}
              live={liveRisk ? chain : undefined}
              // The risk slot rides the card's heading-button row (the Aave V3
              // treatment): the Display menu plus the chosen risk picture —
              // liquidation runway (default) or the collateral-ratio card —
              // alongside the always-on redemption runway. Whatever it draws is
              // on the card face and in the card's receipts scope, so the
              // Provenance list stays 1:1 with the face figures.
              rowExtra={liveRisk ? <LiquityForkRiskSlot chain={chain} /> : undefined}
              // The Explanation is now pure prose about those same face figures.
              // The CR strip is absorbed into the risk slot above; the
              // redemption card's branch-context figures live on the protocol
              // view — the card keeps its own queue exposure (the redemption
              // runway) and the trove's own rate (a card stat). A terminal life
              // gets the past-tense closed narration instead — never no pane.
              explanation={
                terminalPane ??
                (liveRisk ? (
                  <LiquityForkPositionExplanation
                    chain={chain}
                    isBatched={view?.isBatched ?? false}
                    redist={redistTally}
                  />
                ) : undefined)
              }
            />
          )}
          {view &&
            (() => {
              const towerData = computeEbisuEconomics(view, lifetimeEvents, precomputedLifetime);
              const forkOpts = {
                name: "Ebisu",
                debtSymbol: DEBT_SYMBOL,
                docsLinks: [...EBISU_DOCS.trove, ...EBISU_DOCS.redemption],
              };
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={liquityForkEconomicsExplanation(towerData, forkOpts)}
                  learnMore={liquityForkEconomicsContent(forkOpts)}
                  rowExtra={liquityForkRedemptionOutcome(towerData, forkOpts)}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            // Matches `EbisuEventCard`'s own `persistKey={`ebisu:${event.id}`}`
            // — lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="ebisu"
            closed={view ? view.status !== "open" : undefined}
            tl={tl}
            notes={notes}
            liveNotes={liveNotes}
            liveNotesPending={view?.status === "open" && !chainSettled}
            runs={FORK_RUNS}
            folderRegister={LIQUITY_FORK_FOLDER_REGISTER}
            readFolderMembers={readFolderMembers}
            segments={segments}
            // Tenure eyebrow (the V2 trove's "Opened … · tenure · ago"), read off
            // the captured event stream — a closed or liquidated life measures
            // its tenure to the last event instead of now.
            toolbarLeading={
              view ? (
                <TimelineActivityHeader
                  events={activityStamps}
                  closed={view.status !== "open"}
                  // When the Trove actually opened, not when the window does —
                  // otherwise a long life reads as days old because its oldest
                  // loaded card is.
                  firstAt={opening?.firstTimestamp}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              ) : undefined
            }
            renderCard={(event, meta) =>
              isCollSurplusClaimEvent(event) ? (
                <CollSurplusClaimCard
                  event={event}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  eventNumber={meta.eventNumber}
                  persistPrefix="ebisu"
                  fork={EBISU_FORK}
                />
              ) : isEbisuEvent(event) ? (
                <EbisuEventCard
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
