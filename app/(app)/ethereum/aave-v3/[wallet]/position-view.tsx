"use client";

// Aave V3 position detail — reference depth, chain-state-first. Every value
// below is chain-direct or chain-derived: position state +
// timeline replayed from the captured Aave V3 Pool events, and the risk
// surfaces (health factor, runway, LTV, reserve rates, the position narration)
// read live from the market's Pool via /api/chain/aave-v3/position
// (getUserAccountData / getReserveData — the protocol's own oracle-priced
// account math). V3 is one cross-collateralised account per (wallet, market);
// the market arrives on ?market= from the listing link (each market is a
// separate Pool).
//
// This is the page's CLIENT HALF. Everything interactive lives here — the
// timeline filters, the stored UI state, the export menu, the live Pool read —
// while the page above it is a server component that has already fetched the
// tail. Being a client component does not mean rendering on the client: React
// renders this whole subtree to HTML on the server too. What made this page
// blank to a non-JS reader was not the "use client" line, it was fetching the
// data in an effect. Seeded or not, the mount path still works: on an SSR miss
// `initialPosition` is null and this component fetches the tail itself.
//
// The chain read rides its own effect + state so the first paint (card + tower +
// timeline from the index) never waits on RPC round-trips; the risk surfaces
// stream in when the read lands, and a chainStale response simply leaves them
// unrendered (the index-derived surfaces are already on screen).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { fetchAaveV3Positions, type AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import { fetchAaveV3Timeline } from "@/lib/api/fetch-aave-v3-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import {
  fetchAaveV3Position,
  fetchAaveV3OraclePrices,
  type AaveV3PositionChainResponse,
} from "@/lib/api/fetch-aave-v3-position";
import { MARKET_NAME, POOL_BY_MARKET, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { V3PoolProvider } from "@/lib/aave-v3/pool-context";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { AAVE_V3_FOLDER_REGISTER, AAVE_V3_TIMELINE_RUNS } from "@/lib/aave-v3/timeline-runs";
import { fetchAaveV3GroupedTimeline, type AaveV3GroupedTimelineResponse } from "@/lib/api/fetch-aave-v3-timeline";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import { interleaveRowPlan, servedFoldersEnabled } from "@/lib/shared/timeline-folder";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { AaveV3CtEventCard } from "@/components/protocol/aave-v3/aave-v3-ct-event-card";
import {
  AaveV3PositionCard,
  viewFromSummary,
  type AaveV3PositionView,
} from "@/components/protocol/aave-v3/aave-v3-position-card";
import {
  AaveV3PositionExplanation,
  AaveV3ClosedPositionExplanation,
} from "@/components/protocol/aave-v3/aave-v3-position-explanation";
import { AaveV3RiskSlot } from "@/components/protocol/aave-v3/aave-v3-risk-slot";
import {
  computeAaveV3Economics,
  computeAaveV3CardCaptions,
  unpricedAaveV3FlowAddresses,
  aaveV3LifetimeWithOpening,
} from "@/lib/aave-v3/chain-truth-tower";
import { aaveV3EconomicsExplanation, aaveV3EconomicsContent } from "@/lib/aave-v3/economics-explanation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { TimelineActivityHeader, CHAIN_TRUTH_USD_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { PriceStrip, type PriceStripAsset } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import {
  aaveFamilyHoldings,
  aaveFamilyRateRequests,
  aaveFamilyRateStepNotesFor,
  liveAaveFamilyRateStepNotes,
  stableRateReserves,
  type AaveFamilyNoteOptions,
} from "@/lib/aave-v3/market-notes";
import { aaveFamilyLiquidationPriceNotes } from "@/lib/aave-v3/liquidation-price-notes";
import { loadAaveFamilyReserveRates, type ReserveRateLookup } from "@/lib/api/fetch-aave-family-reserve-rates";
import type { MarketNote } from "@/lib/shared/market-note";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the V4 spoke page.
const AaveV3ExportMenu = dynamic(
  () => import("@/components/protocol/aave-v3/aave-v3-export-menu").then((m) => m.AaveV3ExportMenu),
  { ssr: false },
);

type AaveV3Event = BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };

