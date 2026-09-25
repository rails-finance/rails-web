"use client";

// Every Compound V3 position one wallet holds on Base — state, economics and
// whole history, market by market.
//
// The Ethereum explorer's detail page is ONE (market, wallet) pair, because
// that is what its index hands you a link to. This page is the whole wallet:
// Comet names no accounts, so nothing can hand you a link here — the page
// finds the positions itself by asking every market in the roster about the
// address, and it finds the HISTORY from the index when the index holds the
// whole of it, and by sweeping every Comet's own logs for the address from the
// earliest Comet's first block until then (the route decides; `coverage.source`
// says which answered).
//
// Each market the wallet has ever touched is its own section, and each section
// is the Ethereum page's body: the shared position card with the live risk
// slot, the economics tower, and a market-scoped timeline. That is deliberate.
// A Comet market is single-base and multi-collateral, nothing is
// cross-collateralised between markets, and they do not all measure in the
// same unit (cWETHv3 quotes in ETH) — so there is no combined health factor to
// state and no total to sum, and each market stands on its own exactly as it
// does on the chain.
//
// Two reads feed the sections, in the order they can answer: the Comets
// (fast — three batched calls at one pinned block — feeds the cards) and the
// history (the index in one read, or the sweep — slow, the whole chain in
// chunks — feeds the timelines, the tower's lifetime layer, and the card's
// principal and peaks). A market with a live balance but no history, or
// history but no live balance (a closed position), is a section either way.
// The history's completeness is a property of the request rather than of the
// explorer, so it is stated under every timeline.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import {
  CompoundPositionCard,
  cardSideUsd,
  type CompoundPositionView,
} from "@/components/protocol/compound/compound-position-card";
import { CompoundEventCard } from "@/components/protocol/compound/compound-event-card";
import {
  CompoundPositionExplanation,
  CompoundClosedPositionExplanation,
} from "@/components/protocol/compound/compound-position-explanation";
import { CompoundRiskSlot } from "@/components/protocol/compound/compound-risk-slot";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { COMPOUND_LIQUIDATION_RUNS } from "@/lib/compound/timeline-runs";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { TimelineCoverageFooter } from "@/components/shared/timeline-coverage-footer";
import { boundaryFromChainCoverage } from "@/lib/shared/timeline-boundary";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { CaptureSourceProvider, type CaptureSource } from "@/lib/shared/capture-source";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import { computeCompoundEconomics } from "@/lib/compound/economics";
import { compoundEconomicsExplanation, compoundEconomicsContent } from "@/lib/compound/economics-explanation";
import { COMPOUND_SWEPT_VOCABULARY } from "@/lib/compound/swept-tower-provenance";
import { cometViewFromChain } from "@/lib/compound/chain-position-view";
import { CometDeploymentProvider } from "@/lib/compound/deployment-context";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { fetchCompoundBaseWallet, type CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { ChainTimelineUnavailable, fetchChainTimeline } from "@/lib/api/fetch-chain-timeline";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { CometChainTimelineResult, CometMarketReplay } from "@/lib/sources/chain/compound-v3-events";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { SweepInFlight } from "@/components/shared/sweep-in-flight";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, as on the Ethereum page.
const CompoundExportMenu = dynamic(
  () => import("@/components/protocol/compound/compound-export-menu").then((m) => m.CompoundExportMenu),
  { ssr: false },
);

const TIMELINE_ROUTE = "/api/chain/compound-base/timeline";
const PRICES_ROUTE = "/api/chain/compound-base/oracle-prices";

/** What the coverage footer says was read. */
const SOURCE_LABEL = "the Compound V3 deployment on Base (all five Comets)";

type TimelineState = "loading" | "ready" | "unavailable" | "failed";

/** Prices keyed `${marketKey}:${token}` — each Comet reads its own feeds, so a
 *  token has one price PER MARKET, not one price. */
async function fetchCometPrices(pairs: string[]): Promise<Record<string, number>> {
  if (pairs.length === 0) return {};
  const res = await fetch(`${PRICES_ROUTE}?pairs=${pairs.join(",")}`, { cache: "no-store" });
  if (!res.ok) return {};
  const data = (await res.json()) as { prices?: Record<string, number> };
  return data.prices ?? {};
}

/** This market's prices, keyed by token — what the view and tower look up. */
function pricesFor(prices: Record<string, number>, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(prices)) if (k.startsWith(`${key}:`)) out[k.slice(key.length + 1)] = v;
  return out;
}

