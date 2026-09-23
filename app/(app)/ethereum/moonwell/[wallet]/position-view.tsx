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
// the first paint (card + tower + timeline from the index) never waits on RPC
// round-trips; the risk surfaces stream in when the read lands, a chainStale
// response simply leaves them unrendered, and the debt rows upgrade from the
// last event's emitted accountBorrows to the live borrowBalanceStored (each
// row's `live` flag carries the basis into the provenance).

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import type { MoonwellPositionSummary } from "@/lib/sources/api/moonwell-positions";
import { fetchMoonwellTimeline } from "@/lib/api/fetch-moonwell-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { fetchMoonwellChainPosition, type MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MOONWELL_ACTIVITY_RUNS } from "@/lib/moonwell/timeline-runs";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { loadMoonwellShareRates, type MoonwellShareRateResponse } from "@/lib/api/fetch-moonwell-share-rate";
import { shareRateNotesFor, liveShareRateNote, type MarketNote, type ShareRateMarket } from "@/lib/shared/market-note";
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
import { MoonwellRiskSlot } from "@/components/protocol/moonwell/moonwell-risk-slot";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import {
  computeMoonwellEconomics,
  computeMoonwellCardCaptions,
  moonwellLifetimeWithOpening,
} from "@/lib/moonwell/economics";
import { moonwellEconomicsExplanation, moonwellEconomicsContent } from "@/lib/moonwell/economics-explanation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { PriceStrip, type PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the Compound page.
const MoonwellExportMenu = dynamic(
  () => import("@/components/protocol/moonwell/moonwell-export-menu").then((m) => m.MoonwellExportMenu),
  { ssr: false },
);

/** Stable empties, so a position with no steps re-renders the timeline no
 *  more than it did before market notes existed (mirrors the Base view). */
const EMPTY_SHARE_RATES: MoonwellShareRateResponse[] = [];
const EMPTY_NOTES: MarketNote[] = [];

/**
 * The markets this account ever supplied into — the only ones whose share
 * rate can have moved anything of this position's.
 *
 * `context.data.market` is the market key on THIS deployment ('weth' |
 * 'usdc' | 'usdt' | 'cbbtc' — unlike Base, where the same field carries the
 * mToken address), so the descriptor is built from the fixed catalog
 * (lib/moonwell/asset-catalog.ts) rather than resolved live. A borrow or a
 * repay is not enough: only a supply-side row states an mToken balance.
 */
function suppliedMarkets(events: readonly BaseActivityEvent[]): ShareRateMarket[] {
  const out = new Map<string, ShareRateMarket>();
  for (const e of events) {
    if (!isMoonwellEvent(e)) continue;
    const d = e.context.data;
    if (d.side !== "supply" || out.has(d.market)) continue;
    const meta = MOONWELL_MARKET_BY_KEY[d.market];
    if (!meta) continue;
    out.set(d.market, { address: meta.mtoken, key: d.market, symbol: meta.symbol });
  }
  return [...out.values()];
}

/** The share-rate route's `market` field IS the catalog key on this
 *  deployment (unlike Base, which returns the mToken address) — matched by
 *  key, never by address. */
