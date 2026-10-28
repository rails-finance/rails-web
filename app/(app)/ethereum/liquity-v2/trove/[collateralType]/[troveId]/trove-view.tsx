"use client";

// The trove page's client half. Every interactive part of the view lives here —
// the timeline filters, the stored UI state, the export menu, the head reads —
// while the page above it is a server component that has already fetched the
// tail. Being a client component does not mean rendering on the client: React
// renders this whole subtree to HTML on the server too. What used to make the
// page blank to a non-JS reader was not the "use client" line, it was fetching
// the data in an effect. The data arrives as props now, so the first byte of the
// document already carries the position.
//
// Seeded or not, the mount path still works: when the server read came back
// empty (a backend blip) `initialTrove` is null and this component fetches the
// tail itself, exactly as it did before the route had a server half.

import { useState, useEffect, useMemo, useRef } from "react";
import {
  collateralPriceInfo as collateralPriceReceipt,
  closingPriceInfo,
  LastOwnerPrefix,
} from "@/lib/liquity/trove-page-words";
import { troveWords } from "@/lib/liquity/event-templates";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { TroveSummary, TrovesResponse } from "@/types/api/trove";
import { TroveBody, useTroveFlows } from "@/components/trove/TroveBody";
import type { FlowsRead } from "@/components/shared/lifetime-flows-panel";
import { liquityV2FlowEvents } from "@/lib/shared/liquity-flows";
import { liquityDailyBranch, useLiquityDailyPrices } from "@/hooks/useLiquityDailyPrices";
import { TroveStateData, TroveStateResponse } from "@/types/api/troveState";
import { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import { useDebtInFront } from "@/hooks/useDebtInFront";
import { useLiquityCollSurplus } from "@/hooks/useLiquityCollSurplus";
import { useWalletContext } from "@/components/nav/wallet-context";

import { fetchTroveTimeline } from "@/lib/api/fetch-timeline";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import { collSurplusClaimEvent } from "@/lib/shared/liquity-coll-surplus-claim";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";
import { boundaryStateFromOldestRow } from "@/lib/shared/timeline-boundary-state";
import { troveExports } from "@/components/trove/TroveExportMenu";
import { closingPricesAt, DetailBackButton, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import type { Provenance } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { compareEventsInOrder } from "@/lib/shared/event-order";
import { useRedemptionPace } from "@/hooks/useRedemptionPace";
import { paceBranch } from "@/lib/liquity-v2/redemption-pace";

export interface TroveViewProps {
  collateralType: string;
  troveId: string;
  /** The server read's tail. Null on an SSR miss — this component then fetches. */
  initialTrove: TroveSummary | null;
  initialEvents: BaseActivityEvent[] | null;
  /** The trove's whole event count when the served page stopped short of it
   *  (`pagination.hasMore`); null when the rows are the whole history. */
  initialTotalEvents: number | null;
  initialPrices: OraclePricesData | null;
  /** The server's clock (unix seconds) at render: the Explanation's debt owed
   *  today accrues to it until the flows clock below is set, so the server's
   *  render and the first client render state the same figure. */
  renderedAt: number;
}

export default function TroveView({
  collateralType,
  troveId,
  initialTrove,
  initialEvents,
  initialTotalEvents,
  initialPrices,
  renderedAt,
}: TroveViewProps) {
  const troveKey = `${collateralType}:${troveId}`;
  // The page keys this component on the trove, so a client-side navigation to a
  // different trove remounts it with the new server-read tail as initial state.
  const seeded = initialTrove != null;

  const [troveData, setTroveData] = useState<TroveSummary | null>(initialTrove);
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The whole count when the fetch's `limit` cut the list — the boundary card
  // and the numbering offset (rails-ops decision 0019). Null = whole history.
  const [totalEvents, setTotalEvents] = useState<number | null>(initialTotalEvents);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  // Live blockchain data and prices
  const [liveState, setLiveState] = useState<TroveStateData | undefined>(undefined);
  const [prices, setPrices] = useState<OraclePricesData | undefined>(initialPrices ?? undefined);

  // Closed / liquidated troves have ownership transferred to the zero address,
  // so `owner` reads as the burn address. Real wallet lives in `lastOwner`.
  // Plain `owner ?? lastOwner` doesn't help because `0x0000...` is truthy —
  // we need to actively reject the burn address before falling through.
  const effectiveOwner = (() => {
    const o = troveData?.owner?.toLowerCase();
    if (o && o !== "0x0000000000000000000000000000000000000000") return troveData?.owner;
    return troveData?.lastOwner;
  })();

  // Surface the trove owner in the header wallet pill — the WalletContext
  // hydrator only reads /address/* paths, so trove pages need to push the
  // owner explicitly, producing the "Liquity V2 + <owner>" header.
  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!effectiveOwner) return;
    const lower = effectiveOwner.toLowerCase();
    const ens = troveData?.ownerEns ?? null;
    setWallets([lower], { [lower]: ens });
  }, [effectiveOwner, troveData?.ownerEns, setWallets]);

  // Debt in front calculation
  const debtInFrontRate = liveState?.rates.annualInterestRate ?? troveData?.metrics.interestRate;
  const {
    debtInFront,
    trovesAhead,
    queueDebtTotal,
    loading: debtInFrontLoading,
  } = useDebtInFront(
    troveData?.status === "open" ? collateralType : undefined,
    troveData?.status === "open" ? debtInFrontRate : undefined,
    troveData?.status === "open" ? troveId : undefined,
  );
  // The chain trove-state read is the page's one remaining second wave. The
  // oracle price rides in with the server tail, so the economics tower, price
  // runway, and price-derived headline stats all paint complete in the first
  // document instead of popping in a frame later.
  const [enhancementLoading, setEnhancementLoading] = useState({
    blockchain: false,
  });

  // Mount. A seeded view goes to the chain enhancements; an unseeded
  // one fetches the tail first. The ref keeps React's
  // development double-invoke from issuing the reads twice.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (seeded) void loadEnhancements();
    else void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Reset second-wave chain state when switching source so a stale
      // rails-server reading never lingers under chain-sourced summary data.
      setLiveState(undefined);

      // The rails-server index is the sole serving path. Oracle price is shared
      // (already chain-rooted) and best-effort.
      const trovesQs = `troveId=${troveId}&collateralType=${collateralType}`;
      const trovesUrl = `/api/troves?${trovesQs}`;

      const [troveResponse, timelineResult, pricesResult] = await Promise.all([
        fetch(trovesUrl),
        fetchTroveTimeline({ collateralType, troveId, limit: TIMELINE_WINDOW_ROWS }).catch((err) => {
          console.error("Failed to fetch trove timeline:", err);
          return null;
        }),
        fetch(`/api/oracle/liquity-v2`)
          .then((r) => (r.ok ? (r.json() as Promise<OraclePricesResponse>) : null))
          .catch((err) => {
            console.error("Failed to fetch oracle prices:", err);
            return null;
          }),
      ]);

      if (!troveResponse.ok) {
        throw new Error(troveWords("trove_fetch_failed", { status: troveResponse.statusText }));
      }

      const troveDataResp: TrovesResponse = await troveResponse.json();

      if (!troveDataResp.data || troveDataResp.data.length === 0) {
        setError(troveWords("trove_not_found"));
        setLoading(false);
        return;
      }

      setTroveData(troveDataResp.data[0]);
      setEvents(timelineResult?.events ?? []);
      setTotalEvents(timelineResult?.pagination?.hasMore ? timelineResult.totalEvents : null);
      if (pricesResult?.success && pricesResult.data) {
        setPrices(pricesResult.data);
      }

      setLoading(false);
      loadEnhancements();
    } catch (err) {
      setError(err instanceof Error ? err.message : troveWords("trove_load_failed"));
      console.error("Error loading trove data:", err);
      setLoading(false);
    }
  };

  const loadEnhancements = async () => {
    // Second-wave live state, one lane — the api/chain source toggle this
    // comment used to describe is retired (rails-ops decision 0006). The
    // summary's replayed numbers lag to the last event, so this overlay
    // refreshes debt/coll/interest to the latest block and fills the USD/CR
    // the replay leaves at 0.
    setEnhancementLoading({ blockchain: true });

    try {
      // Live accrued state is inherently an RPC read. This frontend route is a
      // pure proxy to RAILS_API_URL, but what it proxies is a real chain read:
      // rails-server's /trove/state/ calls fetchTroveState →
      // publicClient.readContract(getLatestTroveData), behind an in-memory
      // cache (30s fresh, 60s stale-while-revalidate) — not a DB table, and
      // not the indexed backend. Liquity V2's chain lane lives server-side
      // rather than under app/api/chain/, which is easy to misread as absent.
      // It stays a client read rather than joining the server tail so that no
      // document waits on an RPC round trip.
      const stateUrl = `/api/trove/state/${collateralType}/${troveId}`;
      const res = await fetch(stateUrl);
      if (res.ok) {
        const stateResponse: TroveStateResponse = await res.json();
        if (stateResponse.success && stateResponse.data) {
          setLiveState(stateResponse.data);
        }
      } else {
        console.error("Failed to fetch blockchain state");
      }
    } catch (err) {
      console.error("Error parsing blockchain state:", err);
    }
    setEnhancementLoading({ blockchain: false });
  };

  const getEnhancementStatus = (): string | null => {
    return enhancementLoading.blockchain ? troveWords("trove_loading_state") : null;
  };

  // Liquity-narrowed, in the order the events happened
  // (lib/shared/event-order.ts: the block's position, then the log inside one
  // transaction).
  const liquityEvents = useMemo(() => events.filter(isLiquityEvent).sort(compareEventsInOrder), [events]);

  // A liquidated trove's surplus: claimable or claimed, read at the head
  // (the index records the credit, never the claim).
  const lastLiquidation = useMemo(
    () => [...liquityEvents].reverse().find((e) => e.context.data.operation === "liquidate"),
    [liquityEvents],
  );
  const surplus = useLiquityCollSurplus({
    protocol: "liquity-v2",
    branch: collateralType,
    owner: troveData?.status === "liquidated" ? effectiveOwner : null,
    liquidationTx: lastLiquidation?.txHash,
  });

  // The claim that paid the surplus out, as its own row (the index has none).
  const claimEvent = useMemo(
    () =>
      collSurplusClaimEvent({
        source: surplus,
        family: "liquity-v2",
        protocolName: troveWords("protocol_name"),
        chainId: MAINNET_CHAIN_ID,
        symbol: troveData?.collateralType ?? collateralType,
        owner: effectiveOwner,
        creditTx: lastLiquidation?.txHash,
        creditKind: "liquidation",
        creditAt: lastLiquidation?.timestamp ?? null,
      }),
    [surplus, troveData?.collateralType, collateralType, effectiveOwner, lastLiquidation],
  );
  const timelineEvents = useMemo(
    () => (claimEvent ? [...liquityEvents, claimEvent] : liquityEvents),
    [liquityEvents, claimEvent],
  );
  const surplusState = useMemo(
    () => (lastLiquidation && surplus ? { creditTx: lastLiquidation.txHash, claimed: surplus.claimed } : null),
    [lastLiquidation, surplus],
  );

  // The Lifetime flows panel replays the Trove's whole history. The page
  // holds it unless the timeline read stopped short (`totalEvents` set); then
  // the panel reads the rest, a page of 1,000 rows at a time, as far as the
  // route serves.
  const [flowHistory, setFlowHistory] = useState<{ events: BaseActivityEvent[] | null; read: FlowsRead }>({
    events: null,
    read: "reading",
  });
  useEffect(() => {
    if (totalEvents == null) return;
    let cancelled = false;
    (async () => {
      const seen = new Map<string, BaseActivityEvent>();
      try {
        for (let offset = 0; offset <= 10_000; offset += 1_000) {
          const page = await fetchTroveTimeline({ collateralType, troveId, limit: 1_000, offset });
          for (const e of page.events ?? []) seen.set(e.id, e);
          if (!page.pagination?.hasMore) {
            if (!cancelled) setFlowHistory({ events: [...seen.values()], read: "done" });
            return;
          }
        }
        if (!cancelled) setFlowHistory({ events: null, read: "failed" });
      } catch (err) {
        console.warn("Lifetime flows history not read:", err);
        if (!cancelled) setFlowHistory({ events: null, read: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [totalEvents, collateralType, troveId]);
  const flowEvents = useMemo(
    () => liquityV2FlowEvents(totalEvents == null ? liquityEvents : (flowHistory.events ?? [])),
    [totalEvents, liquityEvents, flowHistory.events],
  );
  const flowsRead: FlowsRead = totalEvents == null ? "done" : flowHistory.read;
  // Until the clock is set the panel says it is reading.
  // The clock the replay reads (the interest since the last event): set on
  // mount, so the server's render and the first client render agree (the
  // panel reads as loading until then).
  const [flowsNow, setFlowsNow] = useState<number | null>(null);
  useEffect(() => setFlowsNow(Date.now() / 1000), []);
  const flowCollSymbol = troveData?.collateralType ?? collateralType;
  const flowDebtSymbol = liquityEvents[0]?.context.data.assetType || "BOLD";
  const flowPrice = prices?.[flowCollSymbol.toLowerCase() as keyof OraclePricesData];
  const flowOpen = troveData?.status === "open";
  const flowSurplusClaimed = surplus?.claimed != null;
  // The branch's daily price for the collateral between the Trove's events;
  // where the read fails, each event's price carries.
  const flowDaily = useLiquityDailyPrices(liquityDailyBranch(flowCollSymbol));
  const { flowTimeline: flowReplayed, flowFocus } = useTroveFlows({
    flowEvents,
    collSymbol: flowCollSymbol,
    debtSymbol: flowDebtSymbol,
    surplusClaimed: flowSurplusClaimed,
    now: flowsNow,
    daily: flowDaily,
    open: flowOpen,
    price: flowPrice,
    liveState,
  });
  // The branch's redemptions per day over the life, the chart's pace lane
  // (lib/liquity-v2/redemption-pace.ts): to today, or to the close.
  const paceDays = flowReplayed?.days;
  const flowPace = useRedemptionPace(
    paceBranch(flowCollSymbol),
    paceDays?.length ? paceDays[0].day : null,
    paceDays?.length && flowsNow != null
      ? flowOpen
        ? Math.floor(flowsNow / 86_400)
        : paceDays[paceDays.length - 1].day
      : null,
  );
  const flowTimeline = useMemo(
    () => (flowReplayed && flowPace ? { ...flowReplayed, pace: flowPace } : flowReplayed),
    [flowReplayed, flowPace],
  );

  const olderCount = totalEvents != null ? Math.max(0, totalEvents - liquityEvents.length) : 0;
  const tl = useTimelineEvents(timelineEvents, {
    storageKey: `liquity-v2-${troveKey}`,
    protocolKey: "liquity-v2-troves",
    olderCount,
    // Navigated by the Lifetime flows chart's Apply: no Dates.
    dates: false,
  });
  // The boundary card for a `limit`-cut list: the count the route reported,
  // the oldest served row's block and its own before-state.
  const boundary = useMemo(() => {
    const oldest = tl.sortedEvents[0];
    if (olderCount === 0 || totalEvents == null || !oldest) return null;
    return boundaryFromLimit({
      total: totalEvents,
      listed: liquityEvents.length,
      cutBlock: oldest.blockNumber,
      cutAt: oldest.timestamp,
      state: boundaryStateFromOldestRow(oldest),
    });
  }, [olderCount, totalEvents, liquityEvents.length, tl.sortedEvents]);

  // What an event's Copy for LLM header names about the trove.
  const troveMeta = useMemo(
    () => ({ owner: effectiveOwner ?? null, total: totalEvents ?? liquityEvents.length }),
    [effectiveOwner, totalEvents, liquityEvents.length],
  );

  if (loading) {
    // Only an SSR miss reaches this now — a seeded view never renders the
    // skeleton. Real back button (so the nav chrome doesn't pop in) above the
    // shared detail skeleton — position card, economics panel, and timeline
    // spine in their real shapes, so the content lands without a layout jump.
    return (
      <div className="py-8 space-y-6">
        <DetailBackButton session="liquity-v2" />
        <DetailBodySkeleton />
      </div>
    );
  }

  if (error || !troveData) {
    return (
      <>
        <div className="py-8 space-y-6">
          <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400">{error || troveWords("trove_not_found")}</p>
            <button
              onClick={loadData}
              className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white text-sm"
            >
              {troveWords("retry")}
            </button>
          </div>
        </div>
      </>
    );
  }

  // Assets relevant to the position in view, for the top row's price dropdown:
  // the trove's collateral (priced from the Liquity oracle) plus BOLD, the
  // debt asset — hard-pegged to $1 by the protocol's redemption mechanism, so
  // there's no separate price source for it.
  const collateralPrice = prices?.[troveData.collateralType.toLowerCase() as keyof OraclePricesData];
  const collateralPriceInfo: Provenance | undefined = collateralPrice
    ? collateralPriceReceipt(troveData.collateralType)
    : undefined;
  const stripAssets: LatestPriceAsset[] = [
    ...(collateralPrice
      ? [{ symbol: troveData.collateralType, price: collateralPrice, info: collateralPriceInfo }]
      : []),
    { symbol: "BOLD", price: 1 },
  ];
  // A closed trove's prices: the collateral price its closing row carries.
  const closing =
    troveData.status !== "open"
      ? closingPricesAt(liquityEvents, (row) => {
          const price = row.context.data.collateralPrice;
          return price > 0
            ? [
                {
                  symbol: troveData.collateralType,
                  price,
                  info: closingPriceInfo(troveData.collateralType),
                },
                { symbol: "BOLD", price: 1 },
              ]
            : undefined;
        })
      : undefined;

  return (
    <>
      <TroveBody
        topRow={
          <DetailTopRow
            session="liquity-v2"
            wallet={effectiveOwner}
            owner={{
              wallet: effectiveOwner,
              ensName: troveData?.ownerEns ?? null,
              prefix: effectiveOwner && effectiveOwner !== troveData?.owner ? <LastOwnerPrefix /> : undefined,
            }}
            assets={stripAssets}
            closed={troveData.status !== "open"}
            closing={closing}
            tools={false}
          />
        }
        trove={troveData}
        liveState={liveState}
        prices={prices}
        debtInFront={debtInFront}
        trovesAhead={trovesAhead}
        queueDebtTotal={queueDebtTotal}
        debtInFrontLoading={debtInFrontLoading}
        surplus={surplus}
        exports={troveExports({
          trove: troveData,
          liveState,
          prices,
          debtInFront,
          trovesAhead,
          events: tl.sortedEvents,
          csvFilename: `liquity-v2-${collateralType}-trove-${troveId.slice(0, 12)}-activity.csv`,
        })}
        loadingMessage={getEnhancementStatus()}
        liquityEvents={liquityEvents}
        tl={tl}
        boundary={boundary}
        economicsEvents={tl.sortedEvents}
        flowEvents={flowEvents}
        flowTimeline={flowTimeline}
        flowFocus={flowFocus}
        flowsRead={flowsNow == null || !flowDaily.settled ? "reading" : flowsRead}
        // One clock for the scrubber and the Explanation once mounted; the
        // server's until then.
        now={flowsNow ?? renderedAt}
        daily={flowDaily.obs != null}
        surplusState={surplusState}
        troveMeta={troveMeta}
      />
      <ProvInspectorLayer />
    </>
  );
}