interface Section {
  market: CometMarket;
  chain: CompoundMarketChainResponse | null;
  replay: CometMarketReplay | null;
}

const holdsSomething = (live: CompoundMarketChainResponse | null): boolean =>
  live != null && (live.supplyBalanceRaw !== "0" || live.borrowBalanceRaw !== "0" || live.collateral.length > 0);

/** One market's position: card + risk slot, tower, and its own timeline. */
function MarketSection({
  section,
  view,
  events,
  timeline,
  timelineState,
  sweptClean,
  captureSource,
}: {
  section: Section;
  view: CompoundPositionView;
  /** This market's events only. */
  events: BaseActivityEvent[];
  timeline: CometChainTimelineResult | null;
  timelineState: TimelineState;
  sweptClean: boolean;
  /** Which capture answered — the index or the sweep. Words below differ. */
  captureSource: CaptureSource;
}) {
  const { market, chain, replay } = section;
  const compoundEvents = useMemo(() => events.filter(isCompoundEvent), [events]);
  const siblingsByTx = useMemo(() => groupEventsByTx(compoundEvents), [compoundEvents]);
  const tl = useTimelineEvents(compoundEvents, {
    storageKey: `compound-base-${market.key}-${view.account}`,
    protocolKey: "compound",
    // THIS market's rows before the trim (the replay's per-market count, not
    // the wallet-wide one — the page draws one timeline per market), so
    // numbering runs over the market's whole history and the count line
    // states its real total (rails-ops decision 0019).
    olderCount: replay?.omitted?.count ?? 0,
  });
  const sideUsd = cardSideUsd(view);

  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the market's timeline.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        compoundEvents.map((e) => ({
          txFrom: e.context.data.txFrom,
          poolCaller: e.context.data.funder,
          wallet: e.wallet,
        })),
      ),
    [compoundEvents],
  );

  // The tower's lifetime layer is labelled "all time" and is only entitled to
  // that word if the history covers every block. A holed or short sweep keeps
  // the bars (the current state comes from the Comet, not the logs) and drops
  // the flows; an index read is served only when whole, so it never lands
  // here. The sums come from the SERVER's replay over every row, never from
  // the capped list on this page.
  const towerData = useMemo(() => {
    const built = computeCompoundEconomics(
      view,
      undefined,
      COMPOUND_SWEPT_VOCABULARY,
      sweptClean && replay ? replay.lifetime : undefined,
    );
    return sweptClean
      ? built
      : {
          ...built,
          flowsNote:
            "Lifetime flows are hidden because the history sweep did not read every block of this market's life — see the note under the timeline for where it stopped or what it missed. Summing what did arrive would label a partial history “all time”. The current balances above are unaffected: they are read from the Comet, not replayed from the events.",
        };
  }, [view, replay, sweptClean]);

  const live = chain && !chain.chainStale ? chain : null;
  const holds = holdsSomething(live);

  return (
    <section className="space-y-6">
      <CompoundPositionCard
        v={view}
        receipts
        viewHref={tl.viewHref}
        vocab={COMPOUND_SWEPT_VOCABULARY}
        session="compound-base"
        rowExtra={
          live && view.status === "open" && live.healthFactor != null && live.healthFactor > 0 ? (
            <CompoundRiskSlot chain={live} />
          ) : undefined
        }
        explanation={
          view.status !== "open" ? (
            <CompoundClosedPositionExplanation v={view} />
          ) : live ? (
            <CompoundPositionExplanation
              chain={live}
              collateralUsd={sideUsd.supplyUsd}
              debtUsd={sideUsd.borrowUsd}
              externalActivity={externalActivity}
            />
          ) : undefined
        }
      />

      {timelineState === "ready" && (
        <ChainTruthTower
          data={towerData}
          explanation={compoundEconomicsExplanation(towerData, { onBase: true })}
          learnMore={compoundEconomicsContent({ onBase: true })}
        />
      )}

      {timelineState === "ready" && timeline ? (
        <ChainTruthTimeline
          // Matches `CompoundEventCard`'s own `persistKey={`compound:${event.id}`}`
          // — lets pinned mode (the per-event share route) force a landed
          // card's detail panel open on its first mount. Only ONE
          // `MarketSection` ever mounts this component while an `eventId` is
          // on the URL — see `renderedSectionsWithViews` above for why (this
          // page holds one section per market, each with its own timeline).
          persistKeyPrefix="compound"
          closed={view.status !== "open"}
          tl={tl}
          runs={COMPOUND_LIQUIDATION_RUNS}
          // Tenure-first header: when the wallet's activity in THIS market
          // started — the replay's own first-event date, resolved from the
          // market's oldest row even when the drawn list is a capped slice
          // that starts much later. The coverage's `firstEventAt` is the
          // wallet's oldest event across every market, which is a different
          // date, so it is not the one used here.
          toolbarLeading={
            <TimelineActivityHeader
              events={compoundEvents}
              closed={view.status !== "open"}
              firstAt={replay?.firstEventAt ?? null}
            />
          }
          emptyLabel={
            !sweptClean
              ? "No events to show — the sweep could not read this wallet's history."
              : holds
                ? captureSource === "index"
                  ? "The index holds every block and has no Comet event naming this account in this market — the balance arrived by a route the Comet logs without naming the account."
                  : "The sweep read every block and found no Comet event naming this account in this market — the balance arrived by a route the Comet logs without naming the account."
                : "This wallet has no Compound V3 activity in this market."
          }
          footer={<TimelineCoverageFooter coverage={timeline.coverage} sourceLabel={SOURCE_LABEL} />}
          boundary={boundaryFromChainCoverage(
            { ...timeline.coverage, omitted: replay?.omitted },
            compoundEvents.length,
          )}
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
      ) : timelineState === "loading" ? (
        <SweepInFlight>
          Reading this wallet&rsquo;s whole history from the Comets&rsquo; logs — the sweep runs from the earliest
          market&rsquo;s first block, so it takes a moment.
        </SweepInFlight>
      ) : (
        <p className="py-6 text-center text-sm text-rb-500">
          {timelineState === "unavailable"
            ? "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The position above is read live from the Comet and is unaffected."
            : "The history sweep failed. Reload to try again — the position above is read live from the Comet and is unaffected."}
        </p>
      )}
    </section>
  );
}

