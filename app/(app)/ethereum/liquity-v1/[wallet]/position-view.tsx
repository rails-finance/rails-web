"use client";

// Liquity V1 Trove detail — reference depth, chain-state-first. Every value
// below is chain-direct or chain-derived: Trove state +
// timeline replayed from the captured TroveUpdated events (both emitters merged
// server-side), and the risk surfaces (collateral ratio, liquidation runway,
// redemption queue, the position narration) read live from the protocol's own
// contracts via /api/chain/liquity-v1/position (getEntireDebtAndColl /
// getCurrentICR / PriceFeed / a MultiTroveGetter sweep of the sorted list).
//
// The chain read rides its own effect + state so the first paint (card +
// timeline from the index) never waits on RPC round-trips; the risk surfaces
// stream in when the read lands, and a chainStale response simply leaves them
// unrendered. They describe the CURRENT Trove, so they mount only on the
// latest open life — a closed prior epoch shows its replayed history alone.

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCollSurplusClaimEvent, isLiquityV1Event } from "@/lib/shared/types/event-shape";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { collSurplusClaimEvent } from "@/lib/shared/liquity-coll-surplus-claim";
import { CollSurplusClaimCard } from "@/components/protocol/liquity-family/coll-surplus-claim-card";
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
import { CHAIN_TRUTH_USD_DISPLAY_ITEMS, TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { LiquityV1EventCard } from "@/components/protocol/liquity-v1/liquity-v1-event-card";
import { LiquityV1PositionCard, viewFromSummary } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import { redemptionSplit } from "@/lib/liquity-v1/event-figures";
import {
  LiquityV1PositionExplanation,
  LiquityV1ClosedEpochExplanation,
  LiquityV1SupersededExplanation,
} from "@/components/protocol/liquity-v1/liquity-v1-position-explanation";
import { LiquityV1RiskSlot } from "@/components/protocol/liquity-v1/liquity-v1-risk-slot";
import { LifetimeFlowsPanel, type FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
import { liquityFlowTimeline, liquityFocusEvents } from "@/lib/shared/liquity-flows";
import { LiquityV1FlowsNote } from "@/lib/shared/liquity-flows-explanation";
import { liquityV1FlowEvents, liquityV1FlowTxs } from "@/lib/liquity-v1/flows";
import { useLiquityDailyPrices } from "@/hooks/useLiquityDailyPrices";
import { liquityV1RedemptionTotals } from "@/lib/liquity-v1/economics";
import { liquityV1EconomicsContent, liquityV1RedemptionOutcome } from "@/lib/liquity-v1/economics-explanation";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import {
  useLiquityV1EventReads,
  useLiquityV1EventReadState,
  useLiquityV1FlowReads,
  useLiquityV1Surplus,
} from "@/lib/liquity-v1/use-event-read";
import { LiquityV1LivesLine, liquityV1Lives } from "@/components/protocol/liquity-v1/liquity-v1-lives-line";
import { liquityV1OutcomeTxs, liquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { protocolPriceProv } from "@/lib/liquity-v1/position-provenance";
import { eventPriceProv } from "@/lib/liquity-v1/event-provenance";

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
  // A closed life that ended in a full redemption or a liquidation may have left
  // ETH in the CollSurplusPool: read it (claimable, or claimed) for the card.
  const lastRow = v1Events.length > 0 ? v1Events[v1Events.length - 1] : null;
  const closingTx =
    view && view.status !== "open" && lastRow
      ? lastRow.context.data.eventType === "liquidation" ||
        (lastRow.context.data.eventType === "redemption" && Number(lastRow.context.data.debtAfter) <= 1e-9)
        ? lastRow.txHash
        : null
      : null;
  const surplus = useLiquityV1Surplus(closingTx, wallet);
  // The claim that paid that ETH out, as its own row (the index has none).
  // The read builds a fresh object each render, so the row is keyed on the
  // claim itself.
  const claimNow = collSurplusClaimEvent({
    source: surplus,
    family: "liquity-v1",
    protocolName: "Liquity V1",
    chainId: MAINNET_CHAIN_ID,
    symbol: "ETH",
    owner: wallet,
    creditTx: closingTx,
    creditKind: lastRow?.context.data.eventType === "liquidation" ? "liquidation" : "redemption",
    creditAt: lastRow?.timestamp ?? null,
  });
  const claimKey = claimNow
    ? `${claimNow.id}:${claimNow.context?.protocol === "liquity-coll-surplus-claim" ? claimNow.context.data.paidRaw : ""}`
    : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const claimRow = useMemo(() => claimNow, [claimKey]);
  const timelineEvents = useMemo(() => (claimRow ? [...v1Events, claimRow] : v1Events), [v1Events, claimRow]);
  const tl = useTimelineEvents(timelineEvents, {
    storageKey: `liquity-v1-${wallet}-${selectedEpoch ?? "all"}`,
    protocolKey: "liquity-v1",
    window: historyWindow,
    // Navigated by the Lifetime flows chart's Apply: no Dates.
    dates: false,
  });

  // The Lifetime flows panel replays the selected life's whole history
  // (lib/liquity-v1/flows.ts). A windowed page reads the wallet's whole
  // timeline once; a read the row ceiling cut short is a failed read.
  const [flowHistory, setFlowHistory] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  const flowWhole = historyWindow.state === "whole";
  useEffect(() => {
    if (flowWhole || !wallet) return;
    let cancelled = false;
    fetchLiquityV1Timeline(wallet)
      .then((res) => {
        const served = res.events ?? [];
        const missing = Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0);
        if (!cancelled)
          setFlowHistory(missing > 0 ? { events: null, read: "failed" } : { events: served, read: "done" });
      })
      .catch((err) => {
        console.warn("Lifetime flows history not read:", err);
        if (!cancelled) setFlowHistory({ events: null, read: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [flowWhole, wallet]);
  const flowRows = useMemo(
    () =>
      flowWhole
        ? v1Events
        : (flowHistory.events ?? [])
            .filter(isLiquityV1Event)
            .filter((e) => selectedEpoch == null || e.context.data.epoch === selectedEpoch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowWhole, events, selectedEpoch, flowHistory.events],
  );
  // The life's every row, where the page holds them or the panel has read
  // them: the redemption outcome and a liquidation's outcome for its owner
  // sum the whole life.
  const lifeRows = flowWhole || flowHistory.events != null ? flowRows : null;

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
  // is primary truth on the detail page. The Lifetime flows panel replays the
  // recorded rows and takes the live read at today's stop.
  // A liquidated life's outcome for its owner needs every draw of the life, so
  // it is read once the life's whole history is in hand.
  const liquidatedWhole = view?.status === "liquidated" && lifeRows != null;
  const outcomeTxs = useMemo(
    () => (liquidatedWhole && lifeRows ? liquityV1OutcomeTxs(lifeRows) : []),
    [liquidatedWhole, lifeRows],
  );
  const outcomeReads = useLiquityV1EventReads(outcomeTxs, liquidatedWhole ? wallet : null);
  const ownerOutcome = useMemo(
    () => (liquidatedWhole && lifeRows ? liquityV1OwnerOutcome(lifeRows, outcomeReads) : null),
    [liquidatedWhole, outcomeReads, lifeRows],
  );
  const priceNow = chain && !chain.chainStale && chain.price > 0 ? chain.price : null;
  // The redemption outcome needs every redemption row of the life.
  const redemptions = lifeRows ? liquityV1RedemptionTotals(lifeRows, selectedEpoch) : null;
  // How a closed life ended, and the ETH that ending sent back to the owner:
  // all of it at an owner close, the surplus on a full redemption.
  const lastType = lastRow?.context.data.eventType ?? null;
  const endedBy = view?.status === "closed" ? (lastType === "redemption" ? "redemption" : "owner") : null;
  const ethBack =
    view?.status !== "closed" || !lastRow
      ? null
      : lastType === "closeTrove"
        ? Math.abs(Math.min(Number(lastRow.context.data.collDelta) || 0, 0))
        : lastType === "redemption"
          ? (surplus?.surplus ?? redemptionSplit(lastRow.context.data)?.ethSurplus ?? null)
          : null;

  // The wallet's other Trove lives, for the card's line linking them.
  const lives = useMemo(() => (summaries.length > 1 ? liquityV1Lives(summaries, events) : []), [summaries, events]);
  // How the timeline's events divide: the owner's own rows, the redemptions,
  // the liquidation and the surplus claim. Only a page holding the whole
  // history can count them.
  const eventTally =
    historyWindow.state === "whole"
      ? {
          total: v1Events.length + (claimRow ? 1 : 0),
          owner: v1Events.filter(
            (e) => e.context.data.eventType !== "redemption" && e.context.data.eventType !== "liquidation",
          ).length,
          claim: claimRow != null,
        }
      : null;
  // An owner's close carries no captured price, so the closing price comes
  // from the close's receipt read (PriceFeed.lastGoodPrice at its block), the
  // price its opened card shows.
  const closeTx =
    view && view.status !== "open" && lastRow && !(lastRow.context.data.priceAtBlock?.usd ?? 0)
      ? lastRow.txHash
      : undefined;
  const { read: closeRead } = useLiquityV1EventReadState(closeTx, closeTx ? wallet : undefined);

  const chainLive = view?.status === "open" && chain != null && chain.troveStatus === "active" ? chain : null;

  // The owner's transactions' receipts: each event's price at its block and
  // each draw's borrowing fee.
  const flowTxs = useMemo(() => liquityV1FlowTxs(flowRows), [flowRows]);
  const flowReads = useLiquityV1FlowReads(flowWhole || flowHistory.events ? flowTxs : null, wallet);
  // ETH's price at each day's close: Liquity V2's WETH branch, from 19 May 2025.
  const flowDaily = useLiquityDailyPrices("WETH");
  const flowSurplusCredit = surplus && closingTx ? { tx: closingTx, eth: surplus.surplus } : null;
  const flowMapped = useMemo(
    () =>
      liquityV1FlowEvents({
        events: flowRows,
        reads: flowReads,
        daily: flowDaily.obs,
        surplus: flowSurplusCredit,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowRows, flowReads, flowDaily.obs, closingTx, surplus?.surplus],
  );
  // The clock the replay reads: set on mount, so the server's render and the
  // first client render agree.
  const [flowsNow, setFlowsNow] = useState<number | null>(null);
  useEffect(() => setFlowsNow(Date.now() / 1000), []);
  const flowOpen = view?.status === "open";
  const flowSurplusClaimed = surplus?.claimed != null;
  const flowsReady = flowsNow != null && flowDaily.settled && flowReads != null;
  const flowTimeline = useMemo(
    () =>
      !flowsReady || flowMapped.events.length === 0
        ? null
        : liquityFlowTimeline(flowMapped.events, {
            collSymbol: "ETH",
            debtSymbol: "LUSD",
            family: "v1",
            surplusClaimed: flowSurplusClaimed,
            now: flowsNow as number,
            dailyColl: flowDaily.obs,
            live: flowOpen
              ? {
                  price: priceNow,
                  ...(chainLive
                    ? {
                        coll: chainLive.coll,
                        debt: chainLive.debt,
                        redistColl: chainLive.pendingEthReward,
                        redistDebt: chainLive.pendingLusdReward,
                      }
                    : {}),
                }
              : null,
          }),
    [flowsReady, flowMapped, flowSurplusClaimed, flowsNow, flowDaily.obs, flowOpen, priceNow, chainLive],
  );
  const flowsRead: FlowsRead = !flowsReady ? "reading" : flowWhole ? "done" : flowHistory.read;
  // The panel and the timeline are tied by the day: Apply to timeline, each
  // day's mark and each card's ledgers read the same replay.
  const focusEvents = useMemo(() => liquityFocusEvents(flowMapped.events, "ETH", "LUSD", "v1"), [flowMapped]);
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(focusEvents), flowTimeline);
  const lifeNo =
    selectedEpoch != null && summaries.length > 0
      ? {
          n: [...summaries].sort((a, b) => a.epoch - b.epoch).findIndex((s) => s.epoch === selectedEpoch) + 1,
          of: summaries.length,
        }
      : null;
  const faceView =
    view && chainLive
      ? { ...view, collateral: chainLive.coll, debt: chainLive.debt, atBlock: chainLive.blockNumber }
      : view;

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="liquity-v1"
          wallet={wallet}
          assets={
            chain && view?.status === "open" && chain.price > 0
              ? [{ symbol: "ETH", price: chain.price, info: protocolPriceProv() }]
              : []
          }
          closed={view != null && view.status !== "open"}
          closing={
            // The PriceFeed's lastGoodPrice at the closing block, carried on
            // liquidation and redemption rows only.
            view && view.status !== "open"
              ? closingPricesAt(v1Events, (row) => {
                  const usd =
                    row.context.data.priceAtBlock?.usd ??
                    (closeRead && closeRead.txHash === row.txHash.toLowerCase() ? closeRead.priceUsd : null);
                  return usd != null && usd > 0
                    ? [
                        {
                          symbol: "ETH",
                          price: usd,
                          info: eventPriceProv({ txHash: row.txHash, blockNumber: row.blockNumber }, usd),
                        },
                      ]
                    : undefined;
                })
              : undefined
          }
        >
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
              claimRow={claimRow}
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
                surplus={surplus}
                priceUsd={priceNow}
                endedBy={lastRow ? endedBy : null}
                lives={
                  selectedEpoch != null ? (
                    <LiquityV1LivesLine wallet={wallet} lives={lives} epoch={selectedEpoch} />
                  ) : undefined
                }
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
                      surplus={surplus}
                      ownerOutcome={ownerOutcome}
                      outcomePending={liquidatedWhole && outcomeReads == null}
                      redemptions={redemptions}
                      priceNow={priceNow}
                      ethBack={ethBack}
                      eventTally={eventTally}
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
            {/* Lifetime flows: the bars and the line over the life's replay
              (lib/liquity-v1/flows.ts), in place of the tower (TO-DO-ui-jobs 206). */}
            {view && (
              <LifetimeFlowsPanel
                scrubber={flowTimeline ? <LifetimeFlowsScrubber timeline={flowTimeline} /> : null}
                read={flowsRead}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <LiquityV1FlowsNote
                      prices={flowMapped.prices}
                      daily={flowDaily.obs != null}
                      feesUnread={flowMapped.feesUnread}
                      redistributions={flowMapped.redistributions}
                      life={lifeNo}
                    />
                  </div>
                }
                learnMore={liquityV1EconomicsContent()}
                rowExtra={liquityV1RedemptionOutcome(redemptions, priceNow)}
              />
            )}
            <ChainTruthTimeline
              displayItems={CHAIN_TRUTH_USD_DISPLAY_ITEMS}
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
                isCollSurplusClaimEvent(event) ? (
                  <CollSurplusClaimCard
                    event={event}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    eventNumber={meta.eventNumber}
                    persistPrefix="liquity-v1"
                  />
                ) : isLiquityV1Event(event) ? (
                  <LiquityV1EventCard
                    event={event}
                    eventNumber={meta.eventNumber}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    // Today's PriceFeed price — a redemption's net outcome at
                    // today's value. Read on any life: it prices the ETH now.
                    currentPrice={priceNow}
                    ownerOutcome={ownerOutcome}
                  />
                ) : null
              }
            />
            <ProvInspectorLayer />
          </>
        )}
      </div>
    </FlowFocusContext.Provider>
  );
}
