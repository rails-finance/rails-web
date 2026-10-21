"use client";

// Every Morpho Blue position one wallet holds on one wallet-first deployment
// (Base, Arbitrum) — one card each, and each card the way into its own page.
// Lifted from the Base page; the deployment (lib/morpho/page-deployment.ts)
// carries the routes, the links, the whole-life rule and the words.
//
// The Ethereum explorer's detail page is ONE (market, wallet) pair, because
// that is what its index hands you a link to. On Base the chain reads are
// wallet-scoped (lib/morpho-base/use-wallet-reads — the slots for the present,
// the sweep for the history), so this page is the wallet: it lists every
// market the wallet holds something in now or ever acted in, as the shared
// Morpho card in the listing's row grammar, and each row opens
// /base/morpho/<wallet>/<market> — the position, at the Ethereum grain, with
// its Lifetime flows and whole-life timeline. It used to stack all of that here, one
// market after another; a wallet in three markets was three explorer pages on
// one scroll.
//
// What the cards may claim follows the sweep: with every block read, the
// shared card stands (principal, peaks, the liquidation record, the live debt
// admitted when the replayed shares equal the slot); until then, or when the
// sweep could not read every block, the slot cards carry the present alone.

import { useMemo, type ReactNode } from "react";
import Link from "next/link";

import { retryWhen } from "@/hooks/useOverBudgetRetry";
import { MorphoPositionCard } from "@/components/protocol/morpho/morpho-position-card";
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
import { useMorphoBaseWalletReads } from "@/lib/morpho-base/use-wallet-reads";
import { makeListedMorphoReceipts, type ListedMorphoReceipts } from "@/lib/morpho/listed-card-provenance";
import type { MorphoPageDeployment } from "@/lib/morpho/page-deployment";
import { morphoListedViewFromLive, morphoViewFromSweep } from "@/lib/morpho/swept-position-view";
import { morphoHasCollateralRaw, morphoHasDebt } from "@/lib/morpho/position-legs";
import { explorerUrl } from "@/lib/shared/chains";
import { CaptureSourceProvider } from "@/lib/shared/capture-source";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { StoreFirstRead, SweepInFlight } from "@/components/shared/sweep-in-flight";

/** The receipts a hub row's LIVE card cites — the same head read of the
 *  singleton the position page's own live card names, not a listing row of
 *  its own. One per deployment, so the reference is stable across renders. */
const receiptsCache = new WeakMap<MorphoPageDeployment, ListedMorphoReceipts>();
export function morphoLiveReceipts(d: MorphoPageDeployment): ListedMorphoReceipts {
  let r = receiptsCache.get(d);
  if (!r) {
    r = makeListedMorphoReceipts({ chainId: d.chainId, positionsRoute: d.positionsRoute, custody: d.liveCustody });
    receiptsCache.set(d, r);
  }
  return r;
}

/** The section's own test: a market the wallet only ever LENT in gets the slot
 *  card or a closing statement, never the borrower-grammar card. */
const borrowerSide = (pos: MorphoSweptPosition): boolean =>
  pos.peakCollateral > 0 || pos.peakBorrowed > 0 || pos.lifetime.deposited > 0 || pos.lifetime.borrowed > 0;

export interface MorphoWalletViewProps {
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
  /** A line under the top row from the slot read (Arbitrum's dollar
   *  totals); none on Base. */
  summary?: (data: MorphoWalletChainResponse | null) => ReactNode;
}

