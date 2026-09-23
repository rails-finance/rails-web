"use client";

// Liquity V1 Trove detail — reference depth, chain-state-first. Every value
// below is chain-direct or chain-derived: Trove state +
// timeline replayed from the captured TroveUpdated events (both emitters merged
// server-side), and the risk surfaces (collateral ratio, liquidation runway,
// redemption queue, the position narration) read live from the protocol's own
// contracts via /api/chain/liquity-v1/position (getEntireDebtAndColl /
// getCurrentICR / PriceFeed / a MultiTroveGetter sweep of the sorted list).
//
// The chain read rides its own effect + state so the first paint (card + tower
// + timeline from the index) never waits on RPC round-trips; the risk surfaces
// stream in when the read lands, and a chainStale response simply leaves them
// unrendered. They describe the CURRENT Trove, so they mount only on the
// latest open life — a closed prior epoch shows its replayed history alone.

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import { fetchLiquityV1Timeline } from "@/lib/api/fetch-liquity-v1-timeline";
import { fetchLiquityV1Position, type LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { LIQUITY_V1_REDEMPTION_RUNS } from "@/lib/liquity-v1/timeline-runs";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { LiquityV1EventCard } from "@/components/protocol/liquity-v1/liquity-v1-event-card";
import { LiquityV1PositionCard, viewFromSummary } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import {
  LiquityV1PositionExplanation,
  LiquityV1ClosedEpochExplanation,
  LiquityV1SupersededExplanation,
} from "@/components/protocol/liquity-v1/liquity-v1-position-explanation";
import { LiquityV1RiskSlot } from "@/components/protocol/liquity-v1/liquity-v1-risk-slot";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeLiquityV1Economics, liquityV1LifetimeWithOpening } from "@/lib/liquity-v1/economics";
import { liquityV1EconomicsExplanation, liquityV1EconomicsContent } from "@/lib/liquity-v1/economics-explanation";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the V4 spoke page.
const LiquityV1ExportMenu = dynamic(
  () => import("@/components/protocol/liquity-v1/liquity-v1-export-menu").then((m) => m.LiquityV1ExportMenu),
  { ssr: false },
);

