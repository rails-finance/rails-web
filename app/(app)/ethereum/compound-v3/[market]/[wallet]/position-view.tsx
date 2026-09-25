"use client";

// Compound V3 (Comet) position detail — the addressable per-(market, wallet)
// deep view. Comet is siloed per base asset (cUSDCv3 / cWETHv3 / cUSDTv3 are
// separate contracts, each with its own shared health), and a wallet holds AT
// MOST ONE position per market — so (market, wallet) is the clean unit for
// "this position," the same shape Aave V4 uses for its spokes. The wallet's
// other markets live on the listing-filtered view at /compound?q=<wallet> —
// that page is the market chooser.
//
// Ported from the now-removed /compound/[wallet] page, which stacked ALL of a
// wallet's markets as equal-weight cards over one merged cross-market timeline.
// The only structural change is that the market comes from the URL and both the
// position fetch and the timeline are scoped to it, so this renders one position
// card + risk surfaces + one economics tower + a market-scoped timeline.
//
// Every value below is chain-direct or chain-derived: position state + timeline
// replayed from the captured Comet events, and the risk surfaces (health factor,
// runway, borrow capacity, market rates, the position narration) read live from
// the market's Comet contract via /api/chain/compound/position (balanceOf /
// collateralBalanceOf / getAssetInfo / getPrice — plus the contract's OWN
// isBorrowCollateralized / isLiquidatable verdicts, verified against the derived
// arithmetic by scripts/verify-compound-v3-chain.mjs). The economics tower values
// each asset at Comet's own on-chain oracle (getPrice, threaded on the summary's
// priceByAddress) and — with the event stream — adds the lifetime flow layer and
// the borrower's principal-vs-accrued split.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import { fetchCompoundTimeline } from "@/lib/api/fetch-compound-timeline";
import { fetchCompoundPosition, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { COMPOUND_LIQUIDATION_RUNS } from "@/lib/compound/timeline-runs";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { useWalletContext } from "@/components/nav/wallet-context";
import { NAV_LINK } from "@/lib/shared/ui-grammar";
import { shortAddr } from "@/lib/shared/format-event";
import { marketOf } from "@/lib/compound/asset-catalog";
import {
  CompoundPositionCard,
  cardSideUsd,
  viewFromSummary,
  type CompoundPositionView,
} from "@/components/protocol/compound/compound-position-card";
import { CompoundEventCard } from "@/components/protocol/compound/compound-event-card";
import {
  CompoundPositionExplanation,
  CompoundClosedPositionExplanation,
} from "@/components/protocol/compound/compound-position-explanation";
import { CompoundRiskSlot } from "@/components/protocol/compound/compound-risk-slot";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeCompoundEconomics, compoundLifetimeWithOpening } from "@/lib/compound/economics";
import { compoundEconomicsExplanation, compoundEconomicsContent } from "@/lib/compound/economics-explanation";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the V4 spoke page.
const CompoundExportMenu = dynamic(
  () => import("@/components/protocol/compound/compound-export-menu").then((m) => m.CompoundExportMenu),
  { ssr: false },
);

/** Renders the single (market, wallet) position: the card, the live risk
 *  surfaces for that market (when its chain read landed), and the chain-state
 *  economics tower with the lifetime layer from the market's own events. */
