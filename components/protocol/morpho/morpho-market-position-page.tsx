"use client";

// One Morpho Blue position on a wallet-first deployment (Base, Arbitrum),
// lifted from the Base page; the deployment (lib/morpho/page-deployment.ts)
// carries the routes, links, whole-life rule and words.
//
// One Morpho Blue position on Base — a (market, wallet) pair: its card, its
// Lifetime flows and its whole-life timeline. The Ethereum explorer's detail
// page is exactly this pair, and this route restores that grain on Base; the
// wallet page above it is the way in (one card per position, each a link).
//
// Both reads are wallet-scoped (lib/morpho-base/use-wallet-reads) — there is
// no per-market endpoint, and a position's history is a slice of the wallet's
// sweep — so this page fetches what the wallet page fetches and renders the
// one market the route names. The section it renders is the wallet page's
// former per-market block, unchanged: the same cards, flows panel and footer, with
// the same rules about what a partial sweep may and may not claim.

import { useCallback, useMemo, type ReactNode } from "react";
import { useParams } from "next/navigation";

import { MorphoBasePositionSection, MorphoLenderOpenCard } from "@/components/protocol/morpho-base/position-section";
import { MorphoPositionCard } from "@/components/protocol/morpho/morpho-position-card";
import { morphoExports } from "@/components/protocol/morpho/morpho-export-menu";
import { ExportMenu } from "@/components/shared/export-menu";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { useMorphoBaseWalletReads } from "@/lib/morpho-base/use-wallet-reads";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import type { MorphoPageDeployment } from "@/lib/morpho/page-deployment";
import { morphoLiveReceipts } from "@/components/protocol/morpho/morpho-wallet-page";
import { shortMarketId } from "@/lib/morpho/asset-catalog";
import { morphoListedViewFromLive, morphoViewFromSweep } from "@/lib/morpho/swept-position-view";
import { morphoHasCollateralRaw, morphoHasDebt } from "@/lib/morpho/position-legs";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import { CaptureSourceProvider } from "@/lib/shared/capture-source";
import { StoreFirstRead, SweepInFlight } from "@/components/shared/sweep-in-flight";
import type { WholeHistoryFetch } from "@/components/shared/export-menu";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

export interface MorphoMarketPositionViewProps {
  /** Already lower-cased and address-shaped, and `market` already checked to be
   *  a market-id segment — the server route rejected anything else with a 404
   *  before this component existed. */
  wallet: string;
  market: string;
  /** The singleton's slot read, done on the server. `null` means it failed (or
   *  came back a stale stub) and the hook reads it from the browser exactly as
   *  this page always did. */
  initialSlots: MorphoWalletChainResponse | null;
  /** The wallet's history in the route's own wire shape, present only when
   *  the index vouched for the whole life. `null` means the hook fetches it
   *  and the route sweeps, as before — see lib/morpho-base/position-page-data.ts. */
  initialTimeline: unknown | null;
  /** Set when `wallet` is a catalogued MetaMorpho vault — resolved once on the
   *  server (lib/morpho-base/vault-owner-note.ts) and threaded into every
   *  card below so this address never falls back to bare hex on this page. */
  vaultOwner: { name: string; href: string } | null;
  /** The server read this position as ROWS (`?folders=0` absent); the
   *  client's own read, when the server could not seed one, asks the same. */
  grouped?: boolean;
  /** A line under the top row from the slot read (Arbitrum's dollar
   *  figures for this market); none on Base. */
  summary?: (data: MorphoWalletChainResponse | null) => ReactNode;
}

