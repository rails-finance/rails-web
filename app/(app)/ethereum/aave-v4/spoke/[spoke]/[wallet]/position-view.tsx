"use client";

// Aave V4 spoke detail — the addressable per-spoke deep view for a wallet.
// The spoke is the unit of risk isolation (one shared health factor inside,
// fully independent between spokes), so it's the right URL-addressable unit
// for "this position." The wallet's other spokes live on the listing-filtered
// view at /aave-v4?q=… — that page is the spoke chooser.
//
// Ported almost verbatim from the now-removed /aave-v4/[wallet] page; the
// only structural change is that the spoke comes from the URL instead of
// `useAaveV4UiState`'s selectedSpoke. The SpokeCardSelector becomes a
// single-card breadcrumb and the auto-select effect is gone.
//
// Health factor, liq price, and borrowing power are computed client-side via
// lib/aave-v4/spoke-cards.ts → calculateAaveV4Position over the thresholds the
// spoke reports. Net interest carry comes from chain-state balances vs. indexed
// deposits (computeAaveV4InterestPnl). Every current-state USD figure — the
// calculation's inputs, interest carry, runway, tower "today" totals and price strip —
// is valued at Aave's own on-chain oracle price (chainTruthPrices, oracle-first
// with a DefiLlama fallback only for assets the oracle registry omits), so the
// live position reads chain-true throughout, not just the headline totals.

import { useEffect, useMemo, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import Link from "next/link";
import { fetchAaveV4Timeline, fetchAaveV4Positions, type AaveV4Position } from "@/lib/api/fetch-aave-v4";
import {
  fetchAaveV4SpokePosition,
  parseRiskPremiumFraction,
  type AaveV4SpokePositionChainResponse,
} from "@/lib/api/fetch-aave-v4-spoke-position";
import { patchReservesWithChain, patchSpokeCardWithChain } from "@/lib/aave-v4/apply-chain-truth";

import { SPOKE_NAME_TO_KEY } from "@/lib/aave-v4/spoke-meta";
import { aaveV4LiveEarlierBlocks, aaveV4PriceGapNotesFor, liveAaveV4PriceGapNotes } from "@/lib/aave-v4/market-notes";
import { listingHrefForWallet } from "@/lib/shared/protocols";

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV4Event } from "@/lib/shared/types/event-shape";
import { AaveV4EventCard } from "@/components/protocol/aave-v4/aave-v4-event-card";
import type { AaveV4TxGroup } from "@/components/protocol/aave-v4/aave-v4-event-header";
import type { AaveV4Event } from "@/lib/aave-v4/explainer-clauses";
import { AaveV4SpokeCardSelector } from "@/components/protocol/aave-v4/aave-v4-spoke-card";
import { AaveV4RiskSlot } from "@/components/protocol/aave-v4/aave-v4-risk-slot";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { aaveV4EconomicsContent } from "@/lib/shared/learn-more-content";
import { computeAaveLifetimeTotals } from "@/lib/aave-v4/lifetime-totals";
// Lazy chunks: the tower chart (below the fold, ~700 lines of legend/anatomy)
// and the export path (interaction-only dropdown + serializers) load as their
// own chunks off the initial bundle. A mount-time prefetch (below) has both
// cached well before the data fetch resolves and they first render.
const AaveV4TowerChart = dynamic(
  () => import("@/components/protocol/aave-v4/aave-v4-tower-chart").then((m) => m.AaveV4TowerChart),
  { loading: () => null },
);
const AaveV4ExportMenu = dynamic(
  () => import("@/components/protocol/aave-v4/aave-v4-export-menu").then((m) => m.AaveV4ExportMenu),
  { loading: () => null },
);
import {
  buildAaveV4SpokeCards,
  buildSpokeCards,
  groupBySpoke,
  computeAaveV4InterestPnl,
  resolveFallbackCollateral,
} from "@/lib/aave-v4/spoke-cards";
import { AAVE_V4_FALLBACK_LT, isDollarRail } from "@/lib/aave-v4/liquidation-thresholds";
import { calculateAaveV4Position, type CalcPositionInputs } from "@/lib/aave-v4/utils/position-calculation";
import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { fmtUsd } from "@/lib/aave-v4/format";
import { PriceStrip, type PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { summariseExternalActors } from "@/lib/shared/external-actor";
import type { ReserveStats } from "@/lib/aave-v4/spoke-cards";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { AAVE_V4_DISPLAY_ITEMS } from "@/lib/aave-v4/timeline-display-items";
import { AAVE_V4_TIMELINE_RUNS } from "@/lib/aave-v4/timeline-runs";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { DetailBackButton, DetailTopRow } from "@/components/shared/detail-back-row";
import { OVERLAY_HEADING, NAV_LINK, PILL_META } from "@/lib/shared/ui-grammar";
import { shortAddr } from "@/lib/shared/format-event";
import { useWalletContext } from "@/components/nav/wallet-context";
import { useAaveV4UiState } from "@/hooks/useAaveV4UiState";
import { PricesProvider, usePrices, useRequestPrices } from "@/lib/shared/prices-context";
import { useAaveV4OraclePrices, type OraclePriceMap } from "@/lib/aave-v4/use-oracle-prices";
import { listSymbols } from "@/lib/aave-v4/unpriced";
import { computeOnchainUsd } from "@/lib/aave-v4/onchain-usd";
import { AaveV4BarsProvider } from "@/lib/aave-v4/use-position-bars";
import { TOKEN_ADDR } from "@/lib/aave/prices";

export interface AaveV4SpokeViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** The spoke's resolved DISPLAY name. The route does that resolution now. */
  spokeName: string;
  /** The RAW URL segment, kept because two identities key off it and would
   *  change meaning if they keyed off the display name instead: the timeline's
   *  saved-filter storageKey (rewriting it silently resets every reader's
   *  choice on these pages) and the CSV filename. */
  spokeSlug: string;
  /** The wallet's spoke positions, and the spoke's own state at head, both read
   *  on the server. The face figures merge the two, so they seed together or
   *  not at all. `chain` may be null on its own: the page then stands on the
   *  indexed figures and says so. */
  initialPositions: AaveV4Position[] | null;
  initialChain: AaveV4SpokePositionChainResponse | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a wallet with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  /** Address→USD, read on the server beside the tail. Seeds PricesProvider so
   *  the card's collateral / supplied figure renders into the HTML rather than
   *  as a skeleton the client fills after hydration. Empty when the read
   *  failed — the provider then fetches on mount as it always did. */
  initialPrices?: Record<string, number>;
}

