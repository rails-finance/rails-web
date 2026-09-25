"use client";

// Every Morpho Blue position one wallet holds on Base — one card each, and
// each card the way into its own page.
//
// The Ethereum explorer's detail page is ONE (market, wallet) pair, because
// that is what its index hands you a link to. On Base the chain reads are
// wallet-scoped (lib/morpho-base/use-wallet-reads — the slots for the present,
// the sweep for the history), so this page is the wallet: it lists every
// market the wallet holds something in now or ever acted in, as the shared
// Morpho card in the listing's row grammar, and each row opens
// /base/morpho/<wallet>/<market> — the position, at the Ethereum grain, with
// its tower and whole-life timeline. It used to stack all of that here, one
// market after another; a wallet in three markets was three explorer pages on
// one scroll.
//
// What the cards may claim follows the sweep: with every block read, the
// shared card stands (principal, peaks, the liquidation record, the live debt
// admitted when the replayed shares equal the slot); until then, or when the
// sweep could not read every block, the slot cards carry the present alone.

import { useMemo } from "react";
import Link from "next/link";

import { MorphoPositionCard } from "@/components/protocol/morpho/morpho-position-card";
import { MorphoRiskSlot } from "@/components/protocol/morpho/morpho-risk-slot";
import { LenderClosedCard, MorphoLenderOpenCard } from "@/components/protocol/morpho-base/position-section";
import { VaultHoldingsNote } from "@/components/protocol/morpho-base/vault-holdings-note";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { MorphoSweptPosition } from "@/lib/api/fetch-morpho-base-timeline";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { morphoBasePositionHref } from "@/lib/morpho-base/routes";
import { MORPHO_BASE_POSITIONS_ROUTE } from "@/lib/morpho-base/list-filter-dimensions";
import { useMorphoBaseWalletReads } from "@/lib/morpho-base/use-wallet-reads";
import { makeListedMorphoReceipts } from "@/lib/morpho/listed-card-provenance";
import { morphoListedViewFromLive, morphoViewFromSweep } from "@/lib/morpho/swept-position-view";
import { morphoHasCollateralRaw, morphoHasDebt } from "@/lib/morpho/position-legs";
import { explorerUrl } from "@/lib/shared/chains";
import { CaptureSourceProvider } from "@/lib/shared/capture-source";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { SweepInFlight } from "@/components/shared/sweep-in-flight";

/** The receipts a hub row's LIVE card cites — the same head read of the
 *  singleton the position page's own live card names, not a listing row of
 *  its own. Module-level so the reference is stable across renders. */
const LIVE_RECEIPTS = makeListedMorphoReceipts({
  chainId: MORPHO_BASE_CHAIN_ID,
  positionsRoute: MORPHO_BASE_POSITIONS_ROUTE,
  custody:
    "read live from the Morpho singleton at the head block the card names, served by GET /api/chain/morpho-base/wallet",
});

/** The section's own test: a market the wallet only ever LENT in gets the slot
 *  card or a closing statement, never the borrower-grammar card. */
const borrowerSide = (pos: MorphoSweptPosition): boolean =>
  pos.peakCollateral > 0 || pos.peakBorrowed > 0 || pos.lifetime.deposited > 0 || pos.lifetime.borrowed > 0;

interface MorphoBaseWalletViewProps {
  /** Already lower-cased and address-shaped — the server route rejected
   *  anything else with a 404 before this component existed. */
  wallet: string;
  /** The singleton's slot read, done on the server. `null` means it failed (or
   *  came back a stale stub) and the hook reads it from the browser exactly as
   *  this page always did. */
  initialSlots: MorphoWalletChainResponse | null;
  /** The wallet's history in the route's own wire shape, present only when
   *  the index vouched for the whole life. `null` means the hook fetches it
   *  and the route sweeps, as before — see lib/morpho-base/position-page-data.ts. */
  initialTimeline: unknown | null;
  /** Set when this address is a MetaMorpho vault in the Base census — its name
   *  at census, and its exposure page's href (every catalogued vault has one).
   *  Resolved on the SERVER (the census is 505 rows and must not cross into the
   *  bundle); null for an ordinary account and for a vault the census does not
   *  hold — that roster is a floor, so its silence is not a denial. */
  vaultNote: { name: string; href: string } | null;
}