export function MorphoWalletView({
  deployment: d,
  wallet,
  initialSlots,
  initialTimeline,
  vaultNote,
  summary,
}: MorphoWalletViewProps & { deployment: MorphoPageDeployment }) {
  const w = d.words;
  const {
    data,
    loading,
    error,
    timeline,
    timelineState,
    firstReadStalled,
    retryIn,
    sweptClean,
    captureSource,
    chainByMarket,
    unswept,
    untouched,
    emptyNow,
  } = useMorphoBaseWalletReads(wallet, initialSlots, initialTimeline, undefined, d);

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
          session={d.session}
          wallet={wallet}
          owner={{ wallet, vault: vaultNote }}
          assets={stripAssets}
          priceReason={ORACLE_USD_REASON[d.session]}
        />
        {summary?.(data)}

        {vaultNote ? (
          <p className="text-[12px] text-rb-500">
            This address is a MetaMorpho vault, {vaultNote.name}.{" "}
            <Link href={vaultNote.href} className={PAGE_LINK} prefetch={false}>
              Vault exposure <span aria-hidden>&rarr;</span>
            </Link>
          </p>
        ) : d.vaultHoldings ? (
          // Not itself a catalogued vault: it may still HOLD shares of one.
          // That is a chain read (see the component's own header), so it
          // mounts client-side rather than joining the SSR above.
          <VaultHoldingsNote wallet={wallet} />
        ) : null}

        {loading ? (
          <DetailBodySkeleton />
        ) : untouched ? (
          <div className="py-12 text-center text-rb-500">
            <p className="mb-1">{w.untouchedTitle}</p>
            <p className="text-sm">{w.untouchedBody((data?.marketsScanned ?? 0).toLocaleString("en-US"))}</p>
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
                <p className="mb-1">{w.emptyNowTitle}</p>
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
                hrefFor={(p) => d.positionHref(wallet, p.marketId)}
                vault={vaultNote}
                deployment={d}
              />
            )}

            {timelineState === "ready" && timeline ? (
              <div className="space-y-4">
                {!sweptClean && timeline.positions.length > 0 && (
                  <p className="text-sm text-rb-500">{w.notWholeWallet}</p>
                )}
                {!sweptClean &&
                  rows.map(({ pos }) => (
                    <Link
                      key={pos.marketId}
                      href={d.positionHref(wallet, pos.marketId)}
                      className={PAGE_LINK}
                      prefetch={false}
                    >
                      {pos.marketLabel} <span aria-hidden>→</span>
                    </Link>
                  ))}
                {unswept.length > 0 && (
                  <p className="text-sm text-rb-500">
                    {w.unswept(unswept.length === 1 ? "One market" : `${unswept.length} markets`)}
                    {unswept.length === 1 ? " It is" : " They are"} shown from the live read alone:
                  </p>
                )}
                {unswept.length > 0 && data && (
                  <LiveMarketRows
                    wallet={wallet}
                    data={{ ...data, positions: unswept, positionsFound: unswept.length }}
                    hrefFor={(p) => d.positionHref(wallet, p.marketId)}
                    vault={vaultNote}
                    deployment={d}
                  />
                )}
                {sweptClean && rows.length > 0 && (
                  <p className="text-[11px] text-rb-500">
                    <span className="text-foreground">{rows.length.toLocaleString("en-US")}</span>{" "}
                    {rows.length === 1 ? "position" : "positions"}, {w.wholeCount}
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
                      deployment={d}
                    />
                  ))}
              </div>
            ) : timelineState === "loading" ? (
              <SweepInFlight>{w.reading}</SweepInFlight>
            ) : timelineState === "first-read" ? (
              <StoreFirstRead words={w.firstRead} stalled={firstReadStalled} />
            ) : (
              <p
                className="py-6 text-center text-sm text-rb-500"
                data-history-over-budget={timelineState === "overBudget" ? "" : undefined}
              >
                {timelineState === "overBudget"
                  ? (w.overBudgetWallet?.(retryWhen(retryIn)) ?? w.unavailableWallet)
                  : timelineState === "unavailable"
                    ? w.unavailableWallet
                    : w.failedWallet}
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
  deployment: d,
}: {
  wallet: string;
  pos: MorphoSweptPosition;
  chain: MorphoChainPositionResponse | null;
  view: ReturnType<typeof morphoViewFromSweep>;
  /** Set when `wallet` (this page's own subject) is a catalogued MetaMorpho
   *  vault — the same note the page prints once above every card. */
  vault: { name: string; href: string } | null;
  deployment: MorphoPageDeployment;
}) {
  const href = d.positionHref(wallet, pos.marketId);
  const live = chain && !chain.chainStale ? chain : null;
  return (
    <Link href={href} prefetch={true} className="group/listing-row block">
      {!borrowerSide(pos) ? (
        live ? (
          <MorphoLenderOpenCard p={live} vault={vault} deployment={d} />
        ) : (
          <LenderClosedCard pos={pos} wallet={wallet} vault={vault} deployment={d} />
        )
      ) : (
        <MorphoPositionCard v={view} session={d.session} />
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
  deployment: d,
}: {
  wallet: string;
  data: MorphoWalletChainResponse;
  hrefFor: (p: MorphoChainPositionResponse) => string;
  /** Set when `wallet` is a catalogued MetaMorpho vault — see SummaryRow. */
  vault: { name: string; href: string } | null;
  deployment: MorphoPageDeployment;
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
          href={explorerUrl(d.chainId, "block", data.blockNumber)}
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
                session={d.session}
                listedReceipts={morphoLiveReceipts(d)}
              />
            ) : (
              <MorphoLenderOpenCard p={p} vault={vault} deployment={d} />
            )}
          </Link>
        );
      })}
    </div>
  );
}
