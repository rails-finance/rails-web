"use client";

// Moonwell position detail — reference depth, chain-state-first, the 3-section
// anatomy (card → economics → timeline). Every value is chain-direct or
// chain-derived: position state + timeline replayed from the captured mToken
// events, and the risk surfaces (health factor, runway, borrow capacity,
// market rates, the position narration) read live from the protocol's own
// contracts via /api/chain/moonwell/position — per-market balances +
// borrowBalanceStored, the Comptroller's oracle prices and collateral factors,
// and the Comptroller's OWN getAccountLiquidity verdict (the client replica is
// proven EXACT against it by scripts/verify-moonwell-chain.mjs).
//
// Moonwell cross-collateralises its four markets through one Comptroller, so
// ONE chain fetch covers the whole account. It rides its own effect + state so
// the first paint (card + timeline from the index) never waits on RPC
// round-trips; the risk surfaces stream in when the read lands, a chainStale
// response simply leaves them unrendered, and the debt rows upgrade from the
// last event's emitted accountBorrows to the live borrowBalanceStored (each
// row's `live` flag carries the basis into the provenance).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { moonwellExplorer } from "@/lib/moonwell/explorer";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import type { MoonwellPositionSummary } from "@/lib/sources/api/moonwell-positions";
import { fetchMoonwellTimeline } from "@/lib/api/fetch-moonwell-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_ROWS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { fetchMoonwellChainPosition, type MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MOONWELL_ACTIVITY_RUNS } from "@/lib/moonwell/timeline-runs";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { MoonwellEventCard } from "@/components/protocol/moonwell/moonwell-event-card";
import {
  MoonwellPositionCard,
  viewFromSummary,
  type MoonwellPositionView,
} from "@/components/protocol/moonwell/moonwell-position-card";
import {
  MoonwellPositionExplanation,
  MoonwellClosedPositionExplanation,
} from "@/components/protocol/moonwell/moonwell-position-explanation";
import { moonwellExports } from "@/components/protocol/moonwell/moonwell-export-menu";
import { ExportMenu } from "@/components/shared/export-menu";
import { computeMoonwellCardCaptions, moonwellLifetimeWithOpening } from "@/lib/moonwell/economics";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { CTokenLedgerContext } from "@/components/shared/ctoken-event-ledger";
import { MoonwellFlowsNote, moonwellFlowsContent } from "@/components/protocol/moonwell/moonwell-flows-note";
import { useMoonwellFlows } from "@/hooks/useMoonwellFlows";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { externalActor, summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { liquidationStories } from "@/lib/shared/ctoken-liquidation-story";
import { balancePeaks, withBalancePeaks } from "@/lib/shared/ctoken-peaks";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

/** An Ethereum market key's mToken address. */
const mtokenOf = (market: string) => MOONWELL_MARKET_BY_KEY[market]?.mtoken ?? market;

interface MoonwellPositionViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  initialPosition: MoonwellPositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a wallet with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function MoonwellPositionView({
  wallet,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: MoonwellPositionViewProps) {
  // The event route (rails-ops TO-DO-ui-jobs 236): the sub-nav and the event's
  // card in page mode with the shared column; no position card, no flows panel.
  const onEventPage = useParams<{ eventId?: string }>()?.eventId != null;
  // Keyed on the timeline, not the row: a wallet Moonwell has never seen is a
  // real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<MoonwellPositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — the deepest
  // Moonwell wallet holds ~92 events, well under the window — `cutoffBlock`
  // comes back null, no second request is made and the page is byte-for-byte
  // what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<MoonwellChainResponse | null>(null);
  // Standing display framing (risk view) — a global preference, so the
  // reader's choice on one position carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet) return;
    (async () => {
      setLoading(true);
      try {
        const [pData, tData] = await Promise.all([
          fetchMoonwellPositions({ wallet, limit: 1 }),
          fetchMoonwellTimeline(wallet, { recent: TIMELINE_WINDOW_ROWS }),
        ]);
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
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
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. Only a server-side failure leaves it null with a cutoff block
    // set, which is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/moonwell/timeline/summary",
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
        const data = await fetchMoonwellChainPosition({ wallet });
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
  const liveView = useMemo<MoonwellPositionView | null>(() => {
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

  const moonwellEvents = useMemo(() => events.filter(isMoonwellEvent), [events]);

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. The same narrowing the page applies to its
  // own events applies here, so the spreadsheet and the timeline agree.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchMoonwellTimeline(wallet);
    const served = res.events ?? [];
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served.filter(isMoonwellEvent),
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [wallet]);

  const tl = useTimelineEvents(moonwellEvents, {
    storageKey: `moonwell-${wallet}`,
    protocolKey: "moonwell",
    window: historyWindow,
    // Navigated by the Lifetime flows cursor through "Sync to chart": no Dates.
    dates: false,
  });

  // Who executed this account's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole history so the
  // Explanation can state it once. Derived from the events already on the page;
  // no new field on the position response. Moonwell's party param is the
  // event's own emitted minter/redeemer/payer (`caller`), so a router-proxied
  // mint keeps the owner as signer and does not mark.
  //
  // On a windowed page the opening balance's own split is added: rails-server
  // reconstructs the same tx_from/caller split from the base tables that
  // /timeline does, so both halves judge on the same fact. The two never count
  // one event twice — they are the two sides of an exclusive cut.
  const externalActivity = useMemo(
    () =>
      withOpeningActors(
        summariseExternalActors(
          moonwellEvents.map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.caller,
            wallet: e.wallet,
          })),
        ),
        opening?.actors,
        opening?.totalEvents ?? 0,
      ),
    [moonwellEvents, opening],
  );

  // ⚠️ On a windowed page these must read the MERGED lifetime, not the
  // window's. `lifetimeEvents` is undefined until the opening balance is
  // known, and both reducers below treat an absent event list as "no lifetime
  // layer" rather than as an empty one — so the surfaces state nothing while
  // they cannot state the whole, which is the only correct answer between the
  // two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? moonwellEvents : undefined;
  const precomputedLifetime = useMemo(
    () => moonwellLifetimeWithOpening(moonwellEvents, opening),
    [moonwellEvents, opening],
  );

  // The Lifetime flows panel replays the account's whole history
  // (lib/shared/ctoken-flows.ts through lib/moonwell/flows.ts): the page's
  // rows where they are all of it, else the flat history read once (the
  // CSV's read); a read the row ceiling cut short is a failed read.
  const flows = useMoonwellFlows({
    chainId: 1,
    wholeEvents: historyWindow.state === "whole" ? moonwellEvents : null,
    fetchAll: fetchAllHistory,
    chain,
    mtokenOf,
  });
  const ledgerData = useMemo(() => ({ states: flows.states, brand: "Moonwell", receipt: "mToken" }), [flows.states]);

  // What each liquidation did, and a closed card's peaks as each row's balance
  // before and after it (interest included), where the page holds every row.
  const cardView = useMemo<MoonwellPositionView | null>(() => {
    if (!liveView) return liveView;
    const counted = {
      ...liveView,
      eventTotal: lifetimeFiguresKnown(historyWindow) ? tl.totalCount : undefined,
      ...(chain?.entered ? { entered: chain.entered } : {}),
    };
    if (historyWindow.state !== "whole" || moonwellEvents.length === 0) return counted;
    const liquidations = liquidationStories(
      moonwellEvents.map((e) => {
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
      moonwellEvents.map((e) => {
        const d = e.context.data;
        return {
          market: d.market,
          decimals: MOONWELL_MARKET_BY_KEY[d.market]?.decimals ?? 18,
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
  }, [liveView, historyWindow, moonwellEvents, tl.totalCount, chain]);

  // Stat captions (accrued interest, borrow rate) — the event stream feeds the
  // interest splits; the rates ride the listing row's per-market chain read.
  const captions = liveView ? computeMoonwellCardCaptions(liveView, lifetimeEvents, precomputedLifetime) : null;

  // The top row's price dropdown: the on-chain oracle price of each
  // market the account currently touches.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view || view.status !== "open") return [];
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const r of [...view.supplies, ...view.borrows]) {
      const a = r.address.toLowerCase();
      if (seen.has(a)) continue;
      seen.add(a);
      const p = view.priceByAddress?.[a];
      if (typeof p === "number" && p > 0) out.push({ symbol: r.symbol, address: r.address, price: p });
    }
    return out;
  }, [view]);

  // The card ⋮'s export shapes (ui-jobs 308 point 2).
  const exports = liveView
    ? moonwellExports({
        wallet,
        view: liveView,
        chain,
        events: moonwellEvents,
        csvFilename: `moonwell-${wallet.slice(0, 10)}-activity.csv`,
        fetchAllEvents: historyWindow.state === "whole" ? undefined : fetchAllHistory,
        history: markdownHistoryScope(historyWindow, moonwellEvents),
        scopeNote: exportScopeNote(historyWindow, moonwellEvents, "this wallet's whole history"),
      })
    : null;

  return (
    <FlowFocusContext.Provider value={flows.focus}>
      <CTokenLedgerContext.Provider value={ledgerData}>
        <div className="py-8 space-y-6">
          <DetailTopRow
            session="moonwell"
            wallet={wallet}
            owner={{ wallet }}
            assets={stripAssets}
            closed={liveView != null && liveView.status !== "open"}
            // The exports ride the card's ⋮; the event route, which draws no card,
            // keeps them in the wallet row's Tools.
            tools={onEventPage}
          >
            {onEventPage && exports && <ExportMenu {...exports} />}
          </DetailTopRow>

          {loading ? (
            <DetailBodySkeleton />
          ) : (
            <>
              {!onEventPage && liveView && cardView && (
                <MoonwellPositionCard
                  v={cardView}
                  surface="detail"
                  viewHref={tl.viewHref}
                  captions={captions ?? undefined}
                  // The Health factor, the room left to borrow and the distance to
                  // liquidation come from the live Comptroller read, inside the
                  // card's receipts scope.
                  chain={chain}
                  exports={exports}
                  // The Explanation is now pure layman prose about those same face
                  // figures — no secondary figure-strips. The borrow-capacity strip
                  // is absorbed into the risk slot above; the market rates live on
                  // the market view (where pool-wide rate context belongs). A
                  // terminal account narrates from the index alone (peaks, closure)
                  // — it has no live state to read, so the closed mood never waits
                  // on the chain lane.
                  explanation={
                    liveView.status !== "open" ? (
                      <MoonwellClosedPositionExplanation v={cardView} />
                    ) : (
                      // Passed before the chain read lands (the Fluid treatment):
                      // the pane, and the copy-view link at its foot, mount with
                      // the card rather than with the read.
                      <MoonwellPositionExplanation
                        chain={chain}
                        captions={captions}
                        liquidationCount={liveView.liquidationCount}
                        externalActivity={externalActivity}
                      />
                    )
                  }
                />
              )}
              {/* Lifetime flows: the bars and the line over the account's replay
              (lib/shared/ctoken-flows.ts), in place of the tower
              (TO-DO-ui-jobs 206). */}
              {!onEventPage && liveView && (
                <LifetimeFlowsPanel
                  scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                  read={flows.read}
                  explanation={
                    <div className="space-y-2 text-sm text-rb-500">
                      <MoonwellFlowsNote facts={flows.facts} />
                    </div>
                  }
                  learnMore={moonwellFlowsContent()}
                />
              )}
              <ChainTruthTimeline
                csvExportCeiling={INDEX_ROW_CEILING}
                // Matches `MoonwellEventCard`'s own `persistKey={`moonwell:${event.id}`}` —
                // lets pinned mode (the per-event share route) force a landed
                // card's detail panel open on its first mount.
                persistKeyPrefix="moonwell"
                eventPage={(slot) => moonwellExplorer.eventPage({ ...slot, wallet, deployment: "ethereum" })}
                closed={liveView ? liveView.status !== "open" : undefined}
                tl={tl}
                runs={MOONWELL_ACTIVITY_RUNS}
                // Tenure-first header: when the account started, how long it has
                // run, how fresh the latest activity is.
                toolbarLeading={
                  liveView ? (
                    <TimelineActivityHeader
                      events={moonwellEvents}
                      closed={liveView.status !== "open"}
                      // When the position actually opened, not when the window
                      // does — otherwise a deep wallet reads as days old because
                      // its oldest loaded card is.
                      firstAt={opening?.firstTimestamp}
                      tenurePending={!lifetimeFiguresKnown(historyWindow)}
                    />
                  ) : undefined
                }
                renderCard={(event, meta) =>
                  isMoonwellEvent(event) ? (
                    <MoonwellEventCard event={event} eventNumber={meta.eventNumber} isLast={meta.isLast} />
                  ) : null
                }
              />
              {/* Ambient oracle-price pill, fixed bottom-right. */}
              <ProvInspectorLayer />
            </>
          )}
        </div>
      </CTokenLedgerContext.Provider>
    </FlowFocusContext.Provider>
  );
}