export default function MorphoBaseWalletView({
  wallet,
  initialSlots,
  initialTimeline,
  vaultNote,
}: MorphoBaseWalletViewProps) {
  const {
    data,
    loading,
    error,
    timeline,
    timelineState,
    sweptClean,
    captureSource,
    chainByMarket,
    unswept,
    untouched,
    emptyNow,
  } = useMorphoBaseWalletReads(wallet, initialSlots, initialTimeline);

  // One row per swept position: open first, then by last activity. The view
  // is the section's own (morphoViewFromSweep), so a card here and the card
  // at the top of the position page are the same figures. Every row's owner
  // is THIS page's own wallet, so `vaultNote` — already resolved once, on the
  // server — applies to every one of them alike.
  const rows = useMemo(() => {
    if (!timeline) return [];
    return timeline.positions
      .map((pos) => {
        const chain = chainByMarket.get(pos.marketId.toLowerCase()) ?? null;
        return { pos, chain, view: { ...morphoViewFromSweep(pos, wallet, chain), vaultOwner: vaultNote } };
      })
      .sort((a, b) => {
        const ao = a.view.status === "open" ? 0 : 1;
        const bo = b.view.status === "open" ? 0 : 1;
        return ao - bo || (b.view.lastTs ?? 0) - (a.view.lastTs ?? 0);
      });
  }, [timeline, chainByMarket, wallet, vaultNote]);

  // The top row's price dropdown. This page is the WALLET, not a market, and
  // on Blue a price belongs to a market: the oracle quotes the collateral in
  // that market's own loan token, and a wallet open in several markets has no
  // single unit to state a figure in. So the dropdown names the tokens the
  // wallet's open markets hold and leaves the figures to the market pages one
  // click down, each of which carries its own oracle's price.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    const seen = new Set<string>();
    const out: LatestPriceAsset[] = [];
    for (const { pos, view } of rows) {
      if (view.status !== "open") continue;
      for (const t of [
        { symbol: pos.collateralSymbol, address: pos.collateralToken },
        { symbol: pos.loanSymbol, address: pos.loanToken },
      ]) {
        if (!t.symbol) continue;
        const key = (t.address ?? t.symbol).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ symbol: t.symbol, address: t.address });
      }
    }
    return out;
  }, [rows]);

  return (
    // Every event card's custody line names whichever source answered — the
    // index once it vouches for the whole life, the live sweep until then.
    <CaptureSourceProvider value={captureSource}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="morpho-base"
          wallet={wallet}
          assets={stripAssets}
          priceReason={ORACLE_USD_REASON["morpho-base"]}
        />

        {vaultNote ? (
          <p className="text-[12px] text-rb-500">
            This address is a MetaMorpho vault, {vaultNote.name}.{" "}
            <Link href={vaultNote.href} className={PAGE_LINK} prefetch={false}>
              Vault exposure <span aria-hidden>&rarr;</span>
            </Link>
          </p>
        ) : (
          // Not itself a catalogued vault: it may still HOLD shares of one.
          // That is a chain read (see the component's own header), so it
          // mounts client-side rather than joining the SSR above.
          <VaultHoldingsNote wallet={wallet} />
        )}

        {loading ? (
          <DetailBodySkeleton />
        ) : untouched ? (
          <div className="py-12 text-center text-rb-500">
            <p className="mb-1">This wallet has never touched Morpho Blue on Base.</p>
            <p className="text-sm">
              All {data?.marketsScanned.toLocaleString("en-US")} markets were asked and none holds anything for this
              address, and the singleton has emitted no event naming it between its first block and now.
            </p>
          </div>
        ) : (
          <>
            {/* A failed slot read is stated and stepped past: the history is a
                separate read and stands on its own. */}
            {error && (
              <div className="py-6 text-center text-rb-500">
                <p className="mb-1">Couldn&apos;t read this wallet&apos;s live positions.</p>
                <p className="text-sm">{error}</p>
              </div>
            )}
            {emptyNow && (
              <div className="py-6 text-center text-rb-500">
                <p className="mb-1">This wallet holds nothing on Morpho Blue Base right now.</p>
                <p className="text-sm">
                  All {data?.marketsScanned.toLocaleString("en-US")} markets were asked, and none of them holds a
                  supply, a borrow or collateral for this address.
                  {timelineState === "ready" && (timeline?.positions.length ?? 0) > 0
                    ? " Its history on the singleton is below."
                    : ""}
                </p>
              </div>
            )}

            {/* The present, from the slots alone — shown whenever the sweep is
                not in a position to vouch for the history behind each card.
                Each card still opens its position's page, whose list says what
                the sweep did and did not read. */}
            {!sweptClean && data && !emptyNow && (
              <LiveMarketRows
                wallet={wallet}
                data={data}
                hrefFor={(p) => morphoBasePositionHref(wallet, p.marketId)}
                vault={vaultNote}
              />
            )}

            {timelineState === "ready" && timeline ? (
              <div className="space-y-4">
                {!sweptClean && timeline.positions.length > 0 && (
                  <p className="text-sm text-rb-500">
                    The sweep could not read every block of this wallet&rsquo;s history, so the position cards and the
                    lifetime economics are withheld — a principal or an &ldquo;all time&rdquo; over a partial history
                    would be a figure this page cannot stand behind. Each position&rsquo;s page shows the history that
                    was read and says where it stopped:
                  </p>
                )}
                {!sweptClean &&
                  rows.map(({ pos }) => (
                    <Link
                      key={pos.marketId}
                      href={morphoBasePositionHref(wallet, pos.marketId)}
                      className={PAGE_LINK}
                      prefetch={false}
                    >
                      {pos.marketLabel} <span aria-hidden>→</span>
                    </Link>
                  ))}
                {unswept.length > 0 && (
                  <p className="text-sm text-rb-500">
                    {unswept.length === 1 ? "One market" : `${unswept.length} markets`} the wallet holds something in
                    had no event naming it in the sweep, which should not happen — a holding cannot arrive without one.
                    {unswept.length === 1 ? " It is" : " They are"} shown from the live read alone:
                  </p>
                )}
                {unswept.length > 0 && data && (
                  <LiveMarketRows
                    wallet={wallet}
                    data={{ ...data, positions: unswept, positionsFound: unswept.length }}
                    hrefFor={(p) => morphoBasePositionHref(wallet, p.marketId)}
                    vault={vaultNote}
                  />
                )}
                {sweptClean && rows.length > 0 && (
                  <p className="text-[11px] text-rb-500">
                    <span className="text-foreground">{rows.length.toLocaleString("en-US")}</span>{" "}
                    {rows.length === 1 ? "position" : "positions"}, from every event the singleton has emitted for this
                    wallet since its first block. Open one for its economics and whole history.
                  </p>
                )}
                {sweptClean &&
                  rows.map(({ pos, chain, view }) => (
                    <SummaryRow
                      key={pos.marketId}
                      wallet={wallet}
                      pos={pos}
                      chain={chain}
                      view={view}
                      vault={vaultNote}
                    />
                  ))}
              </div>
            ) : timelineState === "loading" ? (
              <SweepInFlight>
                Reading this wallet&rsquo;s whole history from the singleton&rsquo;s logs — the sweep runs from the
                contract&rsquo;s first block, so it takes a moment.
              </SweepInFlight>
            ) : (
              <p className="py-6 text-center text-sm text-rb-500">
                {timelineState === "unavailable"
                  ? "The history endpoint isn't answering, so the timelines and the lifetime economics are unavailable. The positions above are read live from the singleton and are unaffected."
                  : "The history sweep failed. Reload to try again — the positions above are read live from the singleton and are unaffected."}
              </p>
            )}
          </>
        )}

        <ProvInspectorLayer />
      </div>
    </CaptureSourceProvider>
  );
}