interface CompoundBaseWalletViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** Every Comet's answer about this account, read on the server. `null` means
   *  the read failed (or came back a stale stub) and the effect below reads it
   *  from the browser exactly as this page always did. */
  initialWallet: CompoundWalletChainResponse | null;
  /** The history in the route's own wire shape, present when the index
   *  vouched for the whole life — or, for one of the six addresses too heavy
   *  to send whole, for the horizon it states instead, which the coverage
   *  carries and `sweptClean` below reads. `null` means the client sweeps, as
   *  before. */
  initialTimeline: unknown | null;
}

export default function CompoundBaseWalletView({
  wallet,
  initialWallet,
  initialTimeline,
}: CompoundBaseWalletViewProps) {
  const seeded = initialWallet != null;
  // Rehydrated through the same function the fetch client runs on a response
  // body, so a seeded timeline and a fetched one are the same object.
  const timelineSeeded = initialTimeline != null;

  const [data, setData] = useState<CompoundWalletChainResponse | null>(initialWallet);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<CometChainTimelineResult | null>(() =>
    initialTimeline != null ? (rehydrateChainTimelineWire(initialTimeline) as CometChainTimelineResult) : null,
  );
  const [timelineState, setTimelineState] = useState<TimelineState>(timelineSeeded ? "ready" : "loading");
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Only when the server could not answer. A seeded view has every Comet's
  // figures in its first paint and never asks again.
  useEffect(() => {
    if (seeded || !wallet) return;
    let cancelled = false;
    setLoading(true);
    fetchCompoundBaseWallet({ wallet })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(d.chainStale ? "The read failed — reload to retry." : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the positions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, seeded]);

  // The sweep, off the critical path. "Could not sweep" and "swept, found
  // nothing" are kept apart — one is our failure, the other is the history.
  useEffect(() => {
    if (timelineSeeded || !wallet) return;
    let cancelled = false;
    setTimelineState("loading");
    fetchChainTimeline<CometChainTimelineResult>({ wallet, route: TIMELINE_ROUTE, mark: "compound-base-timeline" })
      .then((d) => {
        if (cancelled) return;
        setTimeline(d);
        setTimelineState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setTimelineState(e instanceof ChainTimelineUnavailable ? "unavailable" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, timelineSeeded]);

  const events = useMemo<BaseActivityEvent[]>(() => timeline?.events ?? [], [timeline]);
  const compoundEvents = useMemo(() => events.filter(isCompoundEvent), [events]);

  // Which capture answered. The receipts' custody line and the footer's
  // whole-life sentence read from this; until the response arrives it is the
  // sweep, the default this explorer had before it gained an index.
  const captureSource: CaptureSource = timeline?.coverage.source === "index" ? "index" : "sweep";

  // "The history covers every block of the deployment's life." Both conditions
  // are needed: no holes inside the span, AND the span reaching the earliest
  // Comet's first block (an index read is served only when both hold). A horizon leaves the events contiguous but the
  // history starting later than the protocol, which is enough to disqualify a
  // lifetime total from the words "all time".
  const sweptClean =
    timelineState === "ready" &&
    (timeline?.coverage.gaps.length ?? 0) === 0 &&
    timeline?.coverage.fromDeployment === true;

  // The sections: every market the Comets say the wallet holds something in,
  // plus every market the sweep saw it touch — roster order. A market on one
  // list and not the other is a section either way (see the header).
  const sections = useMemo<Section[]>(
    () =>
      COMPOUND_BASE_DEPLOYMENT.markets
        .map((market) => ({
          market,
          chain: data && !data.chainStale ? (data.positions.find((p) => p.market === market.key) ?? null) : null,
          replay: timeline?.markets.find((r) => r.market === market.key) ?? null,
        }))
        .filter((s) => s.chain != null || s.replay != null),
    [data, timeline],
  );

  // Every token each section's card, tower or lifetime layer could price: the
  // base, the held collateral, and every collateral asset the history ever
  // moved (a withdrawn asset is priced by nothing else on the page). One shot
  // per wallet once the sweep has settled either way, so the lifetime assets
  // are known; a token a market will not price stays unpriced rather than
  // driving a retry loop.
  const pricedRef = useRef<string | null>(null);
  useEffect(() => {
    if (sections.length === 0 || timelineState === "loading") return;
    if (pricedRef.current === wallet) return;
    const pairs = new Set<string>();
    for (const s of sections) {
      const key = s.market.key;
      pairs.add(`${key}:${s.market.baseToken.toLowerCase()}`);
      for (const c of s.chain?.collateral ?? []) pairs.add(`${key}:${c.address.toLowerCase()}`);
      for (const a of Object.keys(s.replay?.lifetime.collateral ?? {})) pairs.add(`${key}:${a}`);
      for (const c of s.replay?.peak.collateral ?? []) pairs.add(`${key}:${c.address}`);
    }
    pricedRef.current = wallet;
    let cancelled = false;
    fetchCometPrices([...pairs])
      .then((p) => {
        if (!cancelled && Object.keys(p).length > 0) setPrices(p);
      })
      .catch(() => {
        // The tower stays on the token-only list, which is what no price means.
      });
    return () => {
      cancelled = true;
    };
  }, [sections, timelineState, wallet]);

  const views = useMemo(
    () =>
      sections.map((s) =>
        // `sweptClean` is the last argument for the reason it is the last
        // clause everywhere else on this page: the principal, the peaks, the
        // transaction count and the last-activity stamp are claims about the
        // WHOLE life, and a horizoned history — the API's heavy answer, or a
        // capped sweep — has not read one.
        cometViewFromChain(s.market, wallet, s.chain, s.replay, pricesFor(prices, s.market.key), sweptClean),
      ),
    [sections, wallet, prices, sweptClean],
  );

  // A market's own `ChainTruthTimeline` reads `event/[eventId]` off the URL
  // itself (see chain-truth-timeline.tsx's pinned-mode branch) — it has no
  // way to know it is one of SEVERAL sections on this page, so every section
  // would enter pinned mode at once: the one holding the event draws it, and
  // every other draws a "not found" notice for an event that is not missing,
  // only in a different market. Filtering the RENDERED sections down to the
  // one that actually holds the pinned event is a page-level fix — it keeps
  // that ambiguity out of the shared component (whose own general fix, a
  // `sharePath` redirect prop, belongs to whichever change owns that file
  // next) while still landing on exactly one card here, the same as every
  // single-section family. An id this page cannot place (fabricated, or
  // older than the served window) falls through to every section unfiltered,
  // each stating its own "not found" — the pre-existing behaviour.
  const pinnedRouteParams = useParams<{ eventId?: string | string[] }>();
  const rawPinnedEventId = Array.isArray(pinnedRouteParams.eventId)
    ? pinnedRouteParams.eventId[0]
    : pinnedRouteParams.eventId;
  const pinnedEventId = rawPinnedEventId != null ? decodeEventId(rawPinnedEventId) : null;
  const pinnedMarketKey = useMemo(
    () => (pinnedEventId ? (compoundEvents.find((e) => e.id === pinnedEventId)?.context.data.market ?? null) : null),
    [pinnedEventId, compoundEvents],
  );
  const sectionsWithViews = useMemo(() => sections.map((s, i) => ({ s, view: views[i] })), [sections, views]);
  const renderedSectionsWithViews = pinnedMarketKey
    ? sectionsWithViews.filter(({ s }) => s.market.key === pinnedMarketKey)
    : sectionsWithViews;

  // Silence is only evidence of absence when someone actually listened: a
  // sweep that could not read the chain also comes back with no events, and a
  // Comet read that failed also holds nothing.
  const untouched = data != null && !data.chainStale && data.positionsFound === 0 && sweptClean && events.length === 0;

  const chainByMarket = useMemo(
    () => Object.fromEntries(sections.flatMap((s) => (s.chain ? [[s.market.key, s.chain] as const] : []))),
    [sections],
  );

  // Ambient oracle-price pill: every priced token the wallet holds, in its
  // market's own unit converted to dollars by the protocol's own feeds.
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    const seen = new Set<string>();
    const out: PriceStripAsset[] = [];
    for (const v of views) {
      if (v.status !== "open") continue;
      const assets = [
        { symbol: v.base.symbol, address: v.base.address },
        ...v.collateral.filter((c) => c.amount > 0).map((c) => ({ symbol: c.symbol, address: c.address })),
      ];
      for (const a of assets) {
        const addr = a.address.toLowerCase();
        if (seen.has(addr)) continue;
        const p = v.priceByAddress?.[addr];
        if (typeof p === "number" && p > 0) {
          seen.add(addr);
          out.push({ symbol: a.symbol, address: a.address, price: p });
        }
      }
    }
    return out;
  }, [views]);

  return (
    <CaptureSourceProvider value={captureSource}>
      <CometDeploymentProvider deployment={COMPOUND_BASE_DEPLOYMENT}>
        <div className="py-8 space-y-6">
          <DetailTopRow session="compound-base" wallet={wallet} assets={stripAssets}>
            {views.length > 0 && (
              <CompoundExportMenu
                wallet={wallet}
                views={views}
                chainByMarket={chainByMarket}
                events={compoundEvents}
                csvFilename={`compound-base-${wallet.slice(0, 10)}-activity.csv`}
              />
            )}
          </DetailTopRow>

          {loading ? (
            <DetailBodySkeleton />
          ) : error ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">Couldn&apos;t read this wallet&apos;s positions.</p>
              <p className="text-sm">{error}</p>
            </div>
          ) : untouched ? (
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">This wallet has never touched Compound V3 on Base.</p>
              <p className="text-sm">
                All {data?.marketsScanned} markets were asked and none holds a balance, a debt or collateral for this
                address — and no Comet has emitted an event naming it between the earliest market&rsquo;s first block
                and now.
              </p>
            </div>
          ) : sections.length === 0 ? (
            // The Comets hold nothing for this wallet and the sweep could not
            // say whether it ever did: the two facts are stated apart.
            <div className="py-12 text-center text-rb-500">
              <p className="mb-1">This wallet holds nothing on Compound V3 Base right now.</p>
              <p className="text-sm">
                All {data?.marketsScanned} markets were asked, and none holds a balance, a debt or collateral for this
                address.{" "}
                {timelineState === "loading"
                  ? "Whether it ever did is still being read from the Comets' logs."
                  : timelineState === "ready"
                    ? "Whether it ever did could not be settled: the history sweep did not read every block. Reload to sweep again."
                    : "Whether it ever did is unknown: the history sweep could not run."}
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              <p className="text-[11px] text-rb-500">
                {sections.length === 1 ? "One market" : `${sections.length} markets`} of{" "}
                <span className="text-foreground">
                  {data?.marketsScanned ?? COMPOUND_BASE_DEPLOYMENT.markets.length}
                </span>
                , every one of them asked. Each market stands on its own: nothing is cross-collateralised between them,
                so there is no combined health factor here and no total — the markets do not all price in the same unit.
              </p>
              {renderedSectionsWithViews.map(({ s, view }) => (
                <MarketSection
                  key={s.market.key}
                  section={s}
                  view={view}
                  events={compoundEvents.filter((e) => e.context.data.market === s.market.key)}
                  timeline={timeline}
                  timelineState={timelineState}
                  sweptClean={sweptClean}
                  captureSource={captureSource}
                />
              ))}
            </div>
          )}

          <ProvInspectorLayer />
        </div>
      </CometDeploymentProvider>
    </CaptureSourceProvider>
  );
}
