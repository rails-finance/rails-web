"use client";

// Basedollar Trove detail — reference depth, chain-state-first, the 3-section
// anatomy (card → economics → timeline). Position state + timeline replay the
// captured TroveUpdated events; the risk surfaces (liquidation runway,
// collateral ratio, redemption queue, the narration) read live from the
// branch's own contracts via /api/chain/basedollar/position — getLatestTroveData
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
import { isBasedollarEvent } from "@/lib/shared/types/event-shape";
import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { fetchBasedollarTimeline } from "@/lib/api/fetch-basedollar-timeline";
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
import { liquityForkTimelineRuns } from "@/lib/shared/liquity-fork-timeline-runs";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { BasedollarEventCard } from "@/components/protocol/basedollar/basedollar-event-card";
import {
  BasedollarPositionCard,
  viewFromSummary,
  type BasedollarTroveView,
} from "@/components/protocol/basedollar/basedollar-position-card";
import { LiquityForkRiskSlot } from "@/components/protocol/liquity-fork/liquity-fork-risk-slot";
import {
  LiquityForkPositionExplanation,
  LiquityForkClosedExplanation,
} from "@/components/protocol/liquity-fork/liquity-fork-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeBasedollarEconomics, basedollarLifetimeWithOpening } from "@/lib/basedollar/economics";
import {
  liquityForkEconomicsExplanation,
  liquityForkEconomicsContent,
} from "@/lib/shared/liquity-fork-economics-explanation";
import { DEBT_SYMBOL } from "@/lib/basedollar/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
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
const FORK_RUNS = liquityForkTimelineRuns({ is: isBasedollarEvent, debtSymbol: DEBT_SYMBOL });

interface BasedollarTroveDetailProps {
  collateralType: string;
  troveId: string;
  /** The server read's tail. Null on an SSR miss — this component then fetches. */
  initialTrove: BasedollarTroveSummary | null;
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function BasedollarTroveDetail({
  collateralType,
  troveId,
  initialTrove,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: BasedollarTroveDetailProps) {
  // One flag, and the loader guarantees it is truthful: the tail arrives
  // whole (summary AND timeline) or not at all, so a seeded view never
  // states an empty history for a trove whose timeline read simply failed.
  const seeded = initialTrove != null;
  const [view, setView] = useState<BasedollarTroveView | null>(() =>
    initialTrove ? viewFromSummary(initialTrove) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
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
        const [pData, tData] = await Promise.all([
          fetchBasedollarTroves({ troveId, collateralTypes: [collateralType], limit: 1 }),
          fetchBasedollarTimeline(collateralType, troveId, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
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
      path: `/api/basedollar/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary`,
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
        const data = await fetchLiquityForkPosition({ protocol: "basedollar", branch: collateralType, troveId });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collateralType, troveId]);

  const basedollarEvents = useMemo(() => events.filter(isBasedollarEvent), [events]);
  const tl = useTimelineEvents(basedollarEvents, {
    storageKey: `basedollar-${collateralType}-${troveId}`,
    protocolKey: "basedollar",
    window: historyWindow,
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? basedollarEvents : undefined;
  const precomputedLifetime = useMemo(
    () => basedollarLifetimeWithOpening(basedollarEvents, opening),
    [basedollarEvents, opening],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchBasedollarTimeline(collateralType, troveId);
    const served = (res.events ?? []).filter(isBasedollarEvent);
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [collateralType, troveId]);

  const liveRisk = chain != null && view?.status === "open";

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

  // Terminal narration: the ending mechanism is exact on this fork (closed =
  // the owner's closeTrove; liquidated = the liquidation), and the seizure legs
  // come from the life's own liquidate event once the timeline lands.
  const lastLiq = basedollarEvents.find((e) => e.context.data.eventType === "liquidate");
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
                debt: Number(lastLiq.context.data.debtBefore) || 0,
              }
            : null
        }
      />
    ) : null;

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="basedollar" wallet={view?.owner ?? view?.lastOwner ?? null} assets={stripAssets}>
        {view && (
          <LiquityForkExportMenu
            protocolLabel="Basedollar"
            debtSymbol={DEBT_SYMBOL}
            view={view}
            chain={chain}
            events={basedollarEvents}
            csvFilename={`basedollar-${collateralType}-${troveId.slice(0, 10)}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, basedollarEvents)}
            scopeNote={exportScopeNote(historyWindow, basedollarEvents, "this Trove's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {view && (
            <BasedollarPositionCard
              v={view}
              receipts
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
                  <LiquityForkPositionExplanation chain={chain} isBatched={view?.isBatched ?? false} />
                ) : undefined)
              }
            />
          )}
          {view &&
            (() => {
              const towerData = computeBasedollarEconomics(view, lifetimeEvents, precomputedLifetime);
              const forkOpts = {
                name: "Base Dollar",
                debtSymbol: DEBT_SYMBOL,
                docsLink: { label: "Basedollar", url: "https://basedollar.money" },
              };
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={liquityForkEconomicsExplanation(towerData, forkOpts)}
                  learnMore={liquityForkEconomicsContent(forkOpts)}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            closed={view ? view.status !== "open" : undefined}
            // Matches `BasedollarEventCard`'s own
            // `persistKey={`basedollar:${event.id}`}` — lets pinned mode (the
            // per-event share route) force a landed card's detail panel open
            // on its first mount.
            persistKeyPrefix="basedollar"
            tl={tl}
            runs={FORK_RUNS}
            // Tenure eyebrow (the V2 trove's "Opened … · tenure · ago"), read off
            // the captured event stream — a closed or liquidated life measures
            // its tenure to the last event instead of now.
            toolbarLeading={
              view ? (
                <TimelineActivityHeader
                  events={basedollarEvents}
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
              isBasedollarEvent(event) ? (
                <BasedollarEventCard
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
