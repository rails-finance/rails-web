"use client";

// Frankencoin position detail — chain-state-first, the 3-section anatomy
// (card → economics → timeline + the challenge forensics card). The route is
// ONE segment because a position IS its own contract — the address is the
// page key; the owner is shown on the card and honored through every
// OwnershipTransferred.
//
// THE CHAIN OVERLAY IS THE PRIMARY TRUTH here (the 0006 carve-out): the card,
// the risk strips and the narration all read the Position contract's own
// slots at head via /api/chain/frankencoin/position — collateral balance,
// minted, the owner-declared price → liq. price, the fee frame, the
// lifecycle clocks, the live challenge state. The indexed backend contributes
// what head state cannot say — the DENIED lifecycle (PositionDenied is not
// head-observable), the challenge tallies, and the event timeline — and while
// that index is still being filled, its surfaces state PENDING plainly rather
// than fabricate.
//
// Risk grammar (NO health factor, none invented): challenge status + the
// owner-declared liq. price + the expiration countdown + the cooldown. Units
// are native everywhere; no dollar renders on this page.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DRAINED_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import { fetchFrankencoinPositions } from "@/lib/api/fetch-frankencoin-positions";
import { fetchFrankencoinTimeline } from "@/lib/api/fetch-frankencoin-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { fetchFrankencoinChainPosition, type FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";
import type { FrankencoinPositionSummary } from "@/lib/sources/api/frankencoin-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { FRANKENCOIN_AUCTION_RUNS } from "@/lib/frankencoin/timeline-runs";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { FrankencoinEventCard } from "@/components/protocol/frankencoin/frankencoin-event-card";
import {
  FrankencoinPositionCard,
  viewFromChain,
  mergeChainAndSummary,
  viewFromSummary,
  type FrankencoinPositionView,
  type FrankencoinEnding,
} from "@/components/protocol/frankencoin/frankencoin-position-card";
import {
  FrankencoinPositionExplanation,
  type FrankencoinEventTally,
} from "@/components/protocol/frankencoin/frankencoin-position-explanation";
import { FrankencoinChallengeCard } from "@/components/protocol/frankencoin/frankencoin-challenge-card";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import {
  FrankencoinFlowsNote,
  frankencoinFlowsContent,
} from "@/components/protocol/frankencoin/frankencoin-flows-note";
import { useFrankencoinFlows } from "@/hooks/useFrankencoinFlows";
import { frankencoinLifetimeDebt } from "@/lib/frankencoin/flows";
import { FRANKENCOIN_ADDRESSES, normalizePositionAddress } from "@/lib/frankencoin/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { formatDayMonth } from "@/lib/date";
import { phaseText } from "@/lib/frankencoin/figures";
import { FrankencoinPageFactsProvider, frankencoinPageFacts } from "@/lib/frankencoin/page-facts";
import {
  applyFrankencoinOpening,
  prefetchFrankencoinEventReads,
  useFrankencoinOpening,
} from "@/lib/frankencoin/use-event-read";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const FrankencoinExportMenu = dynamic(
  () => import("@/components/protocol/frankencoin/frankencoin-export-menu").then((m) => m.FrankencoinExportMenu),
  { ssr: false },
);