/** One position as a row: the shared card — the swept-history grammar for a
 *  borrower-side position, the shared lender primitives for a market the
 *  wallet only ever lent in (open, still supplying, or closed) — inside the
 *  listing's link. No card here carries an anchor of its own, so the whole
 *  row is safely one link. */
function SummaryRow({
  wallet,
  pos,
  chain,
  view,
  vault,
}: {
  wallet: string;
  pos: MorphoSweptPosition;
  chain: MorphoChainPositionResponse | null;
  view: ReturnType<typeof morphoViewFromSweep>;
  /** Set when `wallet` (this page's own subject) is a catalogued MetaMorpho
   *  vault — the same note the page prints once above every card. */
  vault: { name: string; href: string } | null;
}) {
  const href = morphoBasePositionHref(wallet, pos.marketId);
  const live = chain && !chain.chainStale ? chain : null;
  return (
    <Link href={href} prefetch={true} className="group/listing-row block">
      {!borrowerSide(pos) ? (
        live ? (
          <MorphoLenderOpenCard p={live} vault={vault} />
        ) : (
          <LenderClosedCard pos={pos} wallet={wallet} vault={vault} />
        )
      ) : (
        <MorphoPositionCard
          v={view}
          session="morpho-base"
          rowExtra={
            view.status === "open" && live && live.healthFactor != null && live.healthFactor > 0 ? (
              <MorphoRiskSlot chain={live} />
            ) : undefined
          }
        />
      )}
    </Link>
  );
}

