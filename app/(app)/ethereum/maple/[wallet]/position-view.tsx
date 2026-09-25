"use client";

// Maple position detail — chain-state-first, the 3-section anatomy (card →
// economics → timeline). Every value is chain-direct or chain-derived:
// position state + timeline replayed from the captured pool/queue events; the
// current redeemable value and the access band ride the per-pool chain read
// the listing proxy already takes (exit/NAV rates + the liquid/deployed
// split — one multicall, no per-wallet RPC). A lender has no liquidation
// surface, so no risk gauges are asserted — the card, the pool band, the
// tower and the timeline carry the whole page.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import { fetchMaplePositions } from "@/lib/api/fetch-maple-positions";
import type { MaplePositionSummary } from "@/lib/sources/api/maple-positions";
import { fetchMapleTimeline } from "@/lib/api/fetch-maple-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MAPLE_QUEUE_FILL_RUNS } from "@/lib/maple/timeline-runs";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { MapleEventCard } from "@/components/protocol/maple/maple-event-card";
import { MaplePoolStatsBand } from "@/components/protocol/maple/maple-pool-stats-band";
import {
  MaplePositionCard,
  viewFromSummary,
  type MaplePositionView,
} from "@/components/protocol/maple/maple-position-card";
import { MaplePositionExplanation } from "@/components/protocol/maple/maple-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeMapleEconomics, computeMapleCardCaptions, mapleLifetimeWithOpening } from "@/lib/maple/economics";
import { mapleEconomicsExplanation, mapleEconomicsContent } from "@/lib/maple/economics-explanation";
import { DetailBackButton, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { getCcipEscrow, getProtocolContract } from "@/lib/shared/known-infrastructure";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { MapleCustodyCard } from "@/components/protocol/maple/maple-custody-card";
import type { MapleCustodyHolding } from "@/lib/sources/chain/maple-custody";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const MapleExportMenu = dynamic(
  () => import("@/components/protocol/maple/maple-export-menu").then((m) => m.MapleExportMenu),
  { ssr: false },
);

interface MaplePositionViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  initialPosition: MaplePositionSummary | null;
  /** Per-pool chain state, which rides the positions envelope. */
  initialPoolState: Record<string, MaplePoolState> | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a lender with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function MaplePositionView({
  wallet,
  initialPosition,
  initialPoolState,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: MaplePositionViewProps) {
  // Keyed on the timeline, not the row: a wallet with no Maple position is a
  // real answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<MaplePositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [poolState, setPoolState] = useState<Record<string, MaplePoolState>>(initialPoolState ?? {});
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — all but a
  // handful of Maple's lenders — `cutoffBlock` comes back null, no second
  // request is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);

  // Known infrastructure (the CCIP bridge escrows) is not a lender — the page
  // renders the custody view instead of the position scaffolding (the backend
  // returns no roster row and no timeline for these addresses; what the
  // escrow holds rides its own chain read).
  const infra = getCcipEscrow(wallet);
  // A protocol contract (Uniswap V4's PoolManager, CoW's settlement contract)
  // has a Maple record of its own and keeps its timeline, but it is not a
  // lender: the listing leaves it out and the position card never renders for
  // it, so the page opens by saying what the address is.
  const protocolContract = getProtocolContract(wallet, MAINNET_CHAIN_ID);
  const [custody, setCustody] = useState<MapleCustodyHolding[] | null>(null);

  useEffect(() => {
    if (!wallet || !getCcipEscrow(wallet)) return;
    (async () => {
      try {
        const res = await fetch(`/api/chain/maple/custody?address=${wallet}`);
        const data = res.ok ? await res.json() : { holdings: [] };
        setCustody(Array.isArray(data.holdings) ? data.holdings : []);
      } catch {
        setCustody([]); // RPC down — the identity card carries the page alone.
      }
    })();
  }, [wallet]);

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !wallet || getCcipEscrow(wallet)) return;
    (async () => {
      setLoading(true);
      try {
        const [pData, tData] = await Promise.all([
          fetchMaplePositions({ wallet, limit: 1, status: undefined }),
          fetchMapleTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setPoolState(pData.poolState ?? {});
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [wallet, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately a separate one: the rows land and the list is readable while
  // this is in flight, and every whole-history figure declares itself unknown
  // until it arrives rather than stating the window's arithmetic as a lifetime.
  // A failure is a stated failure for the same reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. The server read it for the same reason the client does, and
    // only a server-side failure leaves it null with a cutoff block set, which
    // is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/maple/timeline/summary",
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

  const mapleEvents = useMemo(() => events.filter(isMapleEvent), [events]);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. The same narrowing the page applies to its
  // own events applies here, so the spreadsheet and the timeline agree.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchMapleTimeline(wallet);
    const served = res.events ?? [];
    // The index's own row ceiling, passed through rather than absorbed: a
    // download that is short must not happen at all.
    return {
      events: served.filter(isMapleEvent),
      missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
    };
  }, [wallet]);

  // ⚠️ On a windowed page the reducers below must read the MERGED lifetime, not
  // the window's. `lifetimeEvents` is undefined until the opening balance is
  // known, and both reducers treat an absent event list as "no lifetime layer"
  // rather than as an empty one — so the withdrawn segments, the inflow bar and
  // the interest split state nothing while they cannot state the whole, which is
  // the only correct answer between the two requests.
  const lifetimeEvents = lifetimeFiguresKnown(historyWindow) ? mapleEvents : undefined;
  const precomputedLifetime = useMemo(() => mapleLifetimeWithOpening(mapleEvents, opening), [mapleEvents, opening]);

  const tl = useTimelineEvents(mapleEvents, {
    storageKey: `maple-${wallet}`,
    protocolKey: "maple",
    window: historyWindow,
  });

  // Who executed this account's events — the SAME verdict each event card
  // renders on its spine, reduced over the whole history so the Explanation can
  // state it once. Queue fills are stripped of their facts rather than dropped:
  // a fill is `onlyRedeemer` (a registered redeemer or the pool delegate), so it
  // must never mark, but it is still one of the account's events and belongs in
  // the denominator — the same exclusion the card makes.
  //
  // On a windowed page the opening balance's own split is added: rails-server
  // makes the SAME exclusion in SQL (`action <> 'request_fill'`) and reads
  // tx_from and caller from the base tables exactly as /timeline does, so both
  // halves judge on the same fact. The two never count one event twice — they
  // are the two sides of an exclusive cut.
  const externalActivity = useMemo(
    () =>
      withOpeningActors(
        summariseExternalActors(
          mapleEvents.map((e) =>
            e.context.data.eventType === "request_fill"
              ? { wallet: e.wallet }
              : { txFrom: e.context.data.txFrom, poolCaller: e.context.data.caller, wallet: e.wallet },
          ),
        ),
        opening?.actors,
        opening?.totalEvents ?? 0,
      ),
    [mapleEvents, opening],
  );

  // Stat captions (earned interest) — the event stream feeds the split; the
  // rate rides the listing row's per-pool chain read.
  const captions = view ? computeMapleCardCaptions(view, lifetimeEvents, precomputedLifetime) : null;

  // The access band on the pools this wallet touches — the liquid/deployed
  // split IS the position's risk surface, so it belongs on the page.
  const walletPoolState = useMemo(() => {
    if (!view) return poolState;
    const touched = new Set(view.pools.map((p) => p.pool));
    return Object.fromEntries(Object.entries(poolState).filter(([k]) => touched.size === 0 || touched.has(k)));
  }, [view, poolState]);

  // The top row's price dropdown. A Maple lender holds POOL SHARES, and the
  // one price the protocol states about a share is the pool's own exit rate:
  // what one share converts to in the pool's funds asset, quantized by the pool
  // rather than re-multiplied here. The funds asset is that unit — and it is
  // where the USD stops, since Maple's oracle answers a governance-set $1 pin
  // for USDC and reverts for USDT, so its row names the asset and no figure.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    if (!view) return [];
    const out: LatestPriceAsset[] = [];
    const assets = new Map<string, string>();
    for (const p of view.pools) {
      const state = walletPoolState[p.pool];
      const rate = state && !Number.isNaN(state.exitRate) && state.exitRate > 0 ? state.exitRate : undefined;
      out.push({
        symbol: p.symbol,
        address: maplePoolOf(p.pool).pool,
        price: rate,
        unit: rate ? p.assetSymbol : undefined,
        label: `One ${p.symbol} at the pool's exit rate, in ${p.assetSymbol}`,
      });
      assets.set(p.assetAddress, p.assetSymbol);
    }
    for (const [address, symbol] of assets) {
      out.push({ symbol, address, label: `${symbol}, the pool's funds asset` });
    }
    return out;
  }, [view, walletPoolState]);

  // The custody view — the factual page for a bridge escrow address. The
  // identity card states what the contract is and links the verified source;
  // the custody card beneath it carries what the escrow holds in the pool,
  // every figure traced to its own chain read. When the chain read degrades,
  // the identity card carries the page alone — no untraced figure renders.
  if (infra) {
    return (
      <div className="py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DetailBackButton session="maple" wallet={wallet} />
          <ToolsMenu />
        </div>
        <ContractIdentityCard
          kicker="Bridge infrastructure"
          name={infra.name}
          wallet={wallet}
          contractName={infra.contractName}
        >
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rb-500">{infra.description}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-rb-500">
            Custody, not lending: the shares this contract holds are not a lender position — it never deposits or
            withdraws on its own. Transfers real lenders make to and from it appear on their own timelines as bridge
            transfers, with this escrow named as the counterparty.
          </p>
        </ContractIdentityCard>
        {custody != null && custody.length > 0 && (
          <MapleCustodyCard infra={infra} holdings={custody} viewHref={tl.viewHref} />
        )}
        <ProvInspectorLayer />
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow session="maple" wallet={wallet} assets={stripAssets} priceReason={ORACLE_USD_REASON.maple}>
        {view && (
          <MapleExportMenu
            view={view}
            events={mapleEvents}
            captions={captions}
            csvFilename={`maple-${wallet}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            queued={{
              protocol: "maple",
              params: { wallet },
              totalEvents: lifetimeFiguresKnown(historyWindow) ? tl.totalCount : null,
            }}
            history={markdownHistoryScope(historyWindow, mapleEvents)}
            scopeNote={exportScopeNote(historyWindow, mapleEvents, "this wallet's whole history")}
          />
        )}
      </DetailTopRow>

      {protocolContract && (
        <ContractIdentityCard
          kicker="Protocol contract"
          name={protocolContract.name}
          wallet={wallet}
          contractName={protocolContract.contractName}
        >
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-rb-500">
            This address is {protocolContract.role}. It is not a lender position, so the Maple listing leaves it out.
            The timeline below is its record in Maple&rsquo;s pools.
          </p>
        </ContractIdentityCard>
      )}

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {view && (
            <MaplePositionCard
              v={view}
              receipts
              viewHref={tl.viewHref}
              captions={captions ?? undefined}
              // The Explanation pane: layman narration of the card's own face
              // figures (claim, exit rate, escrow, the pool's queue and split).
              explanation={
                <MaplePositionExplanation v={view} captions={captions} externalActivity={externalActivity} />
              }
            />
          )}
          {Object.keys(walletPoolState).length > 0 && <MaplePoolStatsBand poolState={walletPoolState} />}
          {view &&
            (() => {
              const towerData = computeMapleEconomics(view, lifetimeEvents, precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={mapleEconomicsExplanation(towerData)}
                  learnMore={mapleEconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            // The queued export (rails-ops decision 0029) has no row cap: the
            // card offers the CSV whenever the total is known.
            csvExportCeiling={null}
            // Matches `MapleEventCard`'s own `persistKey={`maple:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="maple"
            closed={view ? view.status !== "open" : undefined}
            tl={tl}
            // Tenure-first header: when the account started, how long it has
            // run, how fresh the latest activity is.
            toolbarLeading={
              view ? (
                <TimelineActivityHeader
                  events={mapleEvents}
                  closed={view.status !== "open"}
                  // When the position actually opened, not when the window
                  // does — otherwise a wallet with 41,000 events reads as days
                  // old because its oldest loaded card is.
                  firstAt={opening?.firstTimestamp}
                  tenurePending={!lifetimeFiguresKnown(historyWindow)}
                />
              ) : undefined
            }
            runs={MAPLE_QUEUE_FILL_RUNS}
            renderCard={(event, meta) =>
              isMapleEvent(event) ? (
                <MapleEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                />
              ) : null
            }
          />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}

/** The identity card for an address Rails knows to be a contract rather than a
 *  lender: what it is, and the verified source it was named from. */
function ContractIdentityCard({
  kicker,
  name,
  wallet,
  contractName,
  children,
}: {
  kicker: string;
  name: string;
  wallet: string;
  contractName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="text-[11px] uppercase tracking-wider text-rb-500">{kicker}</div>
      <h1 className="mt-1.5 text-lg font-semibold text-foreground">{name}</h1>
      {children}
      <p className="mt-3 text-sm text-rb-500">
        Contract{" "}
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "address", wallet)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[13px] text-foreground underline decoration-line underline-offset-2 hover:decoration-foreground"
        >
          {wallet}
        </a>{" "}
        — Etherscan-verified as <span className="font-mono text-[13px]">{contractName}</span>.
      </p>
    </div>
  );
}