interface FrankencoinPositionViewProps {
  /** The position's own contract address, normalised by the server route — a
   *  Frankencoin position IS its contract, so this is the identity, not the
   *  owner. Anything that is not an address answered 404. */
  position: string;
  initialSummary: FrankencoinPositionSummary | null;
  /** The index lane's history. `null` means the server could not read it, and
   *  the effect below reads it exactly as this page always did — the index
   *  surfaces stay in their explicit PENDING state until it lands. An EMPTY
   *  array is a real answer and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function FrankencoinPositionView({
  position,
  initialSummary,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: FrankencoinPositionViewProps) {
  // Keyed on the timeline, not the row: a position the index has not captured
  // is a real answer the server can seed, and its `initialSummary` is null.
  const indexSeeded = initialEvents != null;
  const [chain, setChain] = useState<FrankencoinChainResponse | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  const [summary, setSummary] = useState<FrankencoinPositionSummary | null>(initialSummary);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  const [indexPending, setIndexPending] = useState(!indexSeeded);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — every
  // Frankencoin position observed so far — `cutoffBlock` comes back null, no
  // second request is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);

  // The chain lane — the position's own slots at head, the page's primary
  // truth. It renders the card on its own; the index enriches it.
  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchFrankencoinChainPosition({ position });
        if (!cancelled) {
          if (!data.chainStale) setChain(data);
          setChainSettled(true);
        }
      } catch {
        if (!cancelled) setChainSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position]);

  // The index lane — history + the facts head state cannot say (DENIED, the
  // challenge tallies). The backend is being filled in parallel: a failure
  // leaves these surfaces in their explicit PENDING state, never fabricated.
  // A seeded view already holds the index lane and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (indexSeeded || !position) return;
    let cancelled = false;
    (async () => {
      try {
        const [pData, tData] = await Promise.all([
          fetchFrankencoinPositions({ position, limit: 1 }),
          fetchFrankencoinTimeline(position, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        if (!cancelled) {
          setSummary(pData.data[0] ?? null);
          setEvents(tData.events ?? []);
          setCutoffBlock(tData.cutoffBlock ?? null);
          setIndexPending(false);
        }
      } catch (err) {
        // The chain lane above is independent and still reads.
        console.error("frankencoin detail index fetch failed:", err);
        if (!cancelled) setIndexPending(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position, indexSeeded]);

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
      path: "/api/frankencoin/timeline/summary",
      params: { position },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // Chain-first view, index-merged when it lands; index-only as the fallback
  // while RPC is down.
  const view = useMemo<FrankencoinPositionView | null>(() => {
    if (chain) {
      const v = viewFromChain(chain);
      return summary ? mergeChainAndSummary(v, summary) : v;
    }
    return summary ? viewFromSummary(summary) : null;
  }, [chain, summary]);

  const indexedEvents = useMemo(() => events.filter(isFrankencoinEvent), [events]);
  // An original's opening transaction, read from its receipt: the Open row's
  // deposit, fee and terms, and the first ledger row corrected to what its own
  // transaction moved (the index books the opening deposit there).
  const { read: openingRead, pending: openingPending } = useFrankencoinOpening(indexedEvents);
  const frankEvents = useMemo(() => applyFrankencoinOpening(indexedEvents, openingRead), [indexedEvents, openingRead]);

  // What each event card needs from the rest of the page: challenge starts,
  // the phase length, the family's original, what each transaction recorded.
  const pageFacts = useMemo(
    () => ({
      ...frankencoinPageFacts(frankEvents, chain?.challengePeriod ?? null, chain?.original ?? null),
      opening: openingRead?.opening ?? null,
      openingPending,
    }),
    [frankEvents, chain, openingRead, openingPending],
  );

  // Start the receipt reads the cards will ask for as soon as the rows land,
  // so an opened mint or challenge has its figures in place.
  useEffect(() => {
    if (frankEvents.length > 0) prefetchFrankencoinEventReads(frankEvents);
  }, [frankEvents]);

  // The clone's parent (PositionOpened names it) and the last mint, whose rate
  // a closed card states.
  const cloneParent = useMemo(
    () => frankEvents.find((e) => e.context.data.eventType === "clone")?.context.data.original ?? null,
    [frankEvents],
  );
  const lastMint = useMemo(() => {
    for (let i = frankEvents.length - 1; i >= 0; i--) {
      const e = frankEvents[i];
      const d = e.context.data;
      const after = Number(d.minted ?? NaN);
      const before = Number(d.mintedBefore ?? NaN);
      if (Number.isFinite(after) && Number.isFinite(before) && after > before && d.eventType !== "auction_settlement")
        return e;
    }
    return null;
  }, [frankEvents]);

  // How a terminal position ended: the forced sale that sold its collateral
  // and the denial, from the timeline.
  const ending = useMemo<FrankencoinEnding | null>(() => {
    const sold = pageFacts.forcedSales.filter((f) => f.amount > 0);
    const last = sold[sold.length - 1];
    const denied = frankEvents.find((e) => e.context.data.eventType === "denied");
    const saleAmounts = Object.values(pageFacts.txSold);
    if (!last && !denied && saleAmounts.length === 0) return null;
    // The last ledger row, written in a challenge sale's transaction, left the
    // position empty: the sale closed it.
    const lastLedger = [...frankEvents].reverse().find((e) => e.context.data.collateral != null);
    const closedByChallenge =
      lastLedger != null &&
      Number(lastLedger.context.data.collateral) === 0 &&
      (pageFacts.txKinds[lastLedger.txHash] ?? []).includes("challenge_succeeded");
    return {
      forcedAt: last?.timestamp ?? null,
      soldMost: saleAmounts.length > 0 ? Math.max(...saleAmounts) : null,
      deniedAt: denied?.timestamp ?? null,
      closedByChallenge,
    };
  }, [pageFacts, frankEvents]);

  // How the timeline's events divide over the transactions, for the card's
  // counter sentence. Whole history only: a window's rows are not the count.
  const eventTally = useMemo<FrankencoinEventTally | null>(() => {
    if (cutoffBlock != null || frankEvents.length === 0) return null;
    const byTx = new Map<string, typeof frankEvents>();
    for (const e of frankEvents) {
      const list = byTx.get(e.txHash) ?? [];
      list.push(e);
      byTx.set(e.txHash, list);
    }
    let biggest: (typeof frankEvents)[number][] = [];
    for (const list of byTx.values()) if (list.length > biggest.length) biggest = list;
    const kinds = biggest.map((e) => e.context.data);
    const count = (pred: (c: (typeof kinds)[number]) => boolean) => kinds.filter(pred).length;
    const parts: string[] = [];
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
    if (count((c) => c.eventType === "clone")) parts.push("the clone");
    if (count((c) => c.eventType === "open")) parts.push("the opening");
    if (count((c) => c.firstState === true)) parts.push("the first deposit and mint");
    const prices = count((c) => c.eventType === "adjust_price");
    if (prices) parts.push(plural(prices, "a price change", "price changes"));
    const handovers = count((c) => c.eventType === "ownership_transferred" && c.initialization === true);
    if (handovers) parts.push(plural(handovers, "an ownership handover", "ownership handovers"));
    const described = count(
      (c) =>
        c.eventType === "clone" ||
        c.eventType === "open" ||
        c.firstState === true ||
        c.eventType === "adjust_price" ||
        (c.eventType === "ownership_transferred" && c.initialization === true),
    );
    return {
      total: frankEvents.length,
      biggest: {
        count: biggest.length,
        opening: kinds.some((c) => c.eventType === "clone" || c.eventType === "open"),
        parts: described === biggest.length ? parts : [],
      },
    };
  }, [frankEvents, cutoffBlock]);

  const tl = useTimelineEvents(frankEvents, {
    storageKey: `frankencoin-${position}`,
    protocolKey: "frankencoin",
    window: historyWindow,
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: false,
  });

  // A closed card's lifetime line reads the whole history only: a window's
  // rows are not the life.
  const lifetimeDebt = useMemo(
    () => (historyWindow.state === "whole" ? frankencoinLifetimeDebt(frankEvents) : null),
    [frankEvents, historyWindow.state],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchFrankencoinTimeline(position);
    const served = (res.events ?? []).filter(isFrankencoinEvent);
    // The proxy's page cap, passed through rather than absorbed: a download
    // that is short must not happen at all.
    return {
      events: served,
      missing: Math.max((res.totalEvents ?? served.length) - served.length, 0),
    };
  }, [position]);

  // The Lifetime flows panel replays the position's whole history
  // (lib/frankencoin/flows.ts): the page's rows where they are all of it, else
  // the flat history read once (the CSV's read), the opening transaction's
  // figures put in place; a read short of the whole history is a failed read.
  const prepareFlows = useCallback(
    (evs: BaseActivityEvent[]) => applyFrankencoinOpening(evs.filter(isFrankencoinEvent), openingRead),
    [openingRead],
  );
  const flowLive = useMemo(
    () => (chain ? { coll: chain.collateral ?? null, debt: chain.minted ?? null } : null),
    [chain],
  );
  const flows = useFrankencoinFlows({
    wholeEvents: historyWindow.state === "whole" ? frankEvents : null,
    fetchAll: fetchAllHistory,
    prepare: prepareFlows,
    preparing: openingPending,
    collSymbol: view?.collateralSymbol ?? null,
    open: view != null && view.status !== "closed",
    live: flowLive,
    liveSettled: chainSettled,
  });
  const flowFocus = flows.read !== "failed" ? flows.focus : null;

  if (position == null) {
    return (
      <div className="py-8">
        <p className="text-sm text-rb-500">Not a Frankencoin position — the key is not a contract address.</p>
      </div>
    );
  }

  const loading = !chainSettled && view == null;

  // The top row's price dropdown: the two tokens a position stands on, and no
  // figure beside either. Frankencoin runs no oracle, so nothing in the
  // protocol states what a collateral is worth. The one number that looks like
  // a price is `liqPrice`, and it is not one: the owner DECLARES it at mint and
  // the challenge auctions enforce or refute it. Putting a declaration in a
  // list headed "Prices" would read as a market reading, which is the whole
  // reason this explorer renders no USD. It stays on the card, where the card
  // says whose number it is.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    if (!view) return [];
    return [
      {
        symbol: view.collateralSymbol,
        address: chain?.collateralToken ?? undefined,
        label: chain?.collateralName
          ? `${view.collateralSymbol} (on-chain name: ${chain.collateralName}), the position's collateral`
          : `${view.collateralSymbol}, the position's collateral`,
      },
      { symbol: "ZCHF", address: FRANKENCOIN_ADDRESSES.ZCHF, label: "ZCHF, the token this position mints" },
    ];
  }, [view, chain]);

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="frankencoin"
          owner={{ wallet: view?.owner }}
          assets={stripAssets}
          priceReason={ORACLE_USD_REASON.frankencoin}
          closed={view != null && view.status !== "open"}
        >
          {view && (
            <FrankencoinExportMenu
              position={position}
              view={view}
              chain={chain}
              events={frankEvents}
              csvFilename={`frankencoin-${position.slice(0, 10)}-activity.csv`}
              fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
              history={markdownHistoryScope(historyWindow, frankEvents)}
              scopeNote={exportScopeNote(historyWindow, frankEvents, "this position's whole history")}
            />
          )}
        </DetailTopRow>

        {loading ? (
          <DetailBodySkeleton />
        ) : view == null ? (
          <div className="text-sm text-rb-500">
            Nothing readable at this address — not a Frankencoin Position contract, or the chain read is unavailable.
          </div>
        ) : (
          <>
            <FrankencoinPageFactsProvider value={pageFacts}>
              <FrankencoinPositionCard
                v={view}
                cloneParent={cloneParent}
                ending={ending}
                lifetimeDebt={lifetimeDebt}
                receipts
                viewHref={tl.viewHref}
                // Closed by default, remembered per viewer and position (ui-jobs
                // 209). A running challenge stays in view; the challenge tally,
                // the phase length and the minting cooldown, from the
                // position's slots at head, sit in the opened layer.
                disclosureKey={`frankencoin:${view.position.toLowerCase()}`}
                challengeAlert={
                  chain && view.status !== "closed" && (chain.challengedAmount ?? 0) > 0 ? (
                    <RiskFigure alignStart caution>
                      Under challenge — {chain.challengedAmount} {view.collateralSymbol} in auction
                    </RiskFigure>
                  ) : undefined
                }
                collateralDetail={
                  chain && view.status === "open" ? (
                    <>
                      {(chain.challengedAmount ?? 0) > 0 ? null : summary ? (
                        <RiskFigure alignStart>
                          {summary.challengeCount === 0
                            ? "never challenged"
                            : `challenged ${summary.challengeCount}×, none running`}
                        </RiskFigure>
                      ) : null}
                      {chain.challengePeriod != null && chain.challengePeriod > 0 ? (
                        <RiskFigure alignStart>challenge phases {phaseText(chain.challengePeriod)} each</RiskFigure>
                      ) : null}
                    </>
                  ) : undefined
                }
                debtDetail={
                  chain && view.status === "open" ? (
                    chain.cooldownActive && chain.cooldownUntil != null ? (
                      <RiskFigure alignStart>minting cooldown until {formatDayMonth(chain.cooldownUntil)}</RiskFigure>
                    ) : !chain.mintingDisabledForGood ? (
                      <RiskFigure alignStart>no minting cooldown</RiskFigure>
                    ) : undefined
                  ) : undefined
                }
                // Everything describing the CURRENT on-chain position lives on
                // the card: the Explanation heading-button holds the narration —
                // mounted when the live read landed.
                explanation={
                  chain ? (
                    <FrankencoinPositionExplanation
                      chain={chain}
                      openedAt={summary?.openedAt}
                      challengeCount={summary?.challengeCount}
                      denied={summary?.status === "denied"}
                      txCount={summary?.txCount}
                      eventTally={eventTally}
                      cloneParent={cloneParent}
                      lastMint={lastMint}
                      ending={ending}
                      closedAt={summary?.lastActivityAt ?? null}
                    />
                  ) : undefined
                }
              />

              {/* Lifetime flows: the bars and the line over the position's
              replay (lib/frankencoin/flows.ts), the collateral in its token
              and the debt in ZCHF, in place of the tower (TO-DO-ui-jobs 206). */}
              <LifetimeFlowsPanel
                scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                read={flows.read}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <FrankencoinFlowsNote
                      facts={flows.facts}
                      collSymbol={view.collateralSymbol}
                      clone={chain?.isClone ?? cloneParent != null}
                    />
                  </div>
                }
                learnMore={frankencoinFlowsContent()}
              />

              {/* The challenge forensics card — grouped by (hub, challenge
              number), slices within; renders only when history carries
              challenges. On a windowed page it reads the loaded rows alone —
              a challenge older than the window is summarised in the counts
              above the timeline, not re-narrated here. No observed position
              is deep enough to reach that case. */}
              <FrankencoinChallengeCard
                events={frankEvents}
                positionOpen={chain ? !chain.isClosed : summary ? summary.status === "open" : null}
              />

              {indexPending && frankEvents.length === 0 ? (
                <div className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4 text-sm text-rb-500">
                  Event history pending — the indexed backend for this explorer is still being built. Everything above
                  is read live from the position contract at the latest block.
                </div>
              ) : (
                <ChainTruthTimeline
                  csvExportCeiling={DRAINED_ROW_CEILING}
                  // Matches `FrankencoinEventCard`'s own `persistKey={`frankencoin:${event.id}`}` —
                  // lets pinned mode (the per-event share route) force a landed
                  // card's detail panel open on its first mount.
                  persistKeyPrefix="frankencoin"
                  closed={view.status !== "open"}
                  tl={tl}
                  runs={FRANKENCOIN_AUCTION_RUNS}
                  toolbarLeading={
                    <TimelineActivityHeader
                      events={frankEvents}
                      closed={view.status !== "open"}
                      // When the position actually opened, not when the window
                      // does.
                      firstAt={opening?.firstTimestamp}
                      tenurePending={!lifetimeFiguresKnown(historyWindow)}
                    />
                  }
                  renderCard={(event, meta) =>
                    isFrankencoinEvent(event) ? (
                      <FrankencoinEventCard
                        event={event}
                        eventNumber={meta.eventNumber}
                        isFirst={meta.isFirst}
                        isLast={meta.isLast}
                      />
                    ) : null
                  }
                />
              )}
            </FrankencoinPageFactsProvider>
            <ProvInspectorLayer />
          </>
        )}
      </div>
    </FlowFocusContext.Provider>
  );
}
