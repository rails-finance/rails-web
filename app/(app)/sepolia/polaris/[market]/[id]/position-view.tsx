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
import dynamic from "next/dynamic";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { fetchPolarisPositionSummary } from "@/lib/api/fetch-polaris-positions";
import { polarisSummaryFromEvents } from "@/lib/polaris/summary-from-events";
import { fetchPolarisTimeline } from "@/lib/api/fetch-polaris-timeline";
import { fetchPolarisChainPosition, type PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { PolarisEventCard } from "@/components/protocol/polaris/polaris-event-card";
import { PolarisCdpBarsProvider } from "@/lib/polaris/use-cdp-bars";
import {
  PolarisPositionCard,
  viewFromChain,
  mergeChainAndSummary,
  viewFromSummary,
  type PolarisPositionView as PolarisView,
} from "@/components/protocol/polaris/polaris-position-card";
import { PolarisPositionExplanation } from "@/components/protocol/polaris/polaris-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computePolarisEconomics, polarisLifetime } from "@/lib/polaris/economics";
import { polarisSinceLastTouch } from "@/lib/polaris/since-last-touch";
import { PolarisSinceLastTouchRow } from "@/components/protocol/polaris/polaris-since-last-touch";
import {
  polarisEconomicsExplanation,
  polarisEconomicsContent,
  polarisPsmOutcome,
} from "@/lib/polaris/economics-explanation";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader, POLARIS_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { RiskFooterStrip, RiskFigure, RiskStrong } from "@/components/shared/risk-footer-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { Prov } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";
import {
  polarisPriceGapNotesFor,
  rateStepNotesFor,
  livePolarisPriceGapNote,
  liveRateStepNote,
  type MarketNote,
} from "@/lib/shared/market-note";
import { livePendingProv, polarisAnnualCostProv } from "@/lib/polaris/live-provenance";
import { usePolarisUiState } from "@/hooks/usePolarisUiState";

// Signed figure for the pending-PSM-share strip — U+2212 minus, never a plain
// hyphen (the receipt's own convention, e.g. netChangeProv's formulas).
const signedPending = (n: number): string => `${n < 0 ? "−" : "+"}${formatNumber(Math.abs(n))}`;

const PolarisExportMenu = dynamic(
  () => import("@/components/protocol/polaris/polaris-export-menu").then((m) => m.PolarisExportMenu),
  { ssr: false },
);

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
      return summary ? mergeChainAndSummary(v, summary) : v;
    }
    // `!chainSettled` is the index lane's `pending` flag — the same one the
    // listing passes while its market-board read is in flight. Without it the
    // three slots only the overlay can fill (the ratio, the collateral's USD
    // footnote, the rate line) rendered a DASH for the second the read takes
    // and then flipped to a figure, which states "there is none" and then
    // corrects itself. With it they hold a pulse, and settle to the dash if
    // the overlay never answers.
    return summary ? viewFromSummary(summary, undefined, !chainSettled) : null;
  }, [chain, summary, chainSettled]);

  const polarisEvents = useMemo(() => events.filter(isPolarisEvent), [events]);

  // The CDP's summed ledger over its whole life — the closed/liquidated
  // explanation's lifetime bullet and the tower's lifetime layer both read
  // it, computed once here from the same event list.
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
  });

  // Market notes: the stretches between two of this CDP's own touches where
  // the market's primary rate moved at least a percentage point
  // (lib/shared/market-note.ts). Both ends are this CDP's own rows — the
  // rate is already on them — so this needs nothing the timeline doesn't
  // already hold.
  const rateStepNotes = useMemo(
    () =>
      rateStepNotesFor(tl.sortedEvents, {
        key: market,
        stableSymbol: stable,
        cdpManager: POLARIS_MARKET_CONFIG[market].cdpManager,
      }),
    [tl.sortedEvents, market, stable],
  );

  // Price-gap notes — the Liquity V2 rule applied to the market's own price
  // feed, read against the overlay's own normal-mode minimum. The overlay is
  // the only source of `mcr`, so while it has not answered yet there are no
  // price notes at all — never a page that renders them against a guessed
  // minimum.
  const priceGapNotes = useMemo(
    () =>
      chain && !chain.chainStale
        ? polarisPriceGapNotesFor(tl.sortedEvents, {
            market,
            mcr: chain.mcr,
            stable,
            priceFeed: POLARIS_MARKET_CONFIG[market].priceFeed,
          })
        : [],
    [tl.sortedEvents, market, stable, chain],
  );

  const notes: MarketNote[] = useMemo(() => [...rateStepNotes, ...priceGapNotes], [rateStepNotes, priceGapNotes]);

  // Live notes: this CDP's own two live quantities — the market's price and
  // its primary rate — read at the chain head, against this CDP's own newest
  // touch that carries each. Open positions only, and only once the chain
  // overlay has answered (it is the sole source of `mcr`/the live figures —
  // an index-only `view` while the overlay is still settling is not enough).
  const positionOpen = view?.status === "open";
  const liveNotes: MarketNote[] = useMemo(() => {
    if (!chain || chain.chainStale || !chain.isOpen || !chain.price) return [];
    const out: MarketNote[] = [];
    const priceNote = livePolarisPriceGapNote(
      tl.sortedEvents,
      { market, mcr: chain.mcr, stable, priceFeed: POLARIS_MARKET_CONFIG[market].priceFeed },
      { price: chain.price.pethInDebt, block: chain.blockNumber, timestamp: chain.blockTimestamp || undefined },
    );
    if (priceNote) out.push(priceNote);
    const rateNote = liveRateStepNote(
      tl.sortedEvents,
      { key: market, stableSymbol: stable, cdpManager: POLARIS_MARKET_CONFIG[market].cdpManager },
      { rate: chain.primaryRate, block: chain.blockNumber, timestamp: chain.blockTimestamp || undefined },
    );
    if (rateNote) out.push(rateNote);
    return out;
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
  const stripAssets: PriceStripAsset[] = useMemo(() => {
    if (!chain || chain.chainStale || !chain.price) return [];
    const cfg = POLARIS_MARKET_CONFIG[market];
    const out: PriceStripAsset[] = [
      {
        symbol: PETH.symbol,
        address: PETH.address,
        price: chain.price.curve,
        unit: "ETH",
        label: `${PETH.symbol} — bonding curve, native`,
      },
      { symbol: PETH.symbol, address: PETH.address, price: chain.price.pethUsd },
    ];
    const stableUsd = market === "usdp" ? 1 : chain.price.xauUsd;
    if (stableUsd != null) out.push({ symbol: stable, address: cfg.stable.address, price: stableUsd });
    return out;
  }, [chain, market, stable]);

  const loading = !chainSettled && view == null;

  // ── The card's risk footer strip ────────────────────────────────────────
  // ONE strip, whose items are, in reading order: what a year of interest
  // costs, then the CDP's live warning — below the minimum ratio if it is, the
  // pending legs otherwise. It used to be two mutually exclusive strips, each
  // holding one item, so the strip appeared only when one of those two cases
  // held; now the cost line brings it out on every open CDP that owes
  // anything, and the strip's own layout (RiskFooterStrip) pairs the two items
  // per its container's width.
  //
  // THE COST IS COMPUTED ON THE RECORDED DEBT, not the entire debt. That is
  // the base the contract accrues on (liveRateProv's own summary states the
  // rule), and the two differ by whatever the PSM has pending — a quarter of
  // the figure on the deepest CDP here. The pending share joins the recorded
  // debt at the next touch and the cost rises then; the receipt says all of
  // that, so nobody "corrects" the base.
  const annualCost = chain && chain.isOpen && chain.recordedDebt > 0 ? chain.recordedDebt * chain.interestRate : null;
  const belowMinimum =
    chain != null &&
    chain.isOpen &&
    chain.icr != null &&
    chain.icr < (chain.defensiveMode ? chain.defensiveMcr : chain.mcr);
  const hasPendingLegs =
    chain != null &&
    chain.isOpen &&
    (chain.accruedInterest > 0 || chain.mintRedeemCollChange !== 0 || chain.mintRedeemDebtChange !== 0);

  const riskStrip =
    annualCost != null || belowMinimum || hasPendingLegs ? (
      <RiskFooterStrip>
        {annualCost != null && (
          <RiskFigure label="Costs">
            <Prov info={polarisAnnualCostProv(market)} value={String(annualCost)} symbol={stable}>
              <RiskStrong>~{formatNumber(annualCost)}</RiskStrong>
            </Prov>{" "}
            {stable} / year
          </RiskFigure>
        )}
        {belowMinimum && chain?.icr != null ? (
          <RiskFigure caution>
            Below the minimum ratio — {(chain.icr * 100).toFixed(1)}% against{" "}
            {((chain.defensiveMode ? chain.defensiveMcr : chain.mcr) * 100).toFixed(0)}%; anyone may liquidate it
          </RiskFigure>
        ) : hasPendingLegs && chain ? (
          <RiskFigure>
            {chain.accruedInterest > 0 && (
              <>
                <Prov info={livePendingProv("accruedInterest", market)} value={String(chain.accruedInterest)}>
                  <span>{formatNumber(chain.accruedInterest)}</span>
                </Prov>{" "}
                {stable} interest
              </>
            )}
            {chain.accruedInterest > 0 &&
              (chain.mintRedeemCollChange !== 0 || chain.mintRedeemDebtChange !== 0) &&
              " and "}
            {(chain.mintRedeemCollChange !== 0 || chain.mintRedeemDebtChange !== 0) && (
              <>
                a PSM share of{" "}
                <Prov info={livePendingProv("mintRedeemColl", market)} value={String(chain.mintRedeemCollChange)}>
                  <span>{signedPending(chain.mintRedeemCollChange)}</span>
                </Prov>{" "}
                pETH /{" "}
                <Prov info={livePendingProv("mintRedeemDebt", market)} value={String(chain.mintRedeemDebtChange)}>
                  <span>{signedPending(chain.mintRedeemDebtChange)}</span>
                </Prov>{" "}
                {stable}
              </>
            )}{" "}
            pending since the last touch
          </RiskFigure>
        ) : null}
      </RiskFooterStrip>
    ) : undefined;

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="polaris" wallet={view?.owner ?? null} assets={stripAssets}>
        {view && (
          <PolarisExportMenu
            view={view}
            chain={chain}
            events={polarisEvents}
            notes={notes}
            liveNotes={liveNotes}
            csvFilename={`polaris-${market}-${cdpId}-activity.csv`}
          />
        )}
      </DetailTopRow>

      <p className="text-xs text-rb-500">
        Sepolia testnet · {stable} market · CDP #{cdpId} — every figure on this page is a test figure.
      </p>

      {loading ? (
        <DetailBodySkeleton />
      ) : view == null ? (
        <div className="text-sm text-rb-500">
          Nothing readable for this CDP — the market has no CDP with this number, or the chain read is unavailable.
        </div>
      ) : (
        <>
          <PolarisPositionCard
            v={view}
            receipts
            viewHref={tl.viewHref}
            rowExtra={riskStrip}
            explanationDefaultOpen={explanationOpen}
            onExplanationToggle={setExplanationOpen}
            explanation={
              chain ? (
                <PolarisPositionExplanation
                  chain={chain}
                  stableSymbol={stable}
                  terminal={summary && summary.status !== "open" ? summary.status : null}
                  lifetime={lifetime}
                  eventCount={summary?.eventCount}
                  transferCount={summary?.transferCount}
                />
              ) : undefined
            }
          />

          {(() => {
            const towerData = computePolarisEconomics(view, polarisEvents.length > 0 ? polarisEvents : undefined);
            const pethInDebt = chain?.price?.pethInDebt;
            return (
              <ChainTruthTower
                data={towerData}
                explanation={polarisEconomicsExplanation(towerData, lifetime, pethInDebt)}
                learnMore={polarisEconomicsContent()}
                rowExtra={lifetime ? polarisPsmOutcome(lifetime, stable, pethInDebt) : undefined}
              />
            );
          })()}

          {indexPending && polarisEvents.length === 0 ? (
            <div className="rounded-2xl border border-rb-300/40 dark:border-rb-700/40 bg-raised px-5 py-4 text-sm text-rb-500">
              Event history pending — the indexed backend for this explorer has not answered for this CDP. Everything
              above is read from the market&rsquo;s contracts at the latest Sepolia block.
            </div>
          ) : (
            // The bars provider reads the CDP's rows once (lifetime maxima,
            // per-row shifts); each card's slot looks its own row up. No
            // `runs`: measured 2026-09-10, no CDP on the index holds a run of
            // no-change touches (rails-ops TO-DO-polaris-v2-parity §1.4), so
            // the menu offers the six display items and no collapse.
            <PolarisCdpBarsProvider events={tl.sortedEvents}>
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
                    ? ({ isFirst }) => (
                        <PolarisSinceLastTouchRow
                          window={sinceTouch}
                          market={market}
                          stable={stable}
                          isFirst={isFirst}
                        />
                      )
                    : undefined
                }
                displayItems={POLARIS_DISPLAY_ITEMS}
                toolbarLeading={<TimelineActivityHeader events={polarisEvents} closed={view.status !== "open"} />}
                renderCard={(event, meta) =>
                  isPolarisEvent(event) ? (
                    <PolarisEventCard
                      event={event}
                      eventNumber={meta.eventNumber}
                      isFirst={meta.isFirst}
                      isLast={meta.isLast}
                    />
                  ) : null
                }
              />
            </PolarisCdpBarsProvider>
          )}
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
