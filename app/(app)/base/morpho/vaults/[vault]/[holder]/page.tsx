// ONE HOLDING — /base/morpho/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// A holding is the pair `(vault, holder)`, and it has a path of its own the
// way a trove does. The page is the family header, the holder card, Lifetime
// flows and the Activity timeline (rails-ops ui-jobs 407 step 4). The holder is a SEGMENT rather than a query because it is
// the subject of the page, not a filter on the vault beside it: the card at the
// top of this page is the same card the position listing draws for this pair,
// and clicking it is what brings a reader here.
//
// WHAT THE SEGMENT ACCEPTS. An address, an ENS name, or a Basename — resolved
// here, on the server, before any read runs, so a link to a reading is a link
// to that same reading. A name that resolves to nothing, and an input that is
// neither, are STATED here rather than 404ing: the vault is real and the
// question was asked, and the answer is that no address was found for what was
// typed. An address holding nothing is a reading too — the card and the
// sections below say so at the block they read at.
//
// THREE READS, ONE BLOCK. The vault, this address's balance and its attributed
// slice of every Blue market are `eth_call`s at one pinned block; the card's
// census lane (transfers, first seen, what the holding address is) comes from
// the store through this deployment's own listing proxy; the timeline's log
// sweeps stream in behind a Suspense boundary and reuse the block the first
// read pinned. Two `eth_blockNumber` calls a second apart are two different
// moments, so nothing here reads a second one.
//
// THE HISTORY IS STORED BELOW FINALITY. Rows at or under the lane's own
// `finalized` block never change, so this page offers them to Rails's store
// after its own gate has passed, and a later request sweeps only the head above
// that cut. The cut is READ in the request that writes it — on Base the tag
// steps in jumps 643 to 795 blocks behind head, so a constant would be wrong
// within five minutes. A stored tail can make this page slow and never wrong:
// the gate runs on the merged rows every time, and one that fails discards the
// tail and sweeps the whole life.
//
// AND THE FLOOR PATH STORES NOTHING. Where the lane refuses this address's
// sweep on response size the count is a lower bound from a chunked walk, no
// gate ran, and no rows exist — so no tail is offered, and the page states "at
// least N" rather than N.

