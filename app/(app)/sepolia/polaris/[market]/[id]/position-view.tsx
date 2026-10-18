"use client";

// Polaris CDP detail — chain-state-first, the 3-section anatomy (card →
// economics → timeline). The route is TWO segments because a CDP id is only
// unique within its market.
//
// THE CHAIN OVERLAY IS THE PRIMARY TRUTH here (the 0006 carve-out): the card,
// the ratio, the rate, the pending legs and the collateral's USD all read the
// cdpManager's own getters and the protocol's own price feed at the latest
// Sepolia block via /api/chain/polaris/position. The indexed backend
// contributes the history, the peaks, the counts and — for a burned NFT —
// which terminal state it reached; while the index has no answer for this CDP
// its surfaces state PENDING plainly rather than fabricate.
//
// Units are native everywhere; the one dollar figure is the protocol's own
// feed, and the header line says "Sepolia testnet" once.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { previousEventById } from "@/lib/shared/event-order";
import { fetchPolarisPositionSummary } from "@/lib/api/fetch-polaris-positions";
import { polarisSummaryFromEvents } from "@/lib/polaris/summary-from-events";
import { fetchPolarisTimeline } from "@/lib/api/fetch-polaris-timeline";
import { fetchPolarisChainPosition, type PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { PolarisEventCard } from "@/components/protocol/polaris/polaris-event-card";
import {
  PolarisPositionCard,
  polarisOwnerWrap,
  viewFromChain,
  mergeChainAndSummary,
  viewFromSummary,
  type PolarisPositionView as PolarisView,
} from "@/components/protocol/polaris/polaris-position-card";
import { PolarisPositionExplanation } from "@/components/protocol/polaris/polaris-position-explanation";
import { polarisLifetime } from "@/lib/polaris/economics";
import { polarisSinceLastTouch } from "@/lib/polaris/since-last-touch";
import { PolarisSinceLastTouchRow } from "@/components/protocol/polaris/polaris-since-last-touch";
import { polarisPsmOutcome } from "@/lib/polaris/economics-explanation";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { PolarisFlowsNote, polarisFlowsContent } from "@/components/protocol/polaris/polaris-flows-note";
import { usePolarisFlows } from "@/hooks/usePolarisFlows";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { ExportMenu } from "@/components/shared/export-menu";
import { polarisExports } from "@/components/protocol/polaris/polaris-export-menu";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { rateStepNotesFor, liveRateStepNote, type MarketNote } from "@/lib/shared/market-note";
import { curvePriceAtBlockProv, liveCurvePriceProv, liveMedianiserProv } from "@/lib/polaris/live-provenance";
import { usePolarisUiState } from "@/hooks/usePolarisUiState";
import { polarisExplorer } from "@/lib/polaris/explorer";

/** What the ETH/USD row is, and why it is in the menu. */
const ETH_USD_LABEL = "ETH/USD — the protocol's medianiser";

/** The card's "Highest recorded" peaks, with the liquidation's own state
 *  counted: the index takes its peaks over each touch's resulting figures, and
 *  a liquidation's resulting figures are zero — the collateral and debt it
 *  seized and cleared, after the pending legs settled, are the CDP's last and
 *  often its largest state. */
function withLiquidationPeaks(v: PolarisView, events: BaseActivityEvent[]): PolarisView {
  let coll = v.peakColl;
  let debt = v.peakDebt;
  let surplus = 0;
  let found = false;
  for (const e of events) {
    if (!isPolarisEvent(e) || e.context.data.eventType !== "liquidate") continue;
    found = true;
    coll = Math.max(coll, Number(e.context.data.collLiquidated ?? 0) || 0);
    debt = Math.max(debt, Number(e.context.data.debtLiquidated ?? 0) || 0);
    surplus += Number(e.context.data.collSurplus ?? 0) || 0;
  }
  return found ? { ...v, peakColl: coll, peakDebt: debt, peaksCountLiquidation: true, surplus } : v;
}

interface PolarisPositionViewProps {
  market: PolarisMarket;
  cdpId: string;
  initialSummary: PolarisPositionSummary | null;
  /** The index lane's history. `null` means the server could not read it, and
   *  the effect below reads it exactly as this page always did — the index
   *  surfaces stay PENDING until it lands. An EMPTY array is a real answer. */
  initialEvents: BaseActivityEvent[] | null;
}

export default function PolarisPositionView({
  market,
  cdpId,
  initialSummary,
  initialEvents,
}: PolarisPositionViewProps) {
  const indexSeeded = initialEvents != null;
  const [chain, setChain] = useState<PolarisChainResponse | null>(null);
  const [chainSettled, setChainSettled] = useState(false);
  const [summary, setSummary] = useState<PolarisPositionSummary | null>(initialSummary);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  const [indexPending, setIndexPending] = useState(!indexSeeded);
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  // The event route draws the sub-nav and the timeline alone: the card in page
  // mode beside the shared side column (ui-jobs 236, 307).
  const onEventPage = useParams<{ eventId?: string }>()?.eventId != null;

  // Whether the reader left the card's Explanation pane open on THIS CDP.
  // Per CDP, not per explorer: a reader studying one position wants its
  // narration back, and does not want it forced open on every CDP they then
  // glance at. The page is keyed on `${market}:${id}` (page.tsx), so a client
  // navigation remounts this and the hook re-reads for the new CDP.
  const { explanationOpen, setExplanationOpen } = usePolarisUiState(`${market}-${cdpId}`);

  // The chain lane — the CDP's own getters at head, the page's primary truth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPolarisChainPosition({ market, cdpId });
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
  }, [market, cdpId]);

  // The index lane — history + what head state cannot say. A failure leaves
  // these surfaces in their explicit PENDING state, never fabricated.
  useEffect(() => {
    if (indexSeeded) return;
    let cancelled = false;
    (async () => {
      try {
        const [row, tData] = await Promise.all([
          fetchPolarisPositionSummary(market, cdpId).catch(() => null),
          fetchPolarisTimeline(market, cdpId),
        ]);
        if (!cancelled) {
          const evs = tData.events ?? [];
          // The listing row when it names this CDP; the timeline's own
          // reduction otherwise (lib/polaris/summary-from-events.ts).
          setSummary(row ?? polarisSummaryFromEvents(market, cdpId, evs));
          setEvents(evs);
          setIndexPending(false);
        }
      } catch (err) {
        console.error("polaris detail index fetch failed:", err);
        if (!cancelled) setIndexPending(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market, cdpId, indexSeeded]);

  // Chain-first view, index-merged when it lands; index-only while RPC is down.
  const view = useMemo<PolarisView | null>(() => {
    if (chain) {
      const v = viewFromChain(chain);
      return summary ? withLiquidationPeaks(mergeChainAndSummary(v, summary), events) : v;
    }
    // `!chainSettled` is the index lane's `pending` flag — the same one the
    // listing passes while its market-board read is in flight. Without it the
    // three slots only the overlay can fill (the ratio, the collateral's USD
    // footnote, the rate line) rendered a DASH for the second the read takes
    // and then flipped to a figure, which states "there is none" and then
    // corrects itself. With it they hold a pulse, and settle to the dash if
    // the overlay never answers.
    return summary ? withLiquidationPeaks(viewFromSummary(summary, undefined, !chainSettled), events) : null;
  }, [chain, summary, chainSettled, events]);

  const polarisEvents = useMemo(() => events.filter(isPolarisEvent), [events]);
  // Each card's previous event, a transfer passed over: it moves no figure.
  const previousById = useMemo(
    () => previousEventById(polarisEvents, (e) => e.context.data.eventType !== "transfer"),
    [polarisEvents],
  );

  // The CDP's summed ledger over its whole life — the closed/liquidated
  // explanation's lifetime bullet and the PSM outcome strip both read it,
  // computed once here from the same event list.
  const lifetime = useMemo(() => (polarisEvents.length > 0 ? polarisLifetime(polarisEvents) : null), [polarisEvents]);

  // The live window between the CDP's last touch and the head block, split
  // into the feed's effect and the protocol's — null wherever that split is
  // not a fact (see lib/polaris/since-last-touch.ts), and then nothing draws.
  const sinceTouch = useMemo(
    () => (chain && polarisEvents.length > 0 ? polarisSinceLastTouch(chain, polarisEvents) : null),
    [chain, polarisEvents],
  );

  const tl = useTimelineEvents(polarisEvents, {
    storageKey: `polaris-${market}-${cdpId}`,
    protocolKey: "polaris",
    // Navigated by the Lifetime flows cursor through "Sync to chart": no Dates.
    dates: false,
  });

  // Market notes: the stretches between two of this CDP's own touches where
  // the market's primary rate moved at least a percentage point
  // (lib/shared/market-note.ts). Both ends are this CDP's own rows — the
  // rate is already on them — so this needs nothing the timeline doesn't
  // already hold.
  const notes: MarketNote[] = useMemo(
    () =>
      rateStepNotesFor(tl.sortedEvents, {
        key: market,
        stableSymbol: stable,
        cdpManager: POLARIS_MARKET_CONFIG[market].cdpManager,
      }),
    [tl.sortedEvents, market, stable],
  );

  // The live note: the market's primary rate read at the chain head, against
  // this CDP's newest touch that carries one. Open positions only, and
  // only once the chain overlay has answered (an index-only `view` while the
  // overlay is still settling is not enough).
  const positionOpen = view?.status === "open";
  const liveNotes: MarketNote[] = useMemo(() => {
    if (!chain || chain.chainStale || !chain.isOpen || !chain.price) return [];
    const rateNote = liveRateStepNote(
      tl.sortedEvents,
      { key: market, stableSymbol: stable, cdpManager: POLARIS_MARKET_CONFIG[market].cdpManager },
      { rate: chain.primaryRate, block: chain.blockNumber, timestamp: chain.blockTimestamp || undefined },
    );
    return rateNote ? [rateNote] : [];
  }, [chain, tl.sortedEvents, market, stable]);

  // The top row's price dropdown — what the protocol's own feed says about
  // the two assets THIS page is denominated in, at the block the overlay was
  // read at: pETH in ETH (bondingCurve.currentPrice(), the native rate — the
  // curve mints and burns pETH against ETH directly, no USD leg involved),
  // pETH in USD (that same curve rate × the ETH/USD medianiser — the second
  // factor of the identity previewPrice() itself computes), and the market's
  // stable at its own face — USDp targets the dollar, GOLDp a troy ounce of
  // gold, so its face IS the XAU/USD medianiser's own price. Two pills share
  // the pETH symbol, so the ETH one carries its own `unit`/`label` to stay a
  // distinct key and a distinct tooltip. Empty while the overlay is in
  // flight, and empty if it never answers: the strip states a price or
  // nothing.
  const stripAssets: LatestPriceAsset[] = useMemo(() => {
    if (!chain || chain.chainStale || !chain.price) return [];
    const cfg = POLARIS_MARKET_CONFIG[market];
    const out: LatestPriceAsset[] = [
      {
        symbol: PETH.symbol,
        address: PETH.address,
        price: chain.price.curve,
        unit: "ETH",
        label: `${PETH.symbol} — bonding curve, native`,
        // "2.84 ETH" alone read as a gas price: the trigger names the token.
        triggerLabel: PETH.symbol,
        info: liveCurvePriceProv(),
      },
      { symbol: PETH.symbol, address: PETH.address, price: chain.price.pethUsd },
    ];
    if (chain.price.ethUsd > 0)
      out.push({
        symbol: "ETH",
        price: chain.price.ethUsd,
        label: ETH_USD_LABEL,
        info: liveMedianiserProv("eth"),
      });
    const stableUsd = market === "usdp" ? 1 : chain.price.xauUsd;
    if (stableUsd != null) out.push({ symbol: stable, address: cfg.stable.address, price: stableUsd });
    return out;
  }, [chain, market, stable]);

  // A closed CDP's prices: the same legs, read at the closing row's block by
  // the oracle-at-block lane. A row the lane has not priced leaves the
  // dropdown out.
  const closing = useMemo(() => {
    if (!view || view.status === "open") return undefined;
    const cfg = POLARIS_MARKET_CONFIG[market];
    return closingPricesAt(polarisEvents, (row) => {
      const p = row.context.data.priceAtBlock;
      if (!p || p.curve == null || !(p.curve > 0)) return undefined;
      const out: LatestPriceAsset[] = [
        {
          symbol: PETH.symbol,
          address: PETH.address,
          price: p.curve,
          unit: "ETH",
          label: `${PETH.symbol} — bonding curve, native`,
          triggerLabel: PETH.symbol,
          info: curvePriceAtBlockProv(row.blockNumber),
        },
      ];
      if (p.ethUsd != null && p.ethUsd > 0) {
        out.push({ symbol: PETH.symbol, address: PETH.address, price: p.curve * p.ethUsd });
        out.push({ symbol: "ETH", price: p.ethUsd, label: ETH_USD_LABEL });
      }
      const stableUsd = market === "usdp" ? 1 : p.xauUsd;
      if (stableUsd != null) out.push({ symbol: stable, address: cfg.stable.address, price: stableUsd });
      return out;
    });
  }, [view, market, stable, polarisEvents]);

  const loading = !chainSettled && view == null;

  // The Lifetime flows panel replays the CDP's whole history
  // (lib/polaris/flows.ts), the index's one read; today's figures are the live
  // read's entire collateral and debt, with the legs pending since the last
  // touch.
  const flows = usePolarisFlows({
    events: indexPending ? null : polarisEvents,
    chain,
    chainSettled,
    stable,
    open: view?.status === "open",
  });
  const flowFocus = flows.read !== "failed" ? flows.focus : null;

  const exports = view
    ? polarisExports({
        view,
        chain,
        events: polarisEvents,
        notes,
        liveNotes,
        csvFilename: `polaris-${market}-${cdpId}-activity.csv`,
      })
    : null;

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="polaris"
          wallet={view?.owner ?? null}
          owner={{ wallet: view?.owner ?? null, wrap: view ? polarisOwnerWrap(view) : undefined }}
          assets={stripAssets}
          closed={view != null && view.status !== "open"}
          closing={closing}
          // The exports ride the card's ⋮; the event route, which draws no card,
          // keeps them in the wallet row's Tools.
          tools={onEventPage}
        >
          {onEventPage && exports && <ExportMenu {...exports} />}
        </DetailTopRow>

        {loading ? (
          <DetailBodySkeleton />
        ) : view == null ? (
          <div className="text-sm text-rb-500">
            Nothing readable for this CDP — the market has no CDP with this number, or the chain read is unavailable.
          </div>
        ) : (
          <>
            {!onEventPage && (
              <>
                <PolarisPositionCard
                  v={view}
                  lifetime={lifetime}
                  viewHref={tl.viewHref}
                  exports={exports ?? undefined}
                  explanationDefaultOpen={explanationOpen}
                  onExplanationToggle={setExplanationOpen}
                  explanation={
                    chain ? (
                      <PolarisPositionExplanation
                        chain={chain}
                        stableSymbol={stable}
                        terminal={summary && summary.status !== "open" ? summary.status : null}
                        lifetime={lifetime}
                        transferCount={summary?.transferCount}
                      />
                    ) : undefined
                  }
                />

                {/* Lifetime flows: the bars and the line over the CDP's replay
              (lib/polaris/flows.ts), in the market's stablecoin, in place of
              the tower (TO-DO-ui-jobs 206). */}
                <LifetimeFlowsPanel
                  scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                  read={flows.read}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <PolarisFlowsNote facts={flows.facts} stable={stable} />
                    </div>
                  }
                  learnMore={polarisFlowsContent(stable)}
                  outcome={lifetime ? polarisPsmOutcome(lifetime, stable, chain?.price?.pethInDebt) : undefined}
                />
              </>
            )}

            {indexPending && polarisEvents.length === 0 ? (
              <div className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4 text-sm text-rb-500">
                Event history pending — the indexed backend for this explorer has not answered for this CDP. Everything
                above is read from the market&rsquo;s contracts at the latest Sepolia block.
              </div>
            ) : (
              // No `runs`: measured 2026-09-10, no CDP on the index holds a run of
              // no-change touches (rails-ops TO-DO-polaris-v2-parity §1.4), so
              // the menu offers no collapse.
              <ChainTruthTimeline
                persistKeyPrefix="polaris"
                closed={view.status !== "open"}
                tl={tl}
                notes={notes}
                liveNotes={liveNotes}
                liveNotesPending={positionOpen && !chainSettled}
                // The window between this CDP's last touch and now, as the
                // timeline's head row — where every other window between two
                // touches is already told. Undefined wherever the split is not
                // a fact (a closed CDP, an overlay that has not answered), and
                // the slot draws nothing.
                liveWindow={
                  sinceTouch
                    ? () => <PolarisSinceLastTouchRow window={sinceTouch} market={market} stable={stable} />
                    : undefined
                }
                eventPage={(slot) =>
                  polarisExplorer.eventPage({
                    ...slot,
                    market,
                    cdpId,
                    holder: summary?.owner ?? view.owner,
                    closed: view.status !== "open",
                  })
                }
                displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
                toolbarLeading={<TimelineActivityHeader events={polarisEvents} closed={view.status !== "open"} />}
                renderCard={(event, meta) =>
                  isPolarisEvent(event) ? (
                    <PolarisEventCard
                      event={event}
                      eventNumber={meta.eventNumber}
                      isLast={meta.isLast}
                      previousEvent={previousById.get(event.id)}
                    />
                  ) : null
                }
              />
            )}
            <ProvInspectorLayer />
          </>
        )}
      </div>
    </FlowFocusContext.Provider>
  );
}
