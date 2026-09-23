"use client";

// One Morpho Blue position on Base — a (market, wallet) pair: its card, its
// economics tower and its whole-life timeline. The Ethereum explorer's detail
// page is exactly this pair, and this route restores that grain on Base; the
// wallet page above it is the way in (one card per position, each a link).
//
// Both reads are wallet-scoped (lib/morpho-base/use-wallet-reads) — there is
// no per-market endpoint, and a position's history is a slice of the wallet's
// sweep — so this page fetches what the wallet page fetches and renders the
// one market the route names. The section it renders is the wallet page's
// former per-market block, unchanged: the same cards, tower and footer, with
// the same rules about what a partial sweep may and may not claim.

import { useMemo } from "react";
import dynamic from "next/dynamic";

import { MorphoBasePositionSection, MorphoLenderOpenCard } from "@/components/protocol/morpho-base/position-section";
import { MorphoPositionCard } from "@/components/protocol/morpho/morpho-position-card";
import { MorphoRiskSlot } from "@/components/protocol/morpho/morpho-risk-slot";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { PriceStrip } from "@/components/shared/price-strip";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { isMorphoBaseMarketSegment } from "@/lib/morpho-base/routes";
import { useMorphoBaseWalletReads } from "@/lib/morpho-base/use-wallet-reads";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import { MORPHO_BASE_POSITIONS_ROUTE } from "@/lib/morpho-base/list-filter-dimensions";
import { makeListedMorphoReceipts } from "@/lib/morpho/listed-card-provenance";
import { shortMarketId } from "@/lib/morpho/asset-catalog";
import { morphoListedViewFromLive, morphoViewFromSweep } from "@/lib/morpho/swept-position-view";
import { morphoHasCollateralRaw, morphoHasDebt } from "@/lib/morpho/position-legs";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import { CaptureSourceProvider } from "@/lib/shared/capture-source";
import { SweepInFlight } from "@/components/shared/sweep-in-flight";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, as on the Ethereum position page. The
// serializer is the Ethereum one — a Base position is the same (market,
// wallet) pair in the same units, so the document it writes is the same.
const MorphoExportMenu = dynamic(
  () => import("@/components/protocol/morpho/morpho-export-menu").then((m) => m.MorphoExportMenu),
  { ssr: false },
);

/** The receipts the live card cites while the sweep is in flight: the head
 *  read of the singleton this page makes, not a listing row. Module-level so
 *  the reference is stable across renders. */
const LIVE_RECEIPTS = makeListedMorphoReceipts({
  chainId: MORPHO_BASE_CHAIN_ID,
  positionsRoute: MORPHO_BASE_POSITIONS_ROUTE,
  custody:
    "read live from the Morpho singleton at the head block the card names, served by GET /api/chain/morpho-base/wallet",
});

interface MorphoBasePositionViewProps {
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
}

export default function MorphoBasePositionView({
  wallet,
  market,
  initialSlots,
  initialTimeline,
  vaultOwner,
}: MorphoBasePositionViewProps) {
  const { data, loading, error, timeline, timelineState, sweptClean, captureSource, chainByMarket } =
    useMorphoBaseWalletReads(wallet, initialSlots, initialTimeline);

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
    if (!borrowerSide) return <MorphoLenderOpenCard p={liveClean} receipts vault={vaultOwner} />;
    const v = { ...morphoListedViewFromLive(liveClean, wallet), vaultOwner };
    return (
      <MorphoPositionCard
        v={v}
        receipts
        session="morpho-base"
        listedReceipts={LIVE_RECEIPTS}
        rowExtra={
          liveClean.healthFactor != null && liveClean.healthFactor > 0 ? (
            <MorphoRiskSlot chain={liveClean} />
          ) : undefined
        }
      />
    );
  }, [liveClean, wallet, vaultOwner]);

  // The export rides the same rule as the card and the tower: only a sweep
  // that read every block yields a view whose principal and lifetime figures
  // the document can stand behind. Same adapter as the position section, so
  // the exported card is the rendered one.
  const exportView = useMemo(
    () => (sweptClean && pos ? morphoViewFromSweep(pos, wallet, live) : null),
    [sweptClean, pos, wallet, live],
  );
  const exportEvents = useMemo(() => (pos ? pos.events.filter(isMorphoEvent) : []), [pos]);

  return (
    // Every event card's custody line names whichever source answered — the
    // index once it vouches for the whole life, the live sweep until then.
    <CaptureSourceProvider value={captureSource}>
      <div className="py-8 space-y-6">
        <DetailTopRow session="morpho-base" wallet={wallet}>
          {exportView && (
            <MorphoExportMenu
              view={exportView}
              chain={live}
              events={exportEvents}
              csvFilename={`morpho-base-${market.slice(0, 10)}-${wallet.slice(0, 10)}-activity.csv`}
            />
          )}
        </DetailTopRow>

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
                  {!sweptClean && (
                    <p className="text-sm text-rb-500">
                      The history below is what the sweep could read; the note under the list says where it stopped or
                      what it missed. The position card and the lifetime economics are withheld until a sweep reads
                      every block, because a principal or an &ldquo;all time&rdquo; over a partial history would be a
                      figure this page cannot stand behind. The card above, where there is one, is read live from the
                      singleton and is unaffected.
                    </p>
                  )}
                  {!sweptClean && liveCard}
                  <MorphoBasePositionSection
                    wallet={wallet}
                    pos={pos}
                    chain={live}
                    coverage={timeline.coverage}
                    sweptClean={sweptClean}
                    vaultOwner={vaultOwner}
                  />
                </div>
              ) : liveClean ? (
                <div className="space-y-6">
                  {liveCard}
                  <p className="text-sm text-rb-500">
                    The wallet holds this position now, but the sweep found no event naming it in this market — which
                    should not happen, since a holding cannot arrive without one. The card is the live read alone.
                  </p>
                </div>
              ) : (
                <div className="py-12 text-center text-rb-500">
                  <p className="mb-1">No position for this wallet in market {shortMarketId(market)}.</p>
                  <p className="text-sm">
                    The singleton holds nothing for it there now
                    {sweptClean
                      ? ", and has emitted no event naming it in that market between its first block and now."
                      : ", and the sweep read no event naming it there — though the sweep did not read every block."}
                  </p>
                </div>
              )
            ) : timelineState === "loading" ? (
              <div className="space-y-6">
                {liveCard}
                <SweepInFlight>
                  Reading this wallet&rsquo;s whole history from the singleton&rsquo;s logs — the sweep runs from the
                  contract&rsquo;s first block, so it takes a moment.
                </SweepInFlight>
              </div>
            ) : (
              <div className="space-y-6">
                {liveCard}
                <p className="py-6 text-center text-sm text-rb-500">
                  {timelineState === "unavailable"
                    ? "The history endpoint isn't answering, so the timeline and the lifetime economics are unavailable. The card, where there is one, is read live from the singleton and is unaffected."
                    : "The history sweep failed. Reload to try again — the card, where there is one, is read live from the singleton and is unaffected."}
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

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </CaptureSourceProvider>
  );
}