import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { MorphoBaseVaultTimeline } from "@/components/protocol/morpho-base/vault-timeline";
import { VaultFlowsPanel } from "@/components/vaults/vault-flows-panel";
import { vaultFlowTimeline } from "@/lib/vaults/vault-flows";
import { vaultHoldingHistory, type VaultHoldingHistory } from "@/lib/vaults/earned";
import { computeVaultPositionEconomics } from "@/lib/aave-vaults/position-economics";
import { VaultHoldingCard } from "@/components/vaults/vault-holding-card";
import { HoldingExplanation } from "@/components/vaults/holding-explanation";
import { HoldingReceiptsScope } from "@/components/vaults/holding-receipts-scope";
import { HolderShapeLine } from "@/components/vaults/holder-shape-line";
import { ExplainBullet, Fig } from "@/components/shared/explain-groups";
import { Prov } from "@/components/shared/provenance";
import { HOLDING_REWARDS, vaultHoldingContent } from "@/lib/vaults/card-words";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { holderListingSegment } from "@/lib/shared/protocols";
import { LatestPrices, type LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { assetText, shortId } from "@/lib/shared/vault-amount-text";
import {
  vaultAttributedProv,
  vaultAttributedTotalProv,
  vaultHolderShapeProv,
  vaultSharePriceProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import { sectionPositionMetadata } from "@/lib/shared/page-metadata";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_BASE_METAMORPHO_FACTORIES } from "@/lib/morpho-base/vault-catalog";
import { isMorphoBaseRosterVault } from "@/lib/morpho-base/vault-roster";
import { resolveHolder, type HolderLookup } from "@/lib/morpho-base/vault-holder";
import { baseVaultHref, baseVaultsListingHref } from "@/lib/vaults/routes";
import { loadMorphoBaseVault, type MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import { loadMorphoBaseVaultTimelineWithTail } from "@/lib/sources/chain/morpho-base-vault-timeline";
import { fetchVaultTail, putVaultTail } from "@/lib/api/fetch-vault-tail";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { MORPHO_BASE_VAULT_TAIL_VERSION, type VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
import type { VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import { BlockRef } from "@/components/shared/block-ref";

// Every figure is a call at the head with the holder in the path — nothing
// about this is cacheable across requests.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ vault: string; holder: string }>;
};

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((vault: string, holder: string | undefined) => loadMorphoBaseVault(vault, holder));

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The holder's whole history in this vault, read once per request: the card's
 *  Earned and the Lifetime flows panel and the timeline below it all reduce the
 *  same rows (React's cache() hands every caller one promise).
 *
 *  It takes the BLOCK the vault loader already pinned rather than reading one
 *  of its own: the reading and the history are one claim about one moment, and
 *  two `eth_blockNumber` calls a second apart are two different moments. Every
 *  read inside it ends at that block, each row's share price is called at that
 *  row's own block, and the sweeps start at the vault's own creation block. */
const loadHistory = cache(async (data: MorphoBaseVaultResponse, holder: string) => {
  // The stored tail, read BEFORE the loader so the loader can sweep a head
  // instead of a life. A tail that is absent, stale or wrong costs this page a
  // whole-life sweep and nothing else — the gate runs on the merged rows either
  // way (lib/sources/chain/morpho-base-vault-timeline.ts).
  const hop = (await ssrHop()) ?? undefined;
  const tail = await fetchVaultTail({
    chainId: BASE_CHAIN_ID,
    vault: data.vault.address,
    holder,
    loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
    ...hop,
  });

  const { timeline, store, allEvents, continueBuild } = await loadMorphoBaseVaultTimelineWithTail(
    data.vault.address,
    holder,
    {
      blockNumber: data.blockNumber,
      fromBlock: data.vault.createdBlock,
      shareDecimals: data.vault.decimals,
      assetDecimals: data.vault.asset.decimals,
      tail,
    },
  );

  // The write is queued with `after()`: the response is not held for it, a
  // failure is a log line and nothing on the page, and the next request simply
  // offers the tail again.
  //
  // A HEAVY LIFE THEN KEEPS BUILDING BEHIND THE RESPONSE. `continueBuild` is
  // set only while a heavy life is being built. It runs after the first PUT
  // was ACCEPTED, because a chunk stored on top of one the store refused would
  // be a cut that skipped rows — or straight away when this request's first
  // chunk stalled and there was nothing to PUT.
  if (store || continueBuild)
    after(async () => {
      if (store && !(await putVaultTail(store, { ...hop })).ok) return;
      if (continueBuild) await continueBuild((next) => putVaultTail(next, { ...hop }));
    });

  const coords: VaultTimelineCoords = {
    blockNumber: data.blockNumber,
    vault: data.vault.address,
    vaultName: data.vault.name || undefined,
    assetSymbol: data.vault.asset.symbol,
    shareSymbol: data.vault.symbol || undefined,
    holder,
  };

  // ⚠️ THE TOWER IS REDUCED HERE, ON THE SERVER, OVER `allEvents` — the WHOLE
  // life, not the window the client is handed. `timeline.events` is capped at
  // `VAULT_TIMELINE_DRAW_ROWS`, and a tower summed from that slice would be a
  // window's arithmetic wearing a lifetime's caption.
  const economics = data.holder
    ? computeVaultPositionEconomics({
        timeline: { ...timeline, events: allEvents },
        coords,
        sharesRaw: data.holder.shares.raw,
        claimRaw: data.holder.claim?.raw ?? null,
        shareSymbol: data.vault.symbol || shortAddr(data.vault.address),
        shareDecimals: data.vault.decimals,
        assetSymbol: data.vault.asset.symbol,
        assetDecimals: data.vault.asset.decimals,
        vaultAddress: data.vault.address,
        assetAddress: data.vault.asset.address,
      })
    : null;

  // The panel's day rows over the same whole life, where the gate passed.
  const flowTimeline =
    economics && data.holder
      ? vaultFlowTimeline(allEvents, {
          assetSymbol: data.vault.asset.symbol,
          shareSymbol: data.vault.symbol || shortAddr(data.vault.address),
          shareDecimals: data.vault.decimals,
          assetDecimals: data.vault.asset.decimals,
          blockNumber: timeline.blockNumber,
          blockTimestamp: timeline.blockTimestamp,
          sharesRaw: data.holder.shares.raw,
          claimRaw: data.holder.claim?.raw ?? null,
          vaultAddress: data.vault.address,
          assetAddress: data.vault.asset.address,
        })
      : null;

  // Earned over the same rows, under the panel's condition (decision 0048).
  const card = vaultHoldingHistory(allEvents, {
    shareDecimals: data.vault.decimals,
    claimRaw: data.holder?.claim?.raw ?? null,
    blockNumber: data.blockNumber,
    replayed: economics != null && flowTimeline != null,
  });
  return { timeline, economics, flowTimeline, card };
});

/** The Lifetime flows panel and the timeline, streamed in behind a Suspense
 *  boundary: their reads are log sweeps, and the card has painted first. */
async function VaultTimelineSection({
  data,
  holder,
  onEventPage,
}: {
  data: MorphoBaseVaultResponse;
  holder: string;
  onEventPage: boolean;
}) {
  const { timeline, economics, flowTimeline } = await loadHistory(data, holder);
  return (
    <>
      {/* The Lifetime flows panel, drawn under the condition the rows are: the
          feeder answers null on every path the gate refused. */}
      {!onEventPage && data.holder && (
        <VaultFlowsPanel
          computed={economics}
          timeline={flowTimeline}
          holder={holder}
          blockNumber={timeline.blockNumber}
          sharesRaw={data.holder.shares.raw}
          claimRaw={data.holder.claim?.raw ?? null}
          shareSymbol={data.vault.symbol || shortAddr(data.vault.address)}
          assetSymbol={data.vault.asset.symbol}
        />
      )}
      <MorphoBaseVaultTimeline
        timeline={timeline}
        vaultName={data.vault.name || null}
        shareSymbol={data.vault.symbol || null}
        assetSymbol={data.vault.asset.symbol}
        decimalsOffset={data.vault.decimalsOffset}
      />
    </>
  );
}

/** The holder card (components/vaults/vault-holding-card.tsx).
 *
 *  Its live figures are this page's reads at its block; its census figures
 *  (the transfer count, first seen, the dollar value, what the address is)
 *  come from the store through this deployment's listing proxy, where the
 *  census has a row. An address first seen since the last daily tick has none,
 *  and the card draws without those figures. Earned is a promise over the
 *  history, so the card paints before the sweeps answer. */
async function HoldingCardSection({ data, holder }: { data: MorphoBaseVaultResponse; holder: string }) {
  if (!data.holder) return null;
  const hop = (await ssrHop()) ?? undefined;
  let rows: VaultPositionRow[] = [];
  try {
    const page = await fetchVaultPositions({
      chainId: BASE_CHAIN_ID,
      vault: data.vault.address,
      q: holder,
      limit: 1,
      ...hop,
    });
    rows = page.data;
  } catch (error) {
    console.error("The holder card's census row did not answer:", error);
  }
  const census = rows.find((r) => r.holder.toLowerCase() === holder.toLowerCase()) ?? null;
  const { vault } = data;
  const h = data.holder;
  const shareSymbol = vault.symbol || shortAddr(vault.address);
  const coords: MorphoVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name || undefined,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol || undefined,
    holder: h.address,
  };
  const history: Promise<VaultHoldingHistory> = loadHistory(data, holder).then(
    (r) => r.card,
    () => ({ earned: { status: "unreplayed" as const, block: data.blockNumber }, firstSeen: null }),
  );
  const markets = data.legs.map((leg) => ({
    id: leg.id,
    label: leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id)),
    raw: leg.attributed?.raw ?? "0",
    prov: vaultAttributedProv({ ...coords, marketId: leg.id, collateralSymbol: leg.collateralSymbol }),
  }));
  return (
    <VaultHoldingCard
      coords={{
        chainId: BASE_CHAIN_ID,
        blockNumber: data.blockNumber,
        vault: vault.address,
        vaultName: vault.name || undefined,
        shareSymbol,
        shareDecimals: vault.decimals,
        assetSymbol: vault.asset.symbol,
        assetDecimals: vault.asset.decimals,
        holder: h.address,
      }}
      family="morpho"
      venueMark
      vaultHref={baseVaultHref(vault.address)}
      holdingHref={baseVaultHref(vault.address, h.address)}
      assetAddress={vault.asset.address}
      shares={h.shares}
      claim={h.claim}
      totalSupply={data.totalSupply}
      dust={h.dust}
      maxWithdraw={h.maxWithdraw}
      // ERC-4626 offers both, and which one a holder uses decides which side
      // is exact: `withdraw()` names an amount of the asset, `redeem()` a count
      // of shares.
      exit="withdraw() or redeem()"
      census={census}
      markets={markets}
      history={history}
      learnMore={vaultHoldingContent(vault.asset.symbol, shareSymbol, census != null, HOLDING_REWARDS.morpho)}
      explanation={
        <HoldingExplanation
          blockNumber={data.blockNumber}
          censusBlock={census?.census.block ?? null}
          assetSymbol={vault.asset.symbol}
          rewards={HOLDING_REWARDS.morpho}
          shape={
            h.shape ? (
              <HolderShapeLine
                shape={h.shape}
                blockNumber={data.blockNumber}
                chainId={BASE_CHAIN_ID}
                prov={vaultHolderShapeProv(coords, h.shape)}
              />
            ) : undefined
          }
          extra={
            <ExplainBullet data-attribution-explanation="">
              Claim by market applies this holding&rsquo;s share of the vault to each market&rsquo;s settled assets; its
              sum,{" "}
              <Fig>
                <Prov info={vaultAttributedTotalProv(coords)}>
                  <span data-figure="attributed-total" data-attributed-total-raw={h.attributedTotal.raw}>
                    {assetText(h.attributedTotal, vault.asset.decimals)} {vault.asset.symbol}
                  </span>
                </Prov>
              </Fig>
              , differs slightly from the claim, which the vault extrapolates to this block.
            </ExplainBullet>
          }
        />
      }
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault, holder } = await params;
  const address = vault.toLowerCase();
  if (!(await isMorphoBaseRosterVault(address))) return { title: "Vault · Base" };
  // Metadata is about the VAULT and the address AS TYPED: metadata must not
  // make a network call of its own, so no name is resolved here.
  const data = await load(address, undefined);
  const name = data.vault.name || shortAddr(address);
  const subject = ADDRESS.test(holder) ? shortAddr(holder.toLowerCase()) : decodeURIComponent(holder);
  return sectionPositionMetadata({
    section: { label: "Vaults", chainId: BASE_CHAIN_ID },
    market: name,
    subject,
    canonicalPath: baseVaultHref(address, holder),
    description: `A Rails reading of this address's holding in the ${name} vault on Base: shares, claim, earned, what is redeemable now, lifetime flows and every one of its own events, read from chain at one block.`,
    // The route's own opengraph-image.tsx draws this position's census row.
    image: "dynamic",
  });
}

export default async function MorphoBaseVaultPositionPage({ params }: Props) {
  const { vault, holder, eventId } = (await params) as Awaited<Props["params"]> & { eventId?: string };
  // The event route re-renders this page (ui-jobs 236): the sub-nav and the
  // event's card beside the shared column, nothing else.
  const onEventPage = eventId != null;
  const address = vault.toLowerCase();
  if (!(await isMorphoBaseRosterVault(address))) notFound();

  const typed = decodeURIComponent(holder);
  const lookup = await resolveHolder(typed);
  const data = await load(address, lookup.address ?? undefined);

  const vaultName = data.vault.name || shortAddr(address);
  const subject = lookup.address ? shortAddr(lookup.address) : typed;
  const factory = MORPHO_BASE_METAMORPHO_FACTORIES.find((f) => f.version === data.vault.factory);

  // The top row's price dropdown. A holder holds SHARES, and the one price the
  // vault states about them is its own `convertToAssets` — one whole share in
  // the vault's asset, read at the block this page names. No USD: Morpho Blue runs no USD oracle, so the figure stays in the
  // vault's own asset.
  // Where the chain read failed the row still names the share and shows no
  // figure, because what is held is true whether or not the read landed.
  const shareAssets: LatestPriceAsset[] = [
    {
      symbol: data.vault.symbol || shortAddr(data.vault.address),
      address: data.vault.address,
      price: !data.chainStale && data.sharePrice.value > 0 ? data.sharePrice.value : undefined,
      unit: !data.chainStale && data.sharePrice.value > 0 ? data.vault.asset.symbol : undefined,
      label: `One share in ${data.vault.asset.symbol}, the vault's own convertToAssets`,
      info: vaultSharePriceProv({
        blockNumber: data.blockNumber,
        vault: data.vault.address,
        vaultName: data.vault.name || undefined,
        assetSymbol: data.vault.asset.symbol,
        shareSymbol: data.vault.symbol || undefined,
      }),
    },
  ];

  const timelineSlot = data.holder ? (
    <Suspense
      fallback={
        <div className="mb-6" data-skel-section="vault-timeline-pending">
          <SkeletonBlock height={180} />
        </div>
      }
    >
      <VaultTimelineSection data={data} holder={data.holder.address} onEventPage={onEventPage} />
    </Suspense>
  ) : null;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          {/* Smart-back returns the reader wherever they came from; a fresh tab
              lands on the vault section's listing. The price and recency strip
              sits in the holder's address row, Back stands alone, and Tools
              closes the row. The share is quoted in the vault's asset. */}
          <DetailTopRow
            session="morpho-base"
            fallbackHref={baseVaultsListingHref()}
            assets={shareAssets}
            priceReason={ORACLE_USD_REASON["morpho-base"]}
            owner={{
              wallet: lookup.address,
              ensName: lookup.ensName,
              filterProtocol: null,
              // The bookmark the card's wallet pill carried: the position page's
              // card leaves the wallet to this row.
              bookmarkProtocol: "morpho-base",
              bookmarkListing: holderListingSegment("morpho-base"),
            }}
            // The card's ⋮ carries the menu; the event route draws no card.
            tools={onEventPage}
          />
          {!onEventPage && (
            <>
              <h2 className="text-2xl font-semibold text-foreground" data-vault-page={address}>
                {/* The wallet heading above names a resolved holder. */}
                {!lookup.address && <span className="font-mono">{subject}</span>}
                <span className={`${lookup.address ? "" : "ml-2 "}text-base font-normal text-rb-500`}>
                  in {vaultName}
                </span>
              </h2>
              {/* How the subject was REACHED — a fact about the page rather than
              about the address, and stated here because the header is always
              drawn. The card below carries the identity itself; the census has
              no row for an address it has never seen, so a card is not
              somewhere this note could always live. */}
              {lookup.lane === "ens" && lookup.address && (
                <p className="mt-1 text-[11px] text-rb-500" data-holder-ens={lookup.typed}>
                  {lookup.typed} · resolved through mainnet ENS
                </p>
              )}
              {lookup.lane === "basename" && lookup.address && (
                <p className="mt-1 text-[11px] text-rb-500" data-holder-basename={lookup.typed}>
                  {lookup.typed} · resolved through Basenames on Base
                </p>
              )}
            </>
          )}
          {data.chainStale ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for this address in it.
            </p>
          ) : onEventPage ? null : (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-rb-500">
              {/* The family and the factory; the card names the block. */}
              <span data-vault-block={data.blockNumber}>
                MetaMorpho {data.vault.factory}
                {factory && (
                  <>
                    {" · "}
                    <a
                      href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", factory.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-external"
                    >
                      factory
                    </a>
                  </>
                )}
              </span>
              <Link href={baseVaultHref(address)} className={PAGE_LINK} prefetch={false} data-link="vault-market">
                {vaultName} <span aria-hidden>→</span>
              </Link>
              <Link
                href={baseVaultsListingHref({ vault: address })}
                className={PAGE_LINK}
                prefetch={false}
                data-link="vault-positions"
                data-positions-vault={address}
              >
                Every holder <span aria-hidden>→</span>
              </Link>
            </p>
          )}
        </header>

        {/* An input that named no address is a stated reading, not a 404: the
            vault is real, the question was asked, and this is the answer to
            what was typed. */}
        {lookup.error === "invalid" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="invalid">
            That is none of the accepted forms. A holding is opened with a 20-byte address starting <code>0x</code>, an
            ENS name ending <code>.eth</code>, or a Basename ending <code>.base.eth</code>.
          </p>
        )}
        {lookup.error === "unresolved" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="unresolved">
            No address is recorded for {lookup.typed} on Ethereum mainnet at the time of this read.
          </p>
        )}
        {lookup.error === "unresolved-basename" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="unresolved-basename">
            No address is recorded for {lookup.typed} on Basenames on Base at the time of this read.
          </p>
        )}

        {!data.chainStale && !onEventPage && data.holder && (
          <Suspense
            fallback={
              <div className="mb-6" data-skel-section="vault-position-card-pending">
                <SkeletonBlock height={120} />
              </div>
            }
          >
            <HoldingCardSection data={data} holder={data.holder.address} />
          </Suspense>
        )}
        {!data.chainStale && timelineSlot && <HoldingReceiptsScope>{timelineSlot}</HoldingReceiptsScope>}

        <ProvInspectorLayer />
      </div>
    </div>
  );
}