export function MorphoMarketPositionView({
  deployment: d,
  wallet,
  market,
  initialSlots,
  initialTimeline,
  vaultOwner,
  grouped = false,
  summary,
}: MorphoMarketPositionViewProps & { deployment: MorphoPageDeployment }) {
  const w = d.words;
  // The event route renders this same view, flat: pinned mode finds its card
  // among the served events, and a folder's members arrive only when opened.
  const routeParams = useParams<{ eventId?: string | string[] }>();
  const pinnedRoute = routeParams?.eventId != null;
  const { data, loading, error, timeline, timelineState, firstReadStalled, sweptClean, captureSource, chainByMarket } =
    useMorphoBaseWalletReads(
      wallet,
      initialSlots,
      initialTimeline,
      grouped && d.grouped && !pinnedRoute ? market : undefined,
      d,
    );

  const live = chainByMarket.get(market) ?? null;
  const liveClean = live && !live.chainStale ? live : null;
  const pos = timeline ? (timeline.positions.find((p) => p.marketId.toLowerCase() === market) ?? null) : null;

  // The card the live read can draw before the sweep lands: the same shell
  // and columns the swept card fills in, so the page gains history instead of
  // swapping card shapes. A market the wallet only ever LENT in keeps the slot
  // card — the shared card's grammar is a borrower's (see position-section).
  const liveCard = useMemo(() => {
    if (!liveClean) return null;
    const borrowerSide = morphoHasCollateralRaw(liveClean.collateralRaw) || morphoHasDebt(liveClean.borrowSharesRaw);
    if (!borrowerSide) return <MorphoLenderOpenCard p={liveClean} surface="detail" vault={vaultOwner} deployment={d} />;
    const v = { ...morphoListedViewFromLive(liveClean, wallet), vaultOwner };
    return (
      <MorphoPositionCard
        v={v}
        surface="detail"
        session={d.session}
        listedReceipts={morphoLiveReceipts(d)}
        live={liveClean}
      />
    );
  }, [liveClean, wallet, vaultOwner, d]);

  // The export rides the same rule as the card and the flows panel: only a sweep
  // that read every block yields a view whose principal and lifetime figures
  // the document can stand behind. Same adapter as the position section, so
  // the exported card is the rendered one.
  const exportView = useMemo(
    () => (sweptClean && pos ? morphoViewFromSweep(pos, wallet, live) : null),
    [sweptClean, pos, wallet, live],
  );
  const exportEvents = useMemo(() => (pos ? pos.events.filter(isMorphoEvent) : []), [pos]);
  // On a grouped answer the folders' members are not among the events: the
  // export states them, and the CSV opens each folder for its members.
  // `missing` is what no answer lists — a seed's rows, or rows below the cap.
  const folders = useMemo<ServedFolder[] | null>(
    () =>
      timeline?.grouped && timeline.market === market && timeline.rowPlan
        ? timeline.rowPlan.flatMap((r) => (r.kind === "folder" ? [r.folder] : []))
        : null,
    [timeline, market],
  );
  const fetchAllHistory = useCallback(async (): Promise<WholeHistoryFetch> => {
    const all: BaseActivityEvent[] = [...exportEvents];
    for (const f of folders ?? []) {
      const opened = await fetchTimelineFolderMembers({
        path: d.routes.folder ?? `${d.routes.timeline}/folder`,
        params: { wallet, market },
        folder: f.responseId,
      });
      all.push(...opened.events);
    }
    all.sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
    return { events: all, missing: pos?.omitted?.count ?? 0 };
  }, [exportEvents, folders, wallet, market, pos, d]);

  // The card ⋮'s export shapes (ui-jobs 308 point 2). The serializer is the
  // Ethereum one: a Base position is the same (market, wallet) pair in the
  // same units.
  const exports = exportView
    ? morphoExports({
        view: exportView,
        chain: live,
        events: exportEvents,
        history: markdownHistoryScope(undefined, exportEvents, folders),
        scopeNote: exportScopeNote(undefined, exportEvents, "this position's whole history", folders),
        fetchAllEvents: folders && folders.length > 0 ? fetchAllHistory : undefined,
        csvFilename: `${d.session}-${market.slice(0, 10)}-${wallet.slice(0, 10)}-activity.csv`,
      })
    : null;

  // The top row's price dropdown — the Ethereum page's treatment on the Base
  // singleton: the market's own oracle prices the collateral in the market's
  // loan token, which is the only price Blue states, and the loan token is
  // that unit rather than a priced asset. The swept position names both tokens
  // before the live read lands, so the rows stand and only the price waits.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    const collateralSymbol = pos?.collateralSymbol ?? live?.collateralSymbol ?? null;
    const loanSymbol = pos?.loanSymbol ?? live?.loanSymbol ?? null;
    if (!loanSymbol) return [];
    const out: LatestPriceAsset[] = [];
    if (collateralSymbol) {
      const oracle = liveClean && liveClean.oraclePrice > 0 ? liveClean.oraclePrice : undefined;
      out.push({
        symbol: collateralSymbol,
        address: pos?.collateralToken ?? live?.collateralToken,
        price: oracle,
        unit: oracle ? loanSymbol : undefined,
        label: `${collateralSymbol} in ${loanSymbol} (the market's own oracle)`,
      });
    }
    out.push({
      symbol: loanSymbol,
      address: pos?.loanToken ?? live?.loanToken,
      label: `${loanSymbol}, the market's loan token`,
    });
    return out;
  }, [pos, live, liveClean]);

  // A closed position's prices: the market oracle at the closing block, which
  // the sweep carries on liquidation rows only; otherwise the dropdown is left
  // out.
  const closed = useMemo(
    () => (pos ? morphoViewFromSweep(pos, wallet, live).status !== "open" : false),
    [pos, wallet, live],
  );
  const closing = useMemo(() => {
    if (!closed || !pos?.collateralSymbol || !pos.loanSymbol) return undefined;
    const { collateralSymbol, loanSymbol } = pos;
    return closingPricesAt(exportEvents, (row) => {
      const price = row.context.data.oraclePriceAtBlock?.loanPerCollateral;
      if (price == null || !(price > 0)) return undefined;
      return [
        {
          symbol: collateralSymbol,
          address: pos.collateralToken,
          price,
          unit: loanSymbol,
          label: `${collateralSymbol} in ${loanSymbol} (the market's own oracle)`,
        },
        { symbol: loanSymbol, address: pos.loanToken, label: `${loanSymbol}, the market's loan token` },
      ];
    });
  }, [closed, pos, exportEvents]);

  return (
    // Every event card's custody line names whichever source answered — the
    // index once it vouches for the whole life, the live sweep until then.
    <CaptureSourceProvider value={captureSource}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session={d.session}
          wallet={wallet}
          owner={{ wallet, vault: vaultOwner }}
          assets={stripAssets}
          priceReason={ORACLE_USD_REASON[d.session]}
          closed={closed}
          closing={closing}
          // The exports ride the card's ⋮; the event route, which draws no card,
          // keeps them in the wallet row's Tools.
          tools={pinnedRoute}
        >
          {pinnedRoute && exports && <ExportMenu {...exports} />}
        </DetailTopRow>
        {summary?.(data)}

        {/* A segment that is not a market id never reaches here: the server
            route answers 404 with the not-found body beside it. */}
        {loading ? (
          <DetailBodySkeleton />
        ) : (
          <>
            {/* A failed slot read is stated and stepped past: the history is a
                separate read and stands on its own. */}
            {error && (
              <div className="py-6 text-center text-rb-500">
                <p className="mb-1">Couldn&apos;t read this position&apos;s live slots.</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {timelineState === "ready" && timeline ? (
              pos ? (
                <div className="space-y-10">
                  {!pinnedRoute && !sweptClean && <p className="text-sm text-rb-500">{w.notWholePosition}</p>}
                  {!pinnedRoute && !sweptClean && liveCard}
                  <MorphoBasePositionSection
                    wallet={wallet}
                    pos={pos}
                    chain={live}
                    onEventPage={pinnedRoute}
                    coverage={timeline.coverage}
                    sweptClean={sweptClean}
                    vaultOwner={vaultOwner}
                    exports={exports}
                    // Rows only when the answer is this position's grouping.
                    grouped={timeline.grouped && timeline.market === market ? timeline : null}
                    deployment={d}
                  />
                </div>
              ) : liveClean ? (
                <div className="space-y-6">
                  {liveCard}
                  <p className="text-sm text-rb-500">{w.heldNoEvent}</p>
                </div>
              ) : (
                <div className="py-12 text-center text-rb-500">
                  <p className="mb-1">No position for this wallet in market {shortMarketId(market)}.</p>
                  <p className="text-sm">
                    The singleton holds nothing for it there now
                    {sweptClean ? w.noPositionWhole : w.noPositionPartial}
                  </p>
                </div>
              )
            ) : timelineState === "loading" ? (
              <div className="space-y-6">
                {liveCard}
                <SweepInFlight>{w.reading}</SweepInFlight>
              </div>
            ) : timelineState === "first-read" ? (
              <div className="space-y-6">
                {liveCard}
                <StoreFirstRead words={w.firstRead} stalled={firstReadStalled} />
              </div>
            ) : (
              <div className="space-y-6">
                {liveCard}
                <p className="py-6 text-center text-sm text-rb-500">
                  {timelineState === "unavailable" ? w.unavailablePosition : w.failedPosition}
                </p>
                {!liveClean && data && (
                  <p className="text-center text-sm text-rb-500">
                    The wallet holds nothing in market {shortMarketId(market)} right now.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <ProvInspectorLayer />
      </div>
    </CaptureSourceProvider>
  );
}