/** The present, from the slots alone: one row per market the wallet holds
 *  something in right now, in the listing's own row grammar — the shared
 *  card fed by the live read (`morphoListedViewFromLive`) for a borrower-side
 *  holding, the shared lender primitives for a market the wallet only ever
 *  lent in. Used both while the sweep has not yet vouched for the whole
 *  history (pre-`sweptClean`) and for a market the sweep found no event
 *  naming (`unswept`) — the same shape either way, since both are just "here
 *  is what the chain holds now". */
function LiveMarketRows({
  wallet,
  data,
  hrefFor,
  vault,
}: {
  wallet: string;
  data: MorphoWalletChainResponse;
  hrefFor: (p: MorphoChainPositionResponse) => string;
  /** Set when `wallet` is a catalogued MetaMorpho vault — see SummaryRow. */
  vault: { name: string; href: string } | null;
}) {
  const hidden = data.positionsFound - data.positions.length;
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-rb-500">
        <span className="text-foreground">{data.positionsFound.toLocaleString("en-US")}</span>{" "}
        {data.positionsFound === 1 ? "position" : "positions"} across{" "}
        <span className="text-foreground">{data.marketsScanned.toLocaleString("en-US")}</span> markets, every one of
        them asked. Read at block{" "}
        <a
          href={explorerUrl(MORPHO_BASE_CHAIN_ID, "block", data.blockNumber)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external"
        >
          {data.blockNumber.toLocaleString("en-US")}
        </a>
        ; the market roster was censused at block {data.censusBlock.toLocaleString("en-US")}, so a market created since
        is not among those asked.
        {hidden > 0 && ` Showing the ${data.positions.length} largest of them.`}
      </p>

      {data.positions.map((p) => {
        // The same two legs the listing filtered on, so the card the row draws
        // cannot disagree with the status the builder gives it (§46).
        const borrowerSideLive = morphoHasCollateralRaw(p.collateralRaw) || morphoHasDebt(p.borrowSharesRaw);
        const hf = p.healthFactor;
        return (
          <Link key={p.marketId} href={hrefFor(p)} prefetch={false} className="group/listing-row block">
            {borrowerSideLive ? (
              <MorphoPositionCard
                v={{ ...morphoListedViewFromLive(p, wallet), vaultOwner: vault }}
                session="morpho-base"
                listedReceipts={LIVE_RECEIPTS}
                rowExtra={hf != null && hf > 0 ? <MorphoRiskSlot chain={p} /> : undefined}
              />
            ) : (
              <MorphoLenderOpenCard p={p} vault={vault} />
            )}
          </Link>
        );
      })}
    </div>
  );
}