export default function AaveV4SpokeView(props: AaveV4SpokeViewProps) {
  return (
    <PricesProvider initialPrices={props.initialPrices}>
      <AaveV4SpokePageInner {...props} />
    </PricesProvider>
  );
}

function AaveV4SpokePageInner({
  wallet,
  spokeName,
  spokeSlug: rawSpoke,
  initialPositions,
  initialChain,
  initialEvents,
}: AaveV4SpokeViewProps) {
  const isValidWallet = /^0x[a-f0-9]{40}$/.test(wallet);
  // The listing filtered to this wallet — formed in one place (the wallet param
  // is `q`, read centrally by the shared listing driver). Feeds the "other
  // spokes" link; the back button derives the same href internally.
  const walletFilterHref = listingHrefForWallet("aave-v4", wallet) ?? "/ethereum/aave-v4";

  // Keyed on the timeline, not the roster: a wallet with no position in this
  // spoke is a real answer the server can seed, and `initialPositions` is empty.
  const seeded = initialEvents != null;
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  const [positions, setPositions] = useState<AaveV4Position[]>(initialPositions ?? []);
  const [chainPosition, setChainPosition] = useState<AaveV4SpokePositionChainResponse | null>(initialChain);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);

  // hasHydrated only — the timeline's own filter/sort/date/heatmap state now
  // lives in useTimelineEvents (below), keyed per spoke. This hook's flag
  // still gates the exposure cluster + tower panel so they don't flash before
  // client-side UI state settles.
  const { hasHydrated: hasUiHydrated } = useAaveV4UiState(isValidWallet ? wallet : undefined);

  // Every <Prov> figure inside the position panel (card stats, footnotes,
  // explanation bullets) reports into this registry, which the page-level
  // inspector reads.
  const positionRegistry = useReceiptRegistry();

  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!isValidWallet) return;
    setWallets([wallet], { [wallet]: null });
  }, [wallet, isValidWallet, setWallets]);

  // Warm the lazy chunks while the data fetch is in flight, so the toolbar and
  // economics panel paint whole when the loading gate clears (no pop-in).
  useEffect(() => {
    void import("@/components/protocol/aave-v4/aave-v4-tower-chart");
    void import("@/components/protocol/aave-v4/aave-v4-export-menu");
  }, []);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded) return;
    if (!isValidWallet) {
      setError("Invalid wallet address");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const spokeKey = SPOKE_NAME_TO_KEY[spokeName];
        const [timeline, posResult, chainResult] = await Promise.all([
          // The index serves every spoke's history; the page filters to this
          // one. { events } shape.
          fetchAaveV4Timeline({ wallet }),
          // Positions seed price requests.
          fetchAaveV4Positions({ wallet }),
          // Headline chain-state overlay — already a live spoke-contract read in
          // both modes. Best-effort: when the URL spoke name doesn't map to a
          // known server key, skip it and fall back to event-derived numbers
          // (the "no activity on this spoke" path below will catch it).
          spokeKey
            ? fetchAaveV4SpokePosition({ wallet, spoke: spokeKey }).catch((err) => {
                console.warn("Chain-state fetch failed; falling back to indexed", err);
                return null;
              })
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setEvents(timeline.events);
        setPositions(posResult.positions);
        setChainPosition(chainResult);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load spoke data");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, isValidWallet, spokeName, seeded]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp),
    [events],
  );

  const prices = usePrices();
  const oraclePrices = useAaveV4OraclePrices();
  // Oracle-first price map: Aave's own on-chain oracle price (chain-state — the
  // same Chainlink feeds its risk engine reads) overrides the DefiLlama price
  // per reserve, keyed by address; DefiLlama stays the fallback for any asset
  // the oracle registry doesn't cover. Threaded into every CURRENT-STATE
  // valuation (liq price, borrowing power, interest carry, runway, tower "today"
  // figures, price strip) so the whole live position reads chain-true, not just
  // the headline totals. Until the oracle map loads it IS `prices`, so first
  // paint is unchanged and the figures refine to oracle when it arrives. The
  // event-derived history/peak seed (groupBySpoke / buildAaveV4SpokeCards) keeps
  // the plain `prices` map — those are historic aggregates, overridden for
  // current state by patchSpokeCardWithChain below.
  const chainTruthPrices = useMemo<Record<string, PriceEntry | number>>(() => {
    if (!oraclePrices) return prices;
    const merged: Record<string, PriceEntry | number> = { ...prices };
    for (const [addr, p] of Object.entries(oraclePrices)) {
      merged[addr.toLowerCase()] = p.usd;
    }
    return merged;
  }, [prices, oraclePrices]);
  const spokeGroups = useMemo(() => groupBySpoke(sortedEvents, undefined, prices), [sortedEvents, prices]);
  const spokeCards = useMemo(() => buildAaveV4SpokeCards(sortedEvents, undefined, prices), [sortedEvents, prices]);
  // The one card we render (single-spoke breadcrumb). If the URL spoke doesn't
  // exist for this wallet we fall back to "no activity on this spoke" below.
  // When chain-state data is available it overrides the event-derived headline
  // numbers (HF, total supply/debt USD, liq prices, per-asset balances).
  // History fields (peak debt, debt series, event count) stay event-derived.
  const eventActiveCard = useMemo(() => spokeCards.find((c) => c.name === spokeName), [spokeCards, spokeName]);
  const eventActiveGroup = useMemo(() => spokeGroups.find((g) => g.name === spokeName), [spokeGroups, spokeName]);
  const activeCard = useMemo(() => {
    if (!eventActiveCard) return undefined;
    if (!chainPosition || chainPosition.chainStale) {
      // No live chain read (skipped/failed fetch or stale RPC overlay). Re-derive
      // the headline numbers from event data, but resolve un-toggled supplies
      // to NON-collateral first so HF / borrowing-power / liq-price don't credit
      // collateral we can't confirm. See resolveFallbackCollateral.
      if (!eventActiveGroup) return eventActiveCard;
      const hardenedGroup = {
        ...eventActiveGroup,
        result: {
          ...eventActiveGroup.result,
          reserves: resolveFallbackCollateral(eventActiveGroup.result.reserves),
        },
      };
      return buildSpokeCards([hardenedGroup], prices)[0] ?? eventActiveCard;
    }
    const patched = patchSpokeCardWithChain(eventActiveCard, chainPosition, chainTruthPrices);
    // Interest carry needs both legs together: chain-state current balances and
    // event-derived principal. Patched reserves carry both, so compute here and
    // hang it off the card for the headline footnote + explanation band.
    const patchedReserves = eventActiveGroup
      ? patchReservesWithChain(eventActiveGroup.result.reserves, chainPosition)
      : [];
    return {
      ...patched,
      interestPnl: computeAaveV4InterestPnl(patchedReserves, chainTruthPrices),
      // On-chain-oracle valuation of the headline totals, from the same chain
      // balances at Aave's own oracle price — lets On-chain-values show these
      // as chain-derived instead of middotting the DefiLlama figure.
      onchainUsd: computeOnchainUsd(chainPosition, oraclePrices),
    };
  }, [eventActiveCard, eventActiveGroup, chainPosition, prices, chainTruthPrices, oraclePrices]);
  const activeGroup = useMemo(() => {
    if (!eventActiveGroup) return undefined;
    if (!chainPosition || chainPosition.chainStale) {
      // Same fallback as activeCard: resolve un-toggled supplies to
      // non-collateral so the economics band (tower, exposure, runway) reads
      // collateral consistently with the hardened headline card.
      return {
        ...eventActiveGroup,
        result: {
          ...eventActiveGroup.result,
          reserves: resolveFallbackCollateral(eventActiveGroup.result.reserves),
        },
      };
    }
    return {
      ...eventActiveGroup,
      result: {
        ...eventActiveGroup.result,
        reserves: patchReservesWithChain(eventActiveGroup.result.reserves, chainPosition),
      },
    };
  }, [eventActiveGroup, chainPosition]);

  // Assets relevant to the position in view — the union of what this spoke is
  // currently supplying and borrowing — for the fixed bottom price strip. Only
  // priced symbols make the cut (resolvePrice → null for unknowns).
  const stripAssets = useMemo<PriceStripAsset[]>(() => {
    if (!activeCard) return [];
    const symbols = [...new Set([...activeCard.supplyingSymbols, ...activeCard.borrowingSymbols])];
    return symbols.flatMap((symbol) => {
      const price = resolvePrice(symbol, chainTruthPrices);
      return price != null ? [{ symbol, address: TOKEN_ADDR[symbol], price }] : [];
    });
  }, [activeCard, chainTruthPrices]);

  const spokeScopedEvents = useMemo(() => {
    return sortedEvents.filter((e) => {
      if (!isAaveV4Event(e)) return false;
      return (e.context.data.spokeName ?? "Main") === spokeName;
    });
  }, [sortedEvents, spokeName]);

  // Who executed this spoke position's events — the SAME externalActor()
  // verdict each event card renders on its spine, reduced over the spoke's
  // whole loaded history so the Explanation can state it once. Judged against
  // the row's OWN owner (ctx.owner, the spoke event's `user` param), not the
  // queried wallet: the timeline can include rows where this wallet was the
  // caller on someone else's position. Derived from the events already on the
  // page; no new field on the position response.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        spokeScopedEvents.flatMap((e) =>
          isAaveV4Event(e)
            ? [
                {
                  txFrom: e.context.data.txFrom,
                  poolCaller: e.context.data.caller,
                  wallet: e.context.data.owner ?? e.wallet,
                },
              ]
            : [],
        ),
      ),
    [spokeScopedEvents],
  );

  // Composite-tx grouping: when several spoke events share a txHash, each gets
  // { index, count } so the header can render "1 OF 2", "2 OF 2". Built from
  // spokeScopedEvents (chronological asc) — independent of the timeline's own
  // filter/sort state, since a same-tx group must stay stable under either.
  // (Chronological event numbering itself now comes from ChainTruthTimeline's
  // renderCard meta, via tl.eventNumberOf.)
  const { txGroups, txSiblings } = useMemo(() => {
    const counts = new Map<string, number>();
    // Same-tx grouping (chronological asc) — the counts drive the "X OF Y" chip
    // and the group arrays feed the explainer's combined-act / cross-reference
    // seam. spokeScopedEvents is already filtered to Aave V4 events.
    const byTx = new Map<string, AaveV4Event[]>();
    for (const e of spokeScopedEvents) {
      const tx = e.txHash ?? "";
      if (tx) counts.set(tx, (counts.get(tx) ?? 0) + 1);
      const arr = byTx.get(tx);
      if (arr) arr.push(e as AaveV4Event);
      else byTx.set(tx, [e as AaveV4Event]);
    }
    const txGroups = new Map<string, AaveV4TxGroup>();
    const seen = new Map<string, number>();
    spokeScopedEvents.forEach((e) => {
      const tx = e.txHash ?? "";
      const total = tx ? (counts.get(tx) ?? 1) : 1;
      if (total > 1) {
        const next = (seen.get(tx) ?? 0) + 1;
        seen.set(tx, next);
        txGroups.set(e.id, { index: next, count: total });
      }
    });
    return { txGroups, txSiblings: byTx };
  }, [spokeScopedEvents]);

  // The shared timeline pipeline: type/date filtering, sort direction, render
  // windowing and the months heatmap all live here + in ChainTruthTimeline.
  // Keyed per spoke (not just per wallet) since each spoke is its own
  // position with its own filter/sort preference.
  const tl = useTimelineEvents(spokeScopedEvents, {
    storageKey: `aave-v4-${rawSpoke}-${wallet}`,
    protocolKey: "aave-v4",
  });

  // ── Market notes ─────────────────────────────────────────────────────────
  // Receipted facts about the MARKET between two of this position's own rows.
  // Never events: they enter no total, no filter count and no export table
  // (lib/shared/market-note.ts).

  // The spoke as the selector needs it: its key (the note id's namespace), its
  // display name (the row's own discriminant), and — from the chain overlay —
  // each reserve's liquidation threshold and underlying address. Without an
  // overlay both maps are empty and the selector still runs: a
  // liquidation-ended, price-only note needs neither.
  const noteMarket = useMemo(() => {
    const lts: Record<string, number> = {};
    const addresses: Record<string, string> = {};
    for (const r of chainPosition?.reserves ?? []) {
      if (r.lt != null && r.lt > 0) lts[r.symbol] = r.lt;
      if (r.address) addresses[r.symbol] = r.address.toLowerCase();
    }
    return { spokeKey: SPOKE_NAME_TO_KEY[spokeName] ?? rawSpoke, spokeName, lts, addresses };
  }, [chainPosition, spokeName, rawSpoke]);

  // Built off the UNFILTERED spoke-scoped list, never the filtered one: a note
  // is a fact about the market between two rows, and hiding a row type must not
  // change which prices bracket it. The timeline anchors what it can against
  // whatever is actually displayed, and drops the rest.
  const notes = useMemo(
    () => aaveV4PriceGapNotesFor(spokeScopedEvents, noteMarket).sort((a, b) => a.to.block - b.to.block),
    [spokeScopedEvents, noteMarket],
  );

  // The collateral the spoke shows this position holding right now — one live
  // note each, and the input the earlier rows are picked from.
  const heldCollateral = useMemo(
    () =>
      (chainPosition?.reserves ?? [])
        .filter((r) => r.isCollateral && Number(r.supplyBalanceRaw) > 0)
        .map((r) => r.symbol),
    [chainPosition],
  );
  const hasLiveDebt = !!chainPosition && !chainPosition.chainStale && chainPosition.debtAssetCount > 0;

  // The live note's own reads, fetched together and independently of the price
  // map the rest of the page uses (that one drops the block the map answered
  // at, which is the live note's later end):
  //
  //   the LATER end — /api/oracle/aave-v4 at head, dated against /api/head;
  //   the EARLIER end — /api/oracle/aave-v4?block=B, the same registry pinned
  //   to the block of each row a live note runs from (one block for the whole
  //   position, in practice; two where a collateral was last held on an older
  //   row). Immutable, so the response is cached for a year.
  //
  // The earlier end is a chain read rather than the price the row states,
  // because a row's stated price comes from the historic-price lane, and a lane
  // whose live writer covers eight of the registry's feeds served May's price
  // on a September row. Best-effort — a failed read leaves the live note absent
  // and the pending slot with it.
  const earlierBlocks = useMemo(
    () => (hasLiveDebt ? aaveV4LiveEarlierBlocks(spokeScopedEvents, noteMarket, heldCollateral) : []),
    [hasLiveDebt, spokeScopedEvents, noteMarket, heldCollateral],
  );
  const [liveOracle, setLiveOracle] = useState<{
    prices: Record<string, number>;
    block: number;
    timestamp?: number;
    earlier: Record<number, Record<string, number>>;
  } | null>(null);
  const [liveOraclePending, setLiveOraclePending] = useState(true);
  useEffect(() => {
    if (loading || !hasLiveDebt || earlierBlocks.length === 0) {
      setLiveOraclePending(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [oracleRes, headRes, ...pinnedRes] = await Promise.all([
          fetch("/api/oracle/aave-v4"),
          fetch("/api/head"),
          ...earlierBlocks.map((b) => fetch(`/api/oracle/aave-v4?block=${b}`)),
        ]);
        type OracleAnswer = {
          success?: boolean;
          prices?: Record<string, { usd: number; symbol: string }>;
          blockNumber?: number;
        };
        const oracle = oracleRes.ok ? ((await oracleRes.json()) as OracleAnswer) : null;
        const head = headRes.ok ? ((await headRes.json()) as { blockNumber: number; blockTimestamp: number }) : null;
        const pinnedAnswers = await Promise.all(
          pinnedRes.map(async (r) => (r.ok ? ((await r.json()) as OracleAnswer) : null)),
        );
        if (cancelled || !oracle?.prices || !(oracle.blockNumber != null && oracle.blockNumber > 0)) return;
        // Address first, the map entry's own symbol second: the overlay names
        // the reserve by address, and two spokes can list the same symbol.
        const bySymbol = (map: Record<string, { usd: number; symbol: string }>): Record<string, number> => {
          const out: Record<string, number> = {};
          for (const r of chainPosition?.reserves ?? []) {
            const direct = r.address ? map[r.address.toLowerCase()] : undefined;
            const entry = direct ?? Object.values(map).find((p) => p.symbol === r.symbol);
            if (entry && entry.usd > 0) out[r.symbol] = entry.usd;
          }
          return out;
        };
        const earlier: Record<number, Record<string, number>> = {};
        earlierBlocks.forEach((b, i) => {
          const answer = pinnedAnswers[i];
          if (answer?.prices && answer.blockNumber === b) earlier[b] = bySymbol(answer.prices);
        });
        setLiveOracle({
          prices: bySymbol(oracle.prices),
          block: oracle.blockNumber,
          timestamp: head?.blockTimestamp,
          earlier,
        });
      } catch (err) {
        console.error("Failed to fetch the live oracle read:", err);
      } finally {
        if (!cancelled) setLiveOraclePending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, hasLiveDebt, chainPosition, earlierBlocks]);

  // One live note per collateral asset the spoke shows this position holding
  // right now, while it carries debt.
  const liveNotes = useMemo(() => {
    if (!hasLiveDebt || !liveOracle) return [];
    return liveAaveV4PriceGapNotes(spokeScopedEvents, noteMarket, { ...liveOracle, heldCollateral });
  }, [hasLiveDebt, liveOracle, heldCollateral, spokeScopedEvents, noteMarket]);

  const reserveAddresses = useMemo(() => {
    const out = new Set<string>();
    for (const p of positions) {
      if (p.reserveAddress) out.add(p.reserveAddress.toLowerCase());
      const fromSymbol = TOKEN_ADDR[p.reserveSymbol];
      if (fromSymbol) out.add(fromSymbol);
    }
    for (const e of sortedEvents) {
      if (!isAaveV4Event(e)) continue;
      const ctx = e.context.data;
      const symbols = [
        ctx.reserveSymbol,
        ctx.collateralSymbol,
        ...(ctx.allSupplies?.map((s) => s.symbol) ?? []),
        ...(ctx.allDebts?.map((d) => d.symbol) ?? []),
      ];
      for (const s of symbols) {
        if (!s) continue;
        const addr = TOKEN_ADDR[s];
        if (addr) out.add(addr);
      }
    }
    // Chain reserves win for the position card; make sure their prices are
    // requested even if the indexer hasn't seen the asset yet.
    if (chainPosition) {
      for (const r of chainPosition.reserves) {
        if (r.address) out.add(r.address.toLowerCase());
      }
    }
    return [...out];
  }, [positions, sortedEvents, chainPosition]);

  useRequestPrices(reserveAddresses);

  if (loading) {
    // Real back button (so the nav chrome doesn't pop in) above the shared
    // detail skeleton — position card, economics panel, and timeline spine in
    // their real shapes, so the content lands without a layout jump.
    return (
      <div className="space-y-6 py-8">
        <DetailBackButton session="aave-v4" wallet={wallet} />
        <DetailBodySkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const positionClosed = activeCard?.isClosed ?? false;

  // If the URL points at a spoke that doesn't exist for this wallet (typo,
  // stale link), bail with a path back to the wallet's other spokes.
  if (!activeCard && !loading) {
    return (
      <>
        <div className="py-8 space-y-6">
          <DetailBackButton session="aave-v4" wallet={wallet} />
          <div className="text-center py-12">
            <p className="text-foreground text-lg mb-3">
              {shortAddr(wallet)} has no activity on the {spokeName} spoke
            </p>
            <p className="text-sm text-rb-500">
              <Link href={walletFilterHref} className={`underline ${NAV_LINK}`}>
                See this wallet&rsquo;s other spokes →
              </Link>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="py-8 space-y-6">
        <DetailTopRow session="aave-v4" wallet={wallet}>
          {activeCard && (
            <AaveV4ExportMenu
              spokeName={spokeName}
              wallet={wallet}
              card={activeCard}
              reserves={activeGroup?.result.reserves ?? []}
              prices={chainTruthPrices}
              events={spokeScopedEvents}
              notes={notes}
              liveNotes={liveNotes}
              csvFilename={`aave-v4-${rawSpoke}-${wallet.slice(0, 10)}-activity.csv`}
            />
          )}
        </DetailTopRow>

        {/* Position card in its own rounded panel — owner address sits in its
            top row, and the info area at its bottom-left holds the Explanation
            heading-button, with the risk slot riding that row
            (the V2 trove treatment — the preferred pattern; the full-width
            runway block retired): the label-led collateral-exposure cluster
            beside the compact "% from liquidation" runway, one wrapping line
            (detail-page-anatomy §2). The "% from liquidation" figure carries
            the glance message; the liquidation price itself lives on as the HF
            stat's "Liquidates at" caption. One receipts scope wraps the whole
            panel, so every traced figure — headline stats, footnotes,
            explanation bullets — lists in the card's Provenance section. */}
        {activeCard && (
          <ProvReceiptsScope registry={positionRegistry}>
            <div className="rounded-2xl bg-raised">
              <AaveV4SpokeCardSelector
                spokes={[activeCard]}
                selected={spokeName}
                onSelect={() => {}}
                wallet={wallet}
                externalActivity={externalActivity}
                rowExtra={
                  activeCard.totalDebtUsd > 0 && activeCard.healthFactor != null ? (
                    <AaveV4RiskSlot
                      spoke={activeCard}
                      // The exposure cluster waits for the event group + UI
                      // hydration (the gate the retired footnote used), so it
                      // doesn't flash before the chain overlay lands; the
                      // runway renders on the spoke alone.
                      reserves={activeGroup && hasUiHydrated ? activeGroup.result.reserves : null}
                      prices={chainTruthPrices}
                    />
                  ) : undefined
                }
              />
              <RiskPremiumNotice raw={chainPosition?.riskPremiumRaw ?? null} spokeName={spokeName} />
            </div>
          </ProvReceiptsScope>
        )}

        {/* Lifetime-flow towers sit directly above the timeline — the towers are
            the aggregate of the same flows the event list itemizes below. */}
        {activeGroup && hasUiHydrated ? (
          <AaveV4SpokeTowerBlock
            reserves={activeGroup.result.reserves}
            prices={chainTruthPrices}
            oraclePrices={oraclePrices}
            gasEth={activeGroup.result.totalGasCostEth}
            gasUsd={activeGroup.result.totalGasCostUsd}
          />
        ) : null}

        {/* AaveV4BarsProvider sits OUTSIDE ChainTruthTimeline (which mounts its
            own TimelineDisplayProvider) — the change/balance bars derive from
            the full spoke-scoped event set, not the filtered/windowed slice
            the timeline currently renders. */}
        <AaveV4BarsProvider events={spokeScopedEvents}>
          <ChainTruthTimeline
            // Matches `AaveV4EventCard`'s own `persistKey={`aave-v4:${event.id}`}`
            // — lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="aave-v4"
            closed={positionClosed}
            tl={tl}
            notes={notes}
            liveNotes={liveNotes}
            liveNotesPending={hasLiveDebt && liveOraclePending}
            runs={AAVE_V4_TIMELINE_RUNS}
            displayItems={AAVE_V4_DISPLAY_ITEMS}
            emptyLabel={`No activity on the ${spokeName} spoke for this wallet.`}
            toolbarLeading={
              spokeScopedEvents.length > 0 ? (
                <TimelineActivityHeader events={spokeScopedEvents} closed={positionClosed} />
              ) : (
                <h2 className="text-sm font-semibold text-foreground">Activity</h2>
              )
            }
            renderCard={(event, meta) =>
              isAaveV4Event(event) ? (
                <AaveV4EventCard
                  event={event}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                  txGroup={txGroups.get(event.id)}
                  siblings={txSiblings.get(event.txHash ?? "")}
                  eventNumber={meta.eventNumber}
                />
              ) : null
            }
          />
        </AaveV4BarsProvider>
      </div>
      <PriceStrip assets={stripAssets} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}

// ── Risk-premium notice ──────────────────────────────────────────────────────
// V4 prices risk per position: a collateral mix the DAO deems riskier accrues a
// premium on top of the hub's base borrow rate (see the spoke-meta rateNote).
// Premiums are zeroed protocol-wide for now and turned on gradually, so this
// renders NOTHING until a position actually carries one — at which point it
// surfaces the captured chain value. Neutral styling only: per house rule we
// never color-code cost/risk, so the number carries the meaning, not a hue.
//
// NOTE: the displayed magnitude depends on parseRiskPremiumFraction's wad
// assumption, which is best-evidence not contract-confirmed (it's 0 everywhere
// today). Verify against Aave Pro the first time a non-zero premium appears.
function RiskPremiumNotice({ raw, spokeName }: { raw: string | null; spokeName: string }) {
  const frac = parseRiskPremiumFraction(raw);
  if (!frac) return null;
  return (
    <div className="px-4 md:px-6 pb-4 -mt-1">
      <span className={PILL_META}>Risk premium {(frac * 100).toFixed(2)}%</span>
      <p className="mt-1.5 text-xs text-rb-500 max-w-prose">
        Aave V4 prices risk per position. The collateral held here carries a risk premium that increases the borrow
        interest accruing on top of the {spokeName} hub&rsquo;s base rate.
      </p>
    </div>
  );
}

// ── Lifetime-flow towers (history) ───────────────────────────────────────────
// Sits directly above the event timeline: the towers are the aggregate of the
// same lifetime flows the timeline itemizes (every supply, withdrawal, borrow
// and repayment), so the two read as summary-then-detail.
function AaveV4SpokeTowerBlock({
  reserves,
  prices,
  oraclePrices,
  gasEth,
  gasUsd,
}: {
  reserves: ReserveStats[];
  prices: Record<string, PriceEntry | number>;
  /** The oracle map behind `prices` — passed on so each priced row's receipt
   *  can name the feed that answered for that asset. */
  oraclePrices: OraclePriceMap | null;
  gasEth: number;
  gasUsd: number;
}) {
  // Every <Prov> figure in the panel (the tower breakdown rows) reports into
  // this registry, which the page-level inspector reads.
  const registry = useReceiptRegistry();

  // A calculated leg is priced by construction — every figure it feeds (the
  // surplus split here, borrowing power, liquidation price) is a USD weighing.
  // An asset with no price source can't be weighed, so it stays out of the
  // calculation rather than entering it at a dollar a unit (RULE: Rails never invents a
  // price — lib/aave-v4/unpriced.ts). The tower's breakdown names it instead.
  const calcBase: CalcPositionInputs = useMemo(
    () => ({
      supplies: reserves
        .map((r) => {
          const netSupply = r.currentSupplied ?? Math.max(0, r.supplied - r.withdrawn - r.liquidatedCollateral);
          if (netSupply <= 0.0001) return null;
          const price = resolvePrice(r.symbol, prices);
          if (price == null) return null;
          // Chain-state LT from the chain-patched reserve; conservative fallback
          // only when no on-chain read was applied (see liquidation-thresholds).
          const lt = r.lt ?? AAVE_V4_FALLBACK_LT;
          const collateralEnabled = r.collateralEnabled ?? true;
          return { symbol: r.symbol, amount: netSupply, price, lt, collateralEnabled };
        })
        .filter(Boolean) as CalcPositionInputs["supplies"],
      debts: reserves
        .map((r) => {
          const netDebt = r.currentBorrowed ?? Math.max(0, r.borrowed - r.repaid - r.liquidatedDebt);
          if (netDebt <= 0.0001) return null;
          const price = resolvePrice(r.symbol, prices);
          if (price == null) return null;
          return { symbol: r.symbol, amount: netDebt, price };
        })
        .filter(Boolean) as CalcPositionInputs["debts"],
    }),
    [reserves, prices],
  );

  const [surplusSymbols, hideSurplus, setHideSurplus] = useSurplusState(calcBase);

  // Lifetime totals that mirror the tower legend, narrated in the footnote.
  const totals = useMemo(() => computeAaveLifetimeTotals(reserves, prices), [reserves, prices]);
  // Figures mirrored in the breakdown legend render foreground-bold; the rest of
  // the prose stays muted (same grammar as the Liquity economics footnote).
  const fig = (n: number) => <span className="font-semibold text-foreground tabular-nums">{fmtUsd(n).title}</span>;

  return (
    <ProvReceiptsScope registry={registry}>
      {/* Padding matches the position card's px-5 py-4 (the V2 trove
          compaction), so the stacked panels read as one family. The section
          title rides the chart's toolbar row instead of a row of its own. */}
      <div className="rounded-2xl bg-raised px-5 py-4">
        <div className="space-y-3">
          <AaveV4TowerChart
            reserves={reserves}
            prices={prices}
            oraclePrices={oraclePrices}
            surplusSymbols={surplusSymbols}
            hideSurplus={hideSurplus}
            onToggleHideSurplus={() => setHideSurplus((v) => !v)}
            title={<span className={`${OVERLAY_HEADING} text-rb-500`}>Lifetime flows</span>}
          />

          {/* The panel's info area: (i) Explanation — the tower legend narrated
              with its figures — beside route-icon Provenance, the receipts list
              for the breakdown figures. */}
          <ProvenanceInfoTabs
            explanation={
              <div className="space-y-2 text-sm text-rb-500">
                {/* Value-bearing narration of the tower legend — a one-line lead
              (charter §4: a status lead over the enumeration), then figures
              that mirror the breakdown rows render foreground-bold (the same
              grammar the Liquity economics footnote uses). Two bullets: the
              collateral story, then the debt story when this position ever
              held debt. */}
                <p className="leading-relaxed">
                  These figures total the position&apos;s lifetime flows across every event on this spoke.
                  {totals.unpricedSymbols.length > 0 && (
                    <>
                      {" "}
                      They are partial: no price source covers {listSymbols(totals.unpricedSymbols)}, so that balance
                      shows in its asset&apos;s units in the breakdown and is in none of the dollar figures here.
                    </>
                  )}
                </p>
                <div className="flex items-start gap-2 leading-relaxed">
                  <span className="select-none text-rb-500">•</span>
                  <span>
                    {fig(totals.depositedUsd)} of collateral has moved through this position over its life
                    {totals.withdrawnUsd > 0.01 && <> — {fig(totals.withdrawnUsd)} withdrawn</>}
                    {totals.liquidatedCollUsd > 0.01 && (
                      <>
                        {totals.withdrawnUsd > 0.01 ? " and " : " — "}
                        {fig(totals.liquidatedCollUsd)} liquidated
                      </>
                    )}
                    , leaving {fig(totals.inProtocolUsd)} in protocol today.
                  </span>
                </div>
                {totals.hasDebtHistory && (
                  <div className="flex items-start gap-2 leading-relaxed">
                    <span className="select-none text-rb-500">•</span>
                    <span>
                      {fig(totals.borrowedUsd)} borrowed over the position&apos;s life
                      {totals.repaidUsd > 0.01 && <>, then {fig(totals.repaidUsd)} repaid</>}
                      {totals.liquidatedDebtUsd > 0.01 && (
                        <>
                          {totals.repaidUsd > 0.01 ? " and " : ", then "}
                          {fig(totals.liquidatedDebtUsd)} cleared by liquidation
                        </>
                      )}
                      , leaving {fig(totals.outstandingUsd)} owed today.
                    </span>
                  </div>
                )}
                {gasEth > 0 && (
                  <div className="flex items-start gap-2 leading-relaxed">
                    <span className="select-none text-rb-500">•</span>
                    <span>
                      A total of {gasEth.toFixed(4)} ETH (${gasUsd.toFixed(2)}) has been spent on gas fees across these
                      transactions — each event&apos;s own gas is in its footnote below.
                    </span>
                  </div>
                )}
                <LearnMore content={aaveV4EconomicsContent()} />
              </div>
            }
          />
        </div>
      </div>
    </ProvReceiptsScope>
  );
}

function useSurplusState(
  calcBase: CalcPositionInputs,
): [Set<string>, boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [hideSurplus, setHideSurplus] = useState(false);
  const surplusSymbols = useMemo(() => {
    const out = new Set<string>();
    if (calcBase.supplies.length > 0 && calcBase.debts.length > 0) {
      const axis = calculateAaveV4Position({ supplies: calcBase.supplies, debts: calcBase.debts });
      for (let i = 0; i < calcBase.supplies.length; i++) {
        // A collateral the rest of the basket already over-covers (liq price 0)
        // is surplus, unless it is a $1 rail — decided from its own oracle price
        // (isDollarRail), so sUSDe and EURC are weighed like any other asset.
        const supply = calcBase.supplies[i];
        if (axis.assetLiqPrices[i]?.liqPrice === 0 && !isDollarRail(supply.price)) {
          out.add(supply.symbol);
        }
      }
    }
    return out;
  }, [calcBase]);
  return [surplusSymbols, hideSurplus, setHideSurplus];
}