function Position({
  view,
  events,
  chain,
  historyWindow,
  viewHref,
}: {
  view: CompoundPositionView;
  events: BaseActivityEvent[];
  chain: CompoundMarketChainResponse | null;
  /** The window the page drew. `whole` on all but a handful of positions, and
   *  there every figure below is the plain whole-history reduction it has
   *  always been. */
  historyWindow: TimelineWindow;
  /** Copy-this-view control — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  const sideUsd = cardSideUsd(view);
  const opening = historyWindow.opening;
  // ⚠️ On a windowed page the tower must read the MERGED lifetime, not the
  // window's. Between the two requests the reducer is handed NEITHER an event
  // list nor a precomputed one, so it states no lifetime layer at all rather
  // than presenting the window's arithmetic as a lifetime — the only correct
  // answer while the opening balance is in flight or has failed. Comet's own
  // carve-outs are untouched by the merge: they run on its result, per market.
  const lifetimeEvents = lifetimeFiguresKnown(historyWindow) ? events : undefined;
  const precomputedLifetime = useMemo(
    () => compoundLifetimeWithOpening(events, view.market, opening),
    [events, view.market, opening],
  );
  const towerData = useMemo(
    () => computeCompoundEconomics(view, lifetimeEvents, undefined, precomputedLifetime),
    [view, lifetimeEvents, precomputedLifetime],
  );
  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole market-scoped
  // timeline so the Explanation can state it once. Derived from the events
  // already on the page; no new field on the position response. Comet's party
  // param is the Supply/SupplyCollateral `from` (the funder).
  //
  // On a windowed page the opening balance's own split is added: rails-server
  // reads the same funder column under the same two-action filter, so both
  // halves judge on the same fact and neither counts an event the other did.
  const externalActivity = useMemo(
    () =>
      withOpeningActors(
        summariseExternalActors(
          events.filter(isCompoundEvent).map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.funder,
            wallet: e.wallet,
          })),
        ),
        opening?.actors,
        opening?.totalEvents ?? 0,
      ),
    [events, opening],
  );
  return (
    <div className="space-y-6">
      <CompoundPositionCard
        v={view}
        receipts
        viewHref={viewHref}
        // The risk slot rides the card's heading-button row (the Aave V3
        // treatment): the always-on liquidation runway with the stated
        // borrow-capacity lines beneath it. Whatever it draws is on the card
        // face and in the card's receipts scope, so the Provenance list stays
        // 1:1 with the face figures.
        rowExtra={
          chain && view.status === "open" && chain.healthFactor != null && chain.healthFactor > 0 ? (
            <CompoundRiskSlot chain={chain} />
          ) : undefined
        }
        // The Explanation is now pure layman prose about those same face
        // figures — no secondary figure-strips. The borrow-capacity strip is
        // absorbed into the risk slot above; the market rates live on the
        // market view (where pool-wide rate context belongs). The card's own
        // USD side headlines ride along so the pane can restate them exactly.
        explanation={
          // A terminal position narrates from the index alone (its live read
          // answers zeros) — the pane must never wait on the chain lane.
          view.status !== "open" ? (
            <CompoundClosedPositionExplanation v={view} />
          ) : chain ? (
            <CompoundPositionExplanation
              chain={chain}
              collateralUsd={sideUsd.supplyUsd}
              debtUsd={sideUsd.borrowUsd}
              externalActivity={externalActivity}
            />
          ) : undefined
        }
      />
      <ChainTruthTower
        data={towerData}
        explanation={compoundEconomicsExplanation(towerData)}
        learnMore={compoundEconomicsContent()}
      />
    </div>
  );
}

interface CompoundPositionViewProps {
  /** Already lower-cased and address-shaped — the server route turned anything
   *  else away with a 404 before this component existed. */
  wallet: string;
  /** The Comet slug, lower-cased. Deliberately NOT gated against the catalog:
   *  `marketOf` synthesises an entry for a slug it has not seen so a
   *  newly-captured market never crashes the UI, and a 404 here would take that
   *  back. */
  market: string;
  initialPosition: CompoundPositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — an account with no captured events on this Comet — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function CompoundPositionView({
  wallet,
  market,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: CompoundPositionViewProps) {
  const marketLabel = marketOf(market).label;
  // Keyed on the timeline, not the row: an account this Comet has never seen is
  // a real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  // The wallet's other positions = the listing filtered to this wallet. The
  // listing's free-text search decodes from the `q` param (BaseListFilters.q →
  // decodeListFilters), so `?q=<wallet>` is what actually pre-fills the search
  // and filters the rows — and it trips the listing's onFilters wallet-pill
  // dispatch. (The listing has no `wallet`/`ownerAddress` param.)
  const walletFilterHref = `/ethereum/compound-v3?q=${wallet}`;

  const [view, setView] = useState<CompoundPositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — the great
  // majority of the index's Comet positions — `cutoffBlock` comes back null, no
  // second request is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<CompoundMarketChainResponse | null>(null);

  // Surface the wallet in the header pill (the Aave V4 treatment), so the nav
  // chrome reads the same on the detail page as on the wallet-filtered chooser.
  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!/^0x[a-f0-9]{40}$/.test(wallet ?? "")) return;
    setWallets([wallet], { [wallet]: null });
  }, [wallet, setWallets]);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet || !market) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [pData, tData] = await Promise.all([
          // Both scoped to the one market — the backend filters on `market`, so
          // the position list is 0-or-1 row and the timeline is this market only.
          fetchCompoundPositions({ wallet, market, limit: 1 }),
          fetchCompoundTimeline(wallet, { market, recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        if (cancelled) return;
        setView(pData.data[0] ? viewFromSummary(pData.data[0]) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, market, seeded]);

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
      path: "/api/compound/timeline/summary",
      // A Comet position is (market, wallet) and the summary route requires
      // both: an all-markets opening balance attached to one market's rows
      // would be a wrong number rather than a partial one.
      params: { wallet, market },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, market, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // The live Comet read (health / capacity / rates) for this market, off the
  // critical path; a failure returns chainStale and the risk surfaces stay
  // unrendered while the index-derived layer still renders.
  useEffect(() => {
    if (!wallet || !market) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCompoundPosition({ wallet, market });
        if (!cancelled && !data.chainStale) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, market]);

  const compoundEvents = useMemo(() => events.filter(isCompoundEvent), [events]);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. The same narrowing the page applies to its
  // own events applies here, so the spreadsheet and the timeline agree.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchCompoundTimeline(wallet, { market });
    const served = res.events ?? [];
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served.filter(isCompoundEvent),
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [wallet, market]);

  // The tx-sibling seam: each card reaches its same-tx peers so an AbsorbCollateral
  // leg can cross-reference the AbsorbDebt narrator (the whole-account absorption).
  const siblingsByTx = useMemo(() => groupEventsByTx(compoundEvents), [compoundEvents]);
  const tl = useTimelineEvents(compoundEvents, {
    storageKey: `compound-${market}-${wallet}`,
    protocolKey: "compound",
    window: historyWindow,
  });

  // The top row's price dropdown: the open market's base +
  // held collateral at Comet's own oracle price.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!view || view.status !== "open") return [];
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    const assets = [
      { symbol: view.base.symbol, address: view.base.address },
      ...view.collateral.filter((c) => c.amount > 0).map((c) => ({ symbol: c.symbol, address: c.address })),
    ];
    for (const a of assets) {
      if (!a.address) continue;
      const addr = a.address.toLowerCase();
      if (seen.has(addr)) continue;
      seen.add(addr);
      const p = view.priceByAddress?.[addr];
      if (typeof p === "number" && p > 0) out.push({ symbol: a.symbol, address: a.address, price: p });
    }
    return out;
  }, [view]);

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="compound" wallet={wallet} assets={stripAssets}>
        {view && (
          <CompoundExportMenu
            wallet={wallet}
            views={[view]}
            chainByMarket={chain ? { [market]: chain } : {}}
            events={compoundEvents}
            csvFilename={`compound-${market}-${wallet.slice(0, 10)}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            queued={{
              protocol: "compound-v3",
              params: { wallet, market },
              totalEvents: lifetimeFiguresKnown(historyWindow) ? tl.totalCount : null,
            }}
            history={markdownHistoryScope(historyWindow, compoundEvents)}
            scopeNote={exportScopeNote(historyWindow, compoundEvents, "this wallet's whole history in this market")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : view ? (
        <>
          <Position
            view={view}
            events={compoundEvents}
            chain={chain}
            historyWindow={historyWindow}
            viewHref={tl.viewHref}
          />
          <ChainTruthTimeline
            // The queued export (rails-ops decision 0029) has no row cap: the
            // card offers the CSV whenever the total is known.
            csvExportCeiling={null}
            // Matches `CompoundEventCard`'s own `persistKey={`compound:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="compound"
            closed={view.status !== "open"}
            tl={tl}
            runs={COMPOUND_LIQUIDATION_RUNS}
            // Tenure-first header (the V4 spoke treatment): when the wallet's
            // activity in this market started, how long it has run, how fresh.
            toolbarLeading={
              <TimelineActivityHeader
                events={compoundEvents}
                closed={view.status !== "open"}
                // When the position actually opened, not when the window does —
                // otherwise a wallet with ten thousand events reads as days old
                // because its oldest loaded card is.
                firstAt={opening?.firstTimestamp}
                tenurePending={!lifetimeFiguresKnown(historyWindow)}
              />
            }
            renderCard={(event, meta) =>
              isCompoundEvent(event) ? (
                <CompoundEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  siblings={siblingsByTx.get(event.txHash) ?? [event]}
                />
              ) : null
            }
          />
          {/* Ambient oracle-price pill, fixed bottom-right (the V4 treatment). */}
          <ProvInspectorLayer />
        </>
      ) : (
        // The URL points at a market this wallet has no position in (typo, stale
        // link, or a market it never entered) — bail with a path back to the
        // wallet's other positions rather than dead-ending.
        <div className="text-center py-12">
          <p className="text-foreground text-lg mb-3">
            <span className="font-mono">{shortAddr(wallet)}</span> has no {marketLabel} position
          </p>
          <p className="text-sm text-rb-500">
            <Link href={walletFilterHref} className={`underline ${NAV_LINK}`}>
              See this wallet&rsquo;s other positions →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