interface LiquityV1TroveViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** `?epoch=`, decoded on the server so the document renders the Trove life
   *  the URL names rather than the latest one and then swapping after
   *  hydration. */
  epochParam: string | null;
  /** Every lifecycle this wallet has had. `null` means the server could not seed
   *  the tail — see lib/liquity-v1/position-page-data.ts for the one case where
   *  it deliberately does not. */
  initialSummaries: LiquityV1PositionSummary[] | null;
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function LiquityV1TroveView({
  wallet,
  epochParam,
  initialSummaries,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: LiquityV1TroveViewProps) {
  // Keyed on the timeline, not the roster: a wallet that never borrowed here is
  // a real answer the server can seed, and its `initialSummaries` is empty.
  const seeded = initialEvents != null;
  const [summaries, setSummaries] = useState<LiquityV1PositionSummary[]>(initialSummaries ?? []);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; when the wallet needs one, the response names the block the
  // window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. A wallet holding fewer events than the
  // window gets `cutoffBlock: null`, no second request is made, and the page is
  // what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<LiquityV1PositionChainResponse | null>(null);
  // Standing display framing (risk view) — a global preference, so the reader's
  // choice on one Trove carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch every lifecycle for this wallet (not limit:1) — a reopened Trove has
        // one summary per (wallet, epoch); the timeline carries all lives' events.
        const [pData, tData] = await Promise.all([
          fetchLiquityV1Positions({ wallet, limit: 100 }),
          fetchLiquityV1Timeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        setSummaries(pData.data);

        // ⚠️ THE WINDOW IS CUT AT THE WALLET; THIS PAGE RENDERS ONE TROVE LIFE.
        // rails-server keys `?recent=N` and its /summary twin on the wallet, and
        // the summary's `totalEvents`, `byAction`, `byDay` and `firstTimestamp`
        // describe every life the wallet has had. This page's position is
        // (wallet, epoch) — the grain the listing and the positions endpoint
        // both use — so on a wallet with more than one life those figures are
        // about a DIFFERENT position than the list below them: the filter menu
        // would count another Trove's adjustments, the tenure would name the
        // date the wallet first borrowed rather than the date this Trove opened,
        // and a life lying entirely below the cut would draw no cards at all.
        //
        // Where the wallet has exactly one life the two grains coincide and
        // every seeded surface is exact, so the window stands. Otherwise the
        // whole history is fetched, as it was before — one extra request, and
        // only on a wallet deep enough to have been windowed at all (the
        // deepest Liquity V1 wallet in the index holds 1,482 events across
        // three lives, so this costs nothing today).
        //
        // Windowing a multi-life wallet needs an `epoch` parameter on both
        // backend routes. That was weighed and DECLINED rather than deferred:
        // of the 9,348 (wallet, epoch) lives in the index exactly one exceeds
        // the 1,000-event window, and it does so by 19 events. Liquity V1 is
        // immutable, so its depth ceiling rises on its own and the count is
        // worth re-measuring — at the life grain, not the wallet grain — before
        // that conclusion is reused.
        const lifeScoped = (tData.cutoffBlock ?? null) != null && pData.data.length !== 1;
        const rows = lifeScoped ? await fetchLiquityV1Timeline(wallet) : tData;
        setEvents(rows.events ?? []);
        setCutoffBlock(rows.cutoffBlock ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet, seeded]);

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
    if (!wallet || cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/liquity-v1/timeline/summary",
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

  // The live contract read (ratio / runway / redemption queue) — off the
  // critical path; a failure returns chainStale and the risk surfaces stay off.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLiquityV1Position({ wallet });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  // Which Trove life this page shows: the ?epoch= param if it resolves, else the
  // latest life (highest epoch). Old links without ?epoch land on the current life.
  const epochNum = epochParam != null && epochParam !== "" ? Number(epochParam) : null;
  const selected =
    (epochNum != null ? summaries.find((s) => s.epoch === epochNum) : undefined) ??
    [...summaries].sort((a, b) => b.epoch - a.epoch)[0];
  const selectedEpoch = selected?.epoch ?? null;
  const view = selected ? viewFromSummary(selected) : null;

  // Slice the timeline to the selected life so a closed prior Trove and the current
  // one each show only their own events.
  const v1Events = events
    .filter(isLiquityV1Event)
    .filter((e) => selectedEpoch == null || e.context.data.epoch === selectedEpoch);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. It is narrowed to the SAME life/loan the
  // page is showing, so the spreadsheet covers the position on screen.
  const fetchAllHistory = useCallback(
    async () =>
      await (async () => {
        const res = await fetchLiquityV1Timeline(wallet);
        const served = res.events ?? [];
        return {
          events: served
            .filter(isLiquityV1Event)
            .filter((e) => selectedEpoch == null || e.context.data.epoch === selectedEpoch),
          missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
        };
      })(),
    [wallet, selectedEpoch],
  );
  const tl = useTimelineEvents(v1Events, {
    storageKey: `liquity-v1-${wallet}-${selectedEpoch ?? "all"}`,
    protocolKey: "liquity-v1",
    window: historyWindow,
  });

  // ⚠️ The lifetime layer covers BOTH halves of the cut, and only when both are
  // in hand. `lifetimeEvents` is undefined while the opening balance is pending
  // or failed, and `computeLiquityV1Economics` already treats an absent event
  // list as "no lifetime layer" — so the tower states nothing rather than
  // presenting the window's arithmetic as this Trove's all-time flows.
  //
  // The merge is scoped to the SELECTED EPOCH: a wallet closes a Trove and opens
  // another under the same address, and the summary's flow buckets carry the
  // epoch precisely so a previous life's deposits and draws cannot be added into
  // this one's lifetime.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? v1Events : undefined;
  const precomputedLifetime = useMemo(
    () => liquityV1LifetimeWithOpening(v1Events, opening, selectedEpoch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, opening, selectedEpoch],
  );

  // The selected life's first captured event — the closed-epoch narration's
  // "active from" anchor (the view model carries only the last activity).
  // On a windowed page the oldest LOADED card is not the life's first event, so
  // the opening balance's own first timestamp leads — it is this life's opening
  // exactly, the window standing only where the wallet has one life.
  const loadedOpenedAt = v1Events.length > 0 ? Math.min(...v1Events.map((e) => e.timestamp)) : null;
  const epochOpenedAt =
    opening?.firstTimestamp != null && (loadedOpenedAt == null || opening.firstTimestamp < loadedOpenedAt)
      ? opening.firstTimestamp
      : loadedOpenedAt;

  // The captured index is FROZEN while the protocol moves, so once the live
  // read lands the card face takes the chain's entire balances (pending
  // redistribution included — getEntireDebtAndColl, the same figures the pane,
  // risk slot and export already speak). The 0006 carve-out: the chain overlay
  // is primary truth on the detail page. The tower keeps the replayed view —
  // its lifetime flows reconcile against the recorded absolutes and its
  // receipts declare that basis.
  const chainLive = view?.status === "open" && chain != null && chain.troveStatus === "active" ? chain : null;
  const faceView =
    view && chainLive
      ? { ...view, collateral: chainLive.coll, debt: chainLive.debt, atBlock: chainLive.blockNumber }
      : view;

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="liquity-v1" wallet={wallet}>
        {view && (
          <LiquityV1ExportMenu
            wallet={wallet}
            view={view}
            // The live read describes the CURRENT Trove — a closed prior life
            // serializes its replayed history alone.
            chain={view.status === "open" ? chain : null}
            events={v1Events}
            csvFilename={`liquity-v1-${wallet.slice(0, 10)}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, v1Events)}
            scopeNote={exportScopeNote(historyWindow, v1Events, "this wallet's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {view && faceView && (
            <LiquityV1PositionCard
              v={faceView}
              receipts
              live={chainLive != null}
              viewHref={tl.viewHref}
              // The risk slot rides the card's heading-button row (the Aave V3
              // treatment): the Display menu plus the chosen risk picture —
              // liquidation runway (default) or the collateral-ratio card —
              // alongside the always-on redemption runway. Whatever it draws is
              // on the card face and in the card's receipts scope, so the
              // Provenance list stays 1:1 with the face figures. Mounts only for
              // the open life with the live read landed (it describes the
              // CURRENT on-chain Trove).
              rowExtra={
                chain && view.status === "open" && chain.troveStatus === "active" ? (
                  <LiquityV1RiskSlot chain={chain} />
                ) : undefined
              }
              // The Explanation is now pure prose about those same face figures
              // (the 3-section page anatomy: card → economics → timeline). The
              // CR strip is absorbed into the risk slot above; the redemption
              // card's protocol-wide figures (fees, absolute debt-in-front) live
              // on the system view — the card keeps its own queue exposure.
              explanation={
                chain && view.status === "open" && chain.troveStatus === "active" ? (
                  <LiquityV1PositionExplanation chain={chain} />
                ) : view.status !== "open" ? (
                  // A past life narrates its own recorded figures, past tense.
                  // The live strips (CR, runway, redemption queue) describe the
                  // chain NOW and would be false about THEN, so they stay off.
                  // The life's final event witnesses WHICH of the three closure
                  // mechanisms ended it (owner close / full redemption /
                  // liquidation) — the lead derives it rather than assuming.
                  <LiquityV1ClosedEpochExplanation
                    v={view}
                    openedAt={epochOpenedAt}
                    lastAction={v1Events.length > 0 ? v1Events[v1Events.length - 1].context.data.eventType : null}
                  />
                ) : chain && chain.troveStatus !== "active" ? (
                  // Index says open, the chain says the Trove has since closed
                  // — narrate the divergence rather than rendering nothing.
                  <LiquityV1SupersededExplanation chain={chain} />
                ) : (
                  // The open life before the chain read lands (the Fluid
                  // treatment): the pane, and the copy-view link at its foot,
                  // mount with the card and narrate nothing yet.
                  <LiquityV1PositionExplanation chain={null} />
                )
              }
            />
          )}
          {/* USD valuation uses the protocol's LIVE price for open AND closed
                lives alike: the all-time bars are historical flows either way,
                and both read at the price the protocol reports now. Economics
                takes chain only for that price, so a closed life's story stays
                drawable. */}
          {view &&
            (() => {
              const towerData = computeLiquityV1Economics(view, lifetimeEvents, chain, precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={liquityV1EconomicsExplanation(towerData)}
                  learnMore={liquityV1EconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            // Matches `LiquityV1EventCard`'s own `persistKey={`liquity-v1:${event.id}`}`
            // — lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="liquity-v1"
            closed={view ? view.status !== "open" : undefined}
            tl={tl}
            runs={LIQUITY_V1_REDEMPTION_RUNS}
            // Tenure-first header (the V4 spoke treatment) for the shown Trove
            // life: opened / active-since, tenure, freshness.
            toolbarLeading={
              view ? (
                <TimelineActivityHeader
                  events={v1Events}
                  closed={view.status !== "open"}
                  // When the position actually opened, not when the window does.
                  firstAt={opening?.firstTimestamp}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              ) : undefined
            }
            renderCard={(event, meta) =>
              isLiquityV1Event(event) ? (
                <LiquityV1EventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                />
              ) : null
            }
          />
          {/* Ambient price pill (the V4 treatment): the protocol's own
              PriceFeed ETH:USD, live while the shown life is the open one. */}
          <PriceStrip
            assets={chain && view?.status === "open" && chain.price > 0 ? [{ symbol: "ETH", price: chain.price }] : []}
            leading={<ProvInspectorToggle />}
          />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