function marketByKey(key: string): ShareRateMarket | undefined {
  const meta = MOONWELL_MARKET_BY_KEY[key];
  return meta ? { address: meta.mtoken, key, symbol: meta.symbol } : undefined;
}

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
  // Set once the chain overlay fetch settles (landed OR failed) — the market
  // notes' live half needs to know the overlay is done, not just whether it
  // succeeded, so a stale/failed read does not leave the live-note slot
  // reserved forever (the Polaris pattern: chainSettled, not `chain != null`).
  const [chainSettled, setChainSettled] = useState(false);
  // The markets' own share-rate steps, kept as the endpoint stated them
  // rather than as notes: which steps this position was actually holding
  // across is a pure reduction over the events on the page.
  const [shareRates, setShareRates] = useState<MoonwellShareRateResponse[]>(EMPTY_SHARE_RATES);
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
          fetchMoonwellTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
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
    setChainSettled(false);
    (async () => {
      try {
        const data = await fetchMoonwellChainPosition({ wallet });
        if (!cancelled) {
          if (!data.chainStale) setChain(data);
          setChainSettled(true);
        }
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
        if (!cancelled) setChainSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  // The markets' own share-rate steps — fetched once the timeline has landed
  // (seeded or freshly fetched, either way `loading` has gone false), keyed
  // by the market KEY on this deployment (unlike Base's mToken address; see
  // `marketByKey`). Fail-open and reset on wallet change, as the Base view's
  // twin effect does.
  useEffect(() => {
    setShareRates(EMPTY_SHARE_RATES);
    if (loading || !wallet) return;
    const markets = suppliedMarkets(events);
    if (markets.length === 0) return;
    let cancelled = false;
    loadMoonwellShareRates({ markets: markets.map((m) => m.key), deployment: "moonwell" })
      .then((rates) => {
        if (!cancelled) setShareRates(rates.length > 0 ? rates : EMPTY_SHARE_RATES);
      })
      .catch(() => {
        if (!cancelled) setShareRates(EMPTY_SHARE_RATES);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, loading, events]);

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

  // The market notes: each market's steps reduced against THIS position's own
  // events — the step has to sit inside the position's life and the position
  // has to have been holding the market's mTokens across it. Matched by KEY
  // (the route's `market` field on this deployment), never by address.
  // Measured 2026-09-06: zero steps in all four Ethereum markets over their
  // whole life, so `notes` is expected to be empty here — the live half below
  // is the visible deliverable on this deployment.
  const notes = useMemo(() => {
    if (shareRates.length === 0 || moonwellEvents.length === 0) return EMPTY_NOTES;
    const out = shareRates.flatMap((r) => {
      const market = marketByKey(r.market);
      return market ? shareRateNotesFor(r.steps, market, moonwellEvents) : [];
    });
    return out.length > 0 ? out.sort((a, b) => a.to.block - b.to.block) : EMPTY_NOTES;
  }, [shareRates, moonwellEvents]);

  // Live notes: one per market this account has ENTERED (Comptroller
  // membership) and still holds a nonzero live mToken balance in — the
  // market's own live exchange rate against this account's own newest
  // Mint/Redeem in it. `liveShareRateNote` itself drops a market with no
  // Mint/Redeem row of the account's own to compare the live rate against.
  const liveNotes = useMemo(() => {
    if (!chain || chain.chainStale || moonwellEvents.length === 0) return EMPTY_NOTES;
    const out: MarketNote[] = [];
    for (const m of chain.markets) {
      if (!m.entered) continue;
      const rawUnits = Number(m.mtokenBalanceRaw);
      if (!Number.isFinite(rawUnits) || rawUnits <= 0) continue;
      const descriptor = marketByKey(m.market);
      if (!descriptor) continue;
      const note = liveShareRateNote(moonwellEvents, descriptor, {
        rate: m.exchangeRate,
        block: chain.blockNumber,
        timestamp: chain.blockTimestamp || undefined,
        units: rawUnits / 1e8,
      });
      if (note) out.push(note);
    }
    return out.length > 0 ? out : EMPTY_NOTES;
  }, [chain, moonwellEvents]);

  // While the overlay is still in flight on an OPEN position, the timeline
  // reserves the live-note slot rather than have it pop in after the reader
  // has already read the head of the list (the Polaris view's own rule).
  const liveNotesPending = view?.status === "open" && !chainSettled;

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

  // Stat captions (accrued interest, borrow rate) — the event stream feeds the
  // interest splits; the rates ride the listing row's per-market chain read.
  const captions = liveView ? computeMoonwellCardCaptions(liveView, lifetimeEvents, precomputedLifetime) : null;

  // Ambient price pill (bottom-right): the on-chain oracle price of each
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

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="moonwell" wallet={wallet}>
        {liveView && (
          <MoonwellExportMenu
            wallet={wallet}
            view={liveView}
            chain={chain}
            events={moonwellEvents}
            notes={notes}
            liveNotes={liveNotes}
            csvFilename={`moonwell-${wallet.slice(0, 10)}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, moonwellEvents)}
            scopeNote={exportScopeNote(historyWindow, moonwellEvents, "this wallet's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {liveView && (
            <MoonwellPositionCard
              v={liveView}
              receipts
              viewHref={tl.viewHref}
              captions={captions ?? undefined}
              // The risk slot rides the card's heading-button row (the Aave V3
              // treatment): the Display menu plus the chosen risk picture — HF
              // runway (1.0 exactly the Comptroller's shortfall line) or the
              // borrow-capacity bar. Whatever it draws is on the card face and
              // in the card's receipts scope, so the Provenance list stays 1:1
              // with the face figures.
              rowExtra={
                chain && liveView.status === "open" && chain.healthFactor != null && chain.healthFactor > 0 ? (
                  <MoonwellRiskSlot chain={chain} />
                ) : undefined
              }
              // The Explanation is now pure layman prose about those same face
              // figures — no secondary figure-strips. The borrow-capacity strip
              // is absorbed into the risk slot above; the market rates live on
              // the market view (where pool-wide rate context belongs). A
              // terminal account narrates from the index alone (peaks, closure)
              // — it has no live state to read, so the closed mood never waits
              // on the chain lane.
              explanation={
                liveView.status !== "open" ? (
                  <MoonwellClosedPositionExplanation v={liveView} />
                ) : (
                  // Passed before the chain read lands (the Fluid treatment):
                  // the pane, and the copy-view link at its foot, mount with
                  // the card rather than with the read.
                  <MoonwellPositionExplanation
                    chain={chain}
                    captions={captions}
                    txCount={liveView.txCount}
                    liquidationCount={liveView.liquidationCount}
                    externalActivity={externalActivity}
                  />
                )
              }
            />
          )}
          {liveView &&
            (() => {
              const towerData = computeMoonwellEconomics(liveView, lifetimeEvents, undefined, precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={moonwellEconomicsExplanation(towerData)}
                  learnMore={moonwellEconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={INDEX_ROW_CEILING}
            // Matches `MoonwellEventCard`'s own `persistKey={`moonwell:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="moonwell"
            closed={liveView ? liveView.status !== "open" : undefined}
            tl={tl}
            runs={MOONWELL_ACTIVITY_RUNS}
            // Receipted facts about the MARKETS this account supplied into
            // (historical steps — measured empty for all four markets as of
            // 2026-09-06) and this account's own live share-rate note per
            // entered market it still holds. `liveNotesPending` reserves the
            // head slot while the chain overlay is still in flight on an
            // open position, so it never appears after hydration with no
            // reservation (the Polaris view's rule).
            notes={notes}
            liveNotes={liveNotes}
            liveNotesPending={liveNotesPending}
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
                <MoonwellEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                />
              ) : null
            }
          />
          {/* Ambient oracle-price pill, fixed bottom-right. */}
          <PriceStrip assets={stripAssets} leading={<ProvInspectorToggle />} />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