interface AaveV3PositionDetailProps {
  wallet: string;
  /** Which Pool. Decoded from `?market=` on the server so the SSR'd document is
   *  the one the link asked for, not Core plus a post-hydration correction. */
  market: AaveV3MarketKey;
  /** The server read's tail. `initialPosition` null on an SSR miss — this
   *  component then fetches. A wallet the index has never seen is NOT a miss:
   *  it seeds with a null position and an empty history, which is the answer. */
  initialPosition: AaveV3PositionRow | null;
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
  /** The grouped answer WHOLE, when `?folders=1` asked for one — its row plan
   *  is what puts the folders back between the ungrouped events, and its
   *  folders carry the arithmetic the page's whole-history reductions read.
   *  Null on an ordinary load, where `initialEvents` IS the history. */
  initialGrouped: AaveV3GroupedTimelineResponse | null;
}

export default function AaveV3PositionDetail({
  wallet,
  market,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
  initialGrouped,
}: AaveV3PositionDetailProps) {
  // Keyed on the timeline, not the summary: a wallet with no position in this
  // market is a real answer the server can seed, and its `initialPosition` is
  // null. The loader returns a null `events` only when a read actually failed,
  // so this is the one flag that distinguishes "nothing to show" from "nothing
  // arrived".
  const seeded = initialEvents != null;
  const [view, setView] = useState<AaveV3PositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // ── The same history as ROWS, asked for on `?folders=1` ────────────────
  //
  // Decision 0019's evening amendment: repetitive stretches arrive as FOLDERS
  // carrying their members' aggregate, ungrouped events arrive as themselves,
  // and the cut counts rows. Aave V3's mainnet arm is one of the two families
  // the index can group, because the MV carries each event's own
  // `supply_before/after` and `debt_before/after` — so a folder standing in for
  // a hundred rows leaves nothing here to reconstruct. The BASE explorers share
  // this page's run specs but not this read: they are replay-served and group
  // client-side.
  //
  // ONE READ, NOT TWO. The grouped answer REPLACES the flat window rather than
  // arriving beside it: `events` below holds its ungrouped events, this holds
  // the row plan and the folders, and the two always move together — which is
  // what keeps two different partitions off one page. The page's whole-history
  // reductions then read all three contributors (summary, events, folders)
  // through `lib/shared/timeline-folder-reductions.ts`.
  const [groupedTail, setGroupedTail] = useState<AaveV3GroupedTimelineResponse | null>(initialGrouped);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — 837,290 of
  // the index's 838k — `cutoffBlock` comes back null, no second request is made
  // and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<AaveV3PositionChainResponse | null>(null);
  // Whether the live Pool read has ANSWERED, separate from whether it gave us
  // anything: a stale read leaves `chain` null, and the market notes have to
  // tell "still waiting" from "asked, and there is nothing".
  const [chainSettled, setChainSettled] = useState(false);
  // Standing display framing (risk view + ratio) — a global preference, so the
  // reader's choice on one position carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did. The ref keeps React's
  // development double-invoke from issuing the read twice.
  const startedTail = useRef(false);
  useEffect(() => {
    if (seeded || startedTail.current) return;
    startedTail.current = true;
    if (!wallet) return;
    (async () => {
      setLoading(true);
      try {
        // The SAME choice the server half made (`position-page-data.ts`), for
        // the SSR miss that lands here: ONE timeline read, in the shape the URL
        // asked for. Exactly one of the two below is ever made, and a grouped
        // answer seeds the row plan in the same breath as the events it
        // interleaves.
        const asked = servedFoldersEnabled();
        const [pData, flat, grouped] = await Promise.all([
          fetchAaveV3Positions({ wallet, market, limit: 1 }),
          asked ? null : fetchAaveV3Timeline({ wallet, market, recent: TIMELINE_WINDOW_EVENTS }),
          asked ? fetchAaveV3GroupedTimeline({ wallet, market }) : null,
        ]);
        const tData = grouped ?? flat;
        const summary = pData.rows[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData?.events ?? []);
        setCutoffBlock(tData?.cutoffBlock ?? null);
        setGroupedTail(grouped);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      path: "/api/aave-v3/timeline/summary",
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

  // The live Pool read (HF / LTV / rates) — off the critical path; a failure
  // returns chainStale and the risk surfaces stay unrendered.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAaveV3Position({ wallet, market });
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
      setChainSettled(false);
    };
  }, [wallet, market]);

  // Memoized: this feeds effect dependency arrays (the oracle-price merge
  // below) — a fresh array identity every render would cancel the in-flight
  // fetch whenever anything else (e.g. the chain read) re-rendered the page.
  const aaveEvents = useMemo(() => events.filter(isAaveV3Event), [events]);

  // The served list as ROWS. `aaveEvents` holds the grouped answer's own events
  // when one is in hand — the read above put them there — so the plan and the
  // events it interleaves always come from the same answer, and two partitions
  // can never meet on one page.
  const servedRows = useMemo(
    () => (groupedTail ? interleaveRowPlan(groupedTail.rowPlan, aaveEvents) : undefined),
    [groupedTail, aaveEvents],
  );
  /** The folders the index served, whole and UNFILTERED — the third contributor
   *  to the page's partition, and what every whole-history reduction below adds
   *  to `opening + events`. The page's type/asset filters narrow what is DRAWN,
   *  not what the position did, so they have no business here. (The activity
   *  map is the one reduction that follows the filters, and it gets its own
   *  `tl.folderDays` for exactly that reason.) */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  /** The oldest member any folder stands for. The tenure eyebrow takes the
   *  EARLIER of its `firstAt` and its own oldest row, so a page whose oldest
   *  row is a FOLDER still dates the position from inside it rather than from
   *  the oldest event that happened to arrive ungrouped. Below a cut the
   *  opening balance is older still and answers first. */
  const oldestFolderAt = useMemo(
    () =>
      servedFolders?.reduce<number | undefined>(
        (min, f) => (min == null || f.firstAt < min ? f.firstAt : min),
        undefined,
      ),
    [servedFolders],
  );

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. The same narrowing the page applies to its
  // own events applies here, so the spreadsheet and the timeline agree.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchAaveV3Timeline({ wallet, market });
    const served = res.events ?? [];
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served.filter(isAaveV3Event),
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [wallet, market]);

  // Price the exited reserves. The listing row's priceByAddress covers only the
  // reserves the account still holds, so lifetime-flow lines on exited reserves
  // arrive unpriced and the tower's strict per-total guard degrades the whole
  // ECONOMICS panel to the gated token list. Once the events land, read the
  // missing IAaveOracle prices (one batched multicall) and merge. One shot per
  // position — an asset the oracle can't price stays unpriced (the guard holds)
  // without retry loops; a failed fetch just leaves the panel gated.
  //
  // ⚠️ On a windowed page this must be the MERGED lifetime, not the window's.
  // `lifetimeEvents` is undefined until the opening balance is known, and every
  // reducer below treats an absent event list as "no lifetime layer" rather
  // than as an empty one — so the surfaces state nothing while they cannot
  // state the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? aaveEvents : undefined;
  const precomputedLifetime = useMemo(
    () => aaveV3LifetimeWithOpening(aaveEvents, opening, servedFolders),
    [aaveEvents, opening, servedFolders],
  );

  const pricedFlowsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!view || view.status !== "open" || aaveEvents.length === 0) return;
    const key = `${wallet}:${market}`;
    if (pricedFlowsRef.current === key) return;
    // Seeded from the merged lifetime, so a reserve the position only ever
    // touched below the cut still gets its oracle price — otherwise the tower's
    // strict per-total guard would gate the whole ECONOMICS panel on a wallet
    // whose oldest reserves are all in the opening balance.
    const missing = unpricedAaveV3FlowAddresses(view, aaveEvents, precomputedLifetime);
    if (missing.length === 0) return;
    pricedFlowsRef.current = key;
    let cancelled = false;
    fetchAaveV3OraclePrices(missing)
      .then((prices) => {
        if (cancelled || Object.keys(prices).length === 0) return;
        setView((v) => (v ? { ...v, priceByAddress: { ...prices, ...(v.priceByAddress ?? {}) } } : v));
      })
      .catch(() => {
        // The tower simply stays on the gated token list.
      });
    return () => {
      cancelled = true;
    };
  }, [view, aaveEvents, wallet, market, precomputedLifetime]);

  const readFolderMembers = useCallback(
    (ask: { event?: string; folder?: string }) =>
      fetchTimelineFolderMembers({ path: "/api/aave-v3/timeline/folder", params: { wallet, market }, ...ask }),
    [wallet, market],
  );

  const tl = useTimelineEvents(aaveEvents, {
    storageKey: `aave-v3-${market}-${wallet}`,
    protocolKey: "aave-v3",
    window: historyWindow,
    servedRows,
    eventsServed: groupedTail?.eventsServed,
  });

  // ── Market notes: the reserve's own rate across this position's own
  //    stretches ───────────────────────────────────────────────────────────
  // One note per (reserve, side): a V3-family account is one
  // cross-collateralised account holding several reserves at once, and each
  // reserve carries a supply rate it earns and a variable borrow rate it pays
  // (lib/aave-v3/market-notes.ts). Unlike the other rate-step homes the rate
  // is on neither of the position's rows, so the coordinates the page needs
  // are asked of the index in one POST — and the notes are computed over the
  // rows THIS PAGE SERVES, so a stretch that brackets the window's own cut is
  // simply not stated rather than drawn across a gap.
  const rateRequests = useMemo(
    () => aaveFamilyRateRequests(aaveFamilyHoldings(aaveEvents), stableRateReserves(aaveEvents)),
    [aaveEvents],
  );
  const [reserveRates, setReserveRates] = useState<ReserveRateLookup | null>(null);
  const [ratesPending, setRatesPending] = useState(false);
  const [head, setHead] = useState<{ blockNumber: number; blockTimestamp: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReserveRates(null);
    if (rateRequests.length === 0) {
      setRatesPending(false);
      return;
    }
    setRatesPending(true);
    const ac = new AbortController();
    // Fail-open: a null answer leaves the timeline exactly as it was before
    // notes existed — the rates are an addition to the page, never a gate.
    loadAaveFamilyReserveRates({
      route: "/api/aave-v3/reserve-rates",
      market,
      requests: rateRequests,
      signal: ac.signal,
    }).then((r) => {
      if (cancelled) return;
      setReserveRates(r);
      setRatesPending(false);
    });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [market, rateRequests]);

  // The head's own timestamp, so a live note can state how long the stretch
  // has run rather than leaving its elapsed cell blank. The overlay states the
  // block it read at but not that block's time.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/head")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.blockTimestamp) setHead(d);
      })
      .catch(() => {
        // The elapsed cell simply does not render.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const noteOptions = useMemo<AaveFamilyNoteOptions>(
    () => ({
      protocol: "aave-v3",
      market,
      marketName: `Aave V3 ${MARKET_NAME[market] ?? "Core"}`,
      pool: POOL_BY_MARKET[market] ?? POOL_BY_MARKET.core,
      // The overlay names the reserves the account holds now; the index's own
      // symbol and the row's flow symbol are the fallbacks behind it.
      symbols: Object.fromEntries((chain?.reserves ?? []).map((r) => [r.address.toLowerCase(), r.symbol])),
    }),
    [market, chain],
  );

  // Two kinds, one list: the reserve rate steps (once the rates land) and the
  // seized asset's price before each liquidation, which reads only the rows
  // already on the page and so never waits on the rates.
  const notes = useMemo<MarketNote[]>(
    () =>
      [
        ...(reserveRates ? aaveFamilyRateStepNotesFor(aaveEvents, reserveRates, noteOptions) : []),
        ...aaveFamilyLiquidationPriceNotes(aaveEvents, noteOptions, servedFolders),
      ].sort((a, b) => a.to.block - b.to.block),
    [aaveEvents, reserveRates, noteOptions, servedFolders],
  );

  const liveNotes = useMemo<MarketNote[]>(
    () =>
      reserveRates && chain && !chain.chainStale
        ? liveAaveFamilyRateStepNotes(
            aaveEvents,
            reserveRates,
            { blockNumber: chain.blockNumber, timestamp: head?.blockTimestamp, reserves: chain.reserves },
            noteOptions,
          )
        : [],
    [aaveEvents, reserveRates, chain, head, noteOptions],
  );

  // Pending only while something still in flight could yield a live note: the
  // overlay, which alone says what the account holds NOW, or the rates behind
  // the earlier end. An overlay that has answered with nothing is an answer.
  const liveNotesPending =
    view?.status === "open" && (!chainSettled || (chain != null && chain.reserves.length > 0 && ratesPending));

  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine, reduced over the whole history so the
  // Explanation can state it once. Derived from the events already on the page;
  // no new field on the position response.
  //
  // On a windowed page the opening balance's own split is added: rails-server
  // reconstructs `pool_caller` from the base tables exactly as /timeline does,
  // so both halves judge on the same fact. The two never count one event twice
  // — they are the two sides of an exclusive cut.
  //
  // On a GROUPED page the folders are the third contributor to that same cut,
  // and each carries the same verdict over its own members (the index's
  // `actorOf` restates `externalActor` arm for arm). Adding them is what keeps
  // "who executed this position" a statement about the position rather than
  // about the rows that happened to arrive ungrouped.
  const externalActivity = useMemo(
    () =>
      withFolderActors(
        withOpeningActors(
          summariseExternalActors(
            aaveEvents.map((e) => ({
              txFrom: e.context.data.txFrom,
              poolCaller: e.context.data.poolCaller,
              wallet: e.wallet,
            })),
          ),
          opening?.actors,
          opening?.totalEvents ?? 0,
        ),
        servedFolders,
      ),
    [aaveEvents, opening, servedFolders],
  );

  // Once the live Pool read lands, the card renders ITS health factor — the
  // HF headline, the liquidation footnote (both pure functions of HF), the
  // risk slot, and the explanation then all read the same figure. Without
  // this the card face showed the listing's snapshot-sweep HF next to the
  // risk slot's live one — two "drop to liquidation" percentages from two
  // blocks on one card. The listing keeps the snapshot; this page re-reads
  // live (which the snapshot receipt itself states).
  const liveView = useMemo<AaveV3PositionView | null>(
    () => (view && chain ? { ...view, healthFactor: chain.healthFactor, chainHfStale: false } : view),
    [view, chain],
  );

  // Stat captions (accrued interest, borrow rate) — the event stream feeds the
  // interest split; the live Pool read feeds the rate and streams in when it
  // lands. Computed once: the card and the LLM export share the object so they
  // agree number-for-number.
  const captions = view ? computeAaveV3CardCaptions(view, lifetimeEvents, chain, precomputedLifetime) : null;

  // The tower's data feeds both the bars and their Explanation prose, so it's
  // computed once and shared rather than re-derived for each.
  const towerData = useMemo(
    () => (view ? computeAaveV3Economics(view, lifetimeEvents, undefined, precomputedLifetime) : null),
    [view, lifetimeEvents, precomputedLifetime],
  );

  // Ambient price pill (bottom-right, the V4 treatment): the on-chain oracle
  // price of each reserve the account currently holds.
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

  // Which Pool the receipts name. Core, Prime and EtherFi are three separate
  // contracts and the market is a query parameter, so before this the cards on
  // a Prime position named Core's address.
  const poolIdentity = useMemo(
    () => ({
      name: `Aave V3 ${MARKET_NAME[market] ?? "Core"} Pool`,
      address: POOL_BY_MARKET[market] ?? POOL_BY_MARKET.core,
    }),
    [market],
  );

  return (
    <V3PoolProvider pool={poolIdentity}>
      <div className="py-8 space-y-6">
        <DetailTopRow session="aave-v3" wallet={wallet}>
          {view && (
            <AaveV3ExportMenu
              wallet={wallet}
              marketName={MARKET_NAME[market] ?? "Core"}
              view={view}
              chain={chain}
              captions={captions}
              events={aaveEvents}
              notes={notes}
              liveNotes={liveNotes}
              csvFilename={`aave-v3-${market}-${wallet.slice(0, 10)}-activity.csv`}
              fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
              queued={{
                protocol: "aave-v3",
                params: { wallet, market },
                totalEvents: lifetimeFiguresKnown(historyWindow) ? tl.totalCount : null,
              }}
              history={markdownHistoryScope(historyWindow, aaveEvents, servedFolders)}
              scopeNote={exportScopeNote(historyWindow, aaveEvents, "this wallet's whole history", servedFolders)}
            />
          )}
        </DetailTopRow>

        {loading ? (
          <DetailBodySkeleton />
        ) : (
          <>
            {liveView && (
              <AaveV3PositionCard
                v={liveView}
                receipts
                viewHref={tl.viewHref}
                captions={captions ?? undefined}
                // The risk slot rides the card's heading-button row (the V2 trove
                // treatment): the Display menu plus the chosen risk picture —
                // liquidation runway or the loan-to-value bar (LTV/CR framing +
                // "available to borrow"). Whatever it draws is on the card face and
                // in the card's receipts scope, so the Provenance list stays 1:1
                // with the face figures. Shown only with debt (both views need it).
                rowExtra={
                  chain && chain.healthFactor != null && chain.healthFactor > 0 ? (
                    <AaveV3RiskSlot chain={chain} />
                  ) : undefined
                }
                // The Explanation is now pure layman prose about those same face
                // figures — no secondary figure-strips. The LTV strip is absorbed
                // into the risk slot above; the reserve rates live on the market
                // view (where pool-wide rate context belongs).
                explanation={
                  liveView.status !== "open" ? (
                    <AaveV3ClosedPositionExplanation v={liveView} events={aaveEvents} />
                  ) : (
                    // Passed before the Pool read lands (the Fluid treatment):
                    // the pane, and the copy-view link at its foot, mount with
                    // the card rather than with the read.
                    <AaveV3PositionExplanation
                      chain={chain}
                      captions={captions}
                      view={liveView}
                      externalActivity={externalActivity}
                    />
                  )
                }
              />
            )}
            {towerData && (
              <ChainTruthTower
                data={towerData}
                explanation={aaveV3EconomicsExplanation(towerData)}
                learnMore={aaveV3EconomicsContent()}
              />
            )}
            <ChainTruthTimeline
              // The queued export (rails-ops decision 0029) has no row cap: the
              // card offers the CSV whenever the total is known.
              csvExportCeiling={null}
              // Matches `AaveV3CtEventCard`'s own `persistKey={`aave-v3:${event.id}`}` —
              // lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount.
              persistKeyPrefix="aave-v3"
              closed={view ? view.status !== "open" : undefined}
              notes={notes}
              liveNotes={liveNotes}
              liveNotesPending={liveNotesPending}
              tl={tl}
              // Both grouping paths, side by side: the specs group the flat
              // answer client-side, the register draws the folders the index
              // served. Only one is ever in force on a given load — see the
              // `?folders=1` block above.
              runs={AAVE_V3_TIMELINE_RUNS}
              folderRegister={AAVE_V3_FOLDER_REGISTER}
              readFolderMembers={readFolderMembers}
              // The USD-values toggle joins the chain-state items: the detail
              // grid renders after-balance USD chips off the captured
              // oracle-at-block prices (mig 092).
              displayItems={CHAIN_TRUTH_USD_DISPLAY_ITEMS}
              // Tenure-first header (the V4 spoke treatment): when the account
              // started, how long it has run, how fresh the latest activity is.
              toolbarLeading={
                view ? (
                  <TimelineActivityHeader
                    events={aaveEvents}
                    closed={view.status !== "open"}
                    // When the position actually opened, not when the window
                    // does — otherwise a wallet with 104,000 events reads as
                    // days old because its oldest loaded card is. Same reason
                    // the folders answer when there is no cut: their members
                    // are events this page holds without listing.
                    firstAt={opening?.firstTimestamp ?? oldestFolderAt}
                    tenurePending={!lifetimeFiguresKnown(historyWindow)}
                  />
                ) : undefined
              }
              renderCard={(event, meta) =>
                isAaveV3Event(event) ? (
                  <AaveV3CtEventCard
                    event={event as AaveV3Event}
                    eventNumber={meta.eventNumber}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    market={market}
                  />
                ) : null
              }
            />
            {/* The floating instruments dock: the provenance inspector's target
              toggle + the ambient oracle-price pills (the V4 treatment). Armed,
              every traced value on the page becomes a click target and its
              receipt pins into a popover at the value (prototype: this page). */}
            <PriceStrip assets={stripAssets} leading={<ProvInspectorToggle />} />
            <ProvInspectorLayer />
          </>
        )}
      </div>
    </V3PoolProvider>
  );
}
