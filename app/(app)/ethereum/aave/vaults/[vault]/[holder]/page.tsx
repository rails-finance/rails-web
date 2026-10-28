// ONE HOLDING — /ethereum/aave/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// A holding is the pair `(vault, holder)`, and it has a path of its own the
// way a trove does. The page is the family header, the holder card, Lifetime
// flows and the Activity timeline (rails-ops ui-jobs 407 step 4). The holder is a SEGMENT rather than a query because it is
// the subject of the page, not a filter on the vault beside it: the card at the
// top of this page is the same card the section's listing draws for this pair,
// and clicking it is what brings a reader here.
//
// WHAT THE SEGMENT ACCEPTS. An address, or an ENS name — resolved here, on the
// server, through mainnet's Universal Resolver before any read runs, so a link
// to a reading is a link to that same reading. A name that resolves to nothing,
// and an input that is neither, are STATED here rather than 404ing: the vault
// is real and the question was asked, and the answer is that no address was
// found for what was typed. An address holding nothing is a reading too — the
// card and the sections below say so at the block they read at.
//
// THREE READS, ONE BLOCK. The vault and this address's balance are `eth_call`s
// at one pinned block; the card's census lane (transfers, first seen, what the
// holding address is) comes from the store through this deployment's own
// listing proxy; the timeline's log sweeps stream in behind a Suspense boundary
// and reuse the block the first read pinned. Two `eth_blockNumber` calls a
// second apart are two different moments, so nothing here reads a second one.
//
// The vault's own figures and its family's mechanic are NOT restated here: they
// are the vault card one path segment up.

import { vaultLifeChanges } from "@/lib/sources/chain/block-timestamps";
import { withChanges } from "@/lib/shared/flows-changes";
import { vaultTimelineNoteProv } from "@/lib/aave-vaults/vault-timeline-provenance";
import type { AaveVaultNote } from "@/lib/shared/vault-holder-timeline";
import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { AaveVaultTimeline } from "@/components/vaults/aave-vault-timeline";
import { VaultFlowsPanel } from "@/components/vaults/vault-flows-panel";
import { vaultFlowTimeline } from "@/lib/vaults/vault-flows";
import { vaultHoldingHistory, type VaultHoldingHistory } from "@/lib/vaults/earned";
import { VaultHoldingCard } from "@/components/vaults/vault-holding-card";
import { HoldingExplanation } from "@/components/vaults/holding-explanation";
import { HoldingReceiptsScope } from "@/components/vaults/holding-receipts-scope";
import { HolderShapeLine } from "@/components/vaults/holder-shape-line";
import { CatalogueMemberLink } from "@/components/vaults/aave-vault-holder-parts";
import { ExplainBullet, Fig } from "@/components/shared/explain-groups";
import { Prov } from "@/components/shared/provenance";
import { HOLDING_REWARDS, vaultHoldingContent } from "@/lib/vaults/card-words";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { LatestPrices, type LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { assetText } from "@/lib/shared/vault-amount-text";
import { cooldownSentence, cooldownWords } from "@/lib/aave-vaults/cooldown-words";
import {
  aaveAttestedNameProv,
  aaveUmbrellaWrapperClaimProv,
  aaveVaultCooldownStateProv,
  aaveVaultHolderShapeProv,
  aaveVaultSharePriceProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import { sectionPositionMetadata } from "@/lib/shared/page-metadata";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { resolveAaveVaultHolder } from "@/lib/aave-vaults/vault-holder";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { loadAaveEthereumVault, type AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import { loadAaveEthereumVaultTimelineWithTail } from "@/lib/sources/chain/aave-ethereum-vault-timeline";
import { computeVaultPositionEconomics } from "@/lib/aave-vaults/position-economics";
import { fetchVaultTail, putVaultTail } from "@/lib/api/fetch-vault-tail";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { AAVE_VAULT_TAIL_VERSION, type VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
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
const load = cache((vault: string, holder: string | undefined) => loadAaveEthereumVault(vault, holder));

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The holder's whole history in this vault, read once per request: the card's
 *  Earned, the Lifetime flows panel and the timeline all reduce the same rows
 *  (React's cache() hands every caller one promise).
 *
 *  It takes the BLOCK the vault loader already pinned rather than reading one
 *  of its own: the reading and the history are one claim about one moment.
 *  Every read inside it ends at that block, and each row's share price is
 *  called at that row's own block — never at "latest". */
const loadHistory = cache(async (data: AaveEthereumVaultResponse, holder: string) => {
  const shareDecimals = data.vault.shareDecimals!;
  // The stored tail, read BEFORE the loader so the loader can sweep a head
  // instead of a life. A tail that is absent, stale or wrong costs this page a
  // whole-life sweep and nothing else — the gate below runs on the merged rows
  // either way (lib/sources/chain/aave-ethereum-vault-timeline.ts).
  const hop = (await ssrHop()) ?? undefined;
  const tail = await fetchVaultTail({
    chainId: MAINNET_CHAIN_ID,
    vault: data.vault.address,
    holder,
    loaderVersion: AAVE_VAULT_TAIL_VERSION,
    ...hop,
  });

  const { timeline, store, allEvents, continueBuild } = await loadAaveEthereumVaultTimelineWithTail(
    data.vault.address,
    holder,
    {
      blockNumber: data.blockNumber,
      family: data.vault.family,
      shareDecimals,
      assetDecimals: data.vault.asset.decimals,
      tail,
    },
  );

  // The write is queued with `after()`: the response is not held for it, a
  // failure is a log line and nothing on the page, and the next request simply
  // offers the tail again.
  //
  // A HEAVY LIFE THEN KEEPS BUILDING BEHIND THE RESPONSE. `continueBuild` is
  // set only while a heavy life is being built; it builds the next chunk from
  // logs already in hand and stores it, over and over, until the head is built
  // or its own budget is spent. It runs after the first PUT was ACCEPTED,
  // because a chunk stored on top of one the store refused would be a cut that
  // skipped rows — or straight away when this request's first chunk stalled
  // and there was nothing to PUT.
  if (store || continueBuild)
    after(async () => {
      if (store && !(await putVaultTail(store, { ...hop })).ok) return;
      if (continueBuild) await continueBuild((next) => putVaultTail(next, { ...hop }));
    });

  const coords: VaultTimelineCoords = {
    blockNumber: data.blockNumber,
    vault: data.vault.address,
    vaultName: data.vault.name ?? undefined,
    assetSymbol: data.vault.asset.symbol,
    shareSymbol: data.vault.symbol ?? undefined,
    holder,
  };

  // ⚠️ THE TOWER IS REDUCED HERE, ON THE SERVER, OVER `allEvents` — the WHOLE
  // life, not the window the client is handed. `timeline.events` is capped at
  // `VAULT_TIMELINE_DRAW_ROWS` so that a 9,000-row life does not ship nine thousand rows
  // of RSC payload, and a tower summed from that slice would be a window's
  // arithmetic wearing a lifetime's caption.
  const economics = data.holder
    ? computeVaultPositionEconomics({
        timeline: { ...timeline, events: allEvents },
        coords,
        sharesRaw: data.holder.shares.raw,
        claimRaw: data.holder.claim?.raw ?? null,
        shareSymbol: data.vault.symbol ?? shortAddr(data.vault.address),
        shareDecimals,
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
          shareSymbol: data.vault.symbol ?? shortAddr(data.vault.address),
          shareDecimals,
          assetDecimals: data.vault.asset.decimals,
          blockNumber: timeline.blockNumber,
          blockTimestamp: timeline.blockTimestamp,
          sharesRaw: data.holder.shares.raw,
          claimRaw: data.holder.claim?.raw ?? null,
          vaultAddress: data.vault.address,
          assetAddress: data.vault.asset.address,
          chainId: MAINNET_CHAIN_ID,
          // The card's share price, the top row's: today's point.
          sharePriceNow:
            !data.chainStale && data.sharePrice != null && data.sharePrice.value > 0 ? data.sharePrice.value : null,
        })
      : null;

  // Earned over the same rows, under the panel's condition (decision 0048).
  const card = vaultHoldingHistory(allEvents, {
    shareDecimals,
    claimRaw: data.holder?.claim?.raw ?? null,
    blockNumber: data.blockNumber,
    replayed: economics != null && flowTimeline != null,
  });
  // The vault's configuration changes inside the life, marked on the events row (ruling 10).
  const changes = flowTimeline
    ? await vaultLifeChanges(MAINNET_CHAIN_ID, timeline.notes, allEvents, (n) =>
        vaultTimelineNoteProv(coords, n as AaveVaultNote),
      )
    : [];
  return { timeline, economics, flowTimeline: withChanges(flowTimeline, changes), card };
});

/** The Lifetime flows panel and the timeline, streamed in behind a Suspense
 *  boundary: their reads are log sweeps, and the card has painted first. */
async function VaultTimelineSection({
  data,
  holder,
  onEventPage,
}: {
  data: AaveEthereumVaultResponse;
  holder: string;
  onEventPage: boolean;
}) {
  // Without the share token's own `decimals()` there is no exponent to ask a
  // share price with, and inventing one would print a 6-decimal price 1e12 too
  // large. No reading, so no rows.
  if (data.vault.shareDecimals == null) return null;
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
          shareSymbol={data.vault.symbol ?? shortAddr(data.vault.address)}
          assetSymbol={data.vault.asset.symbol}
        />
      )}
      <AaveVaultTimeline
        timeline={timeline}
        family={data.vault.family}
        vaultName={data.vault.name}
        shareSymbol={data.vault.symbol}
        assetSymbol={data.vault.asset.symbol}
      />
    </>
  );
}

/** The holder card (components/vaults/vault-holding-card.tsx).
 *
 *  Its live figures are this page's reads at its block; its census figures
 *  (the transfer count, first seen, the dollar value, what the address is)
 *  come from the store through this deployment's listing proxy, where the
 *  census has a row. Earned is a promise over the history, so the card paints
 *  before the sweeps answer.
 *
 *  THE EXIT IS THE CONTRACT'S OWN FUNCTION, per family. sGHO and a static
 *  aToken redeem outright; an Umbrella stake token cannot be redeemed until a
 *  cooldown has been started and waited out, so its exit names both calls in
 *  the order they must happen. */
async function HoldingCardSection({ data, holder }: { data: AaveEthereumVaultResponse; holder: string }) {
  if (!data.holder) return null;
  const hop = (await ssrHop()) ?? undefined;
  let rows: VaultPositionRow[] = [];
  try {
    const page = await fetchVaultPositions({
      chainId: MAINNET_CHAIN_ID,
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
  const family = vault.family;
  const sd = vault.shareDecimals ?? census?.shareDecimals ?? 18;
  const shareSymbol = vault.symbol ?? shortAddr(vault.address);
  const coords: AaveVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name ?? undefined,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol ?? undefined,
    reserveSymbol: data.umbrella?.reserve?.symbol,
    holder: h.address,
  };
  const history: Promise<VaultHoldingHistory> =
    vault.shareDecimals == null
      ? Promise.resolve({ earned: { status: "unreplayed" as const, block: data.blockNumber }, firstSeen: null })
      : loadHistory(data, holder).then(
          (r) => r.card,
          () => ({ earned: { status: "unreplayed" as const, block: data.blockNumber }, firstSeen: null }),
        );
  const wrapper = data.umbrella?.wrapper;
  const reserve = data.umbrella?.reserve;
  const umbrella = family === "umbrella-stake";
  return (
    <VaultHoldingCard
      coords={{
        chainId: MAINNET_CHAIN_ID,
        blockNumber: data.blockNumber,
        vault: vault.address,
        vaultName: vault.name ?? undefined,
        shareSymbol,
        shareDecimals: sd,
        assetSymbol: vault.asset.symbol,
        assetDecimals: vault.asset.decimals,
        holder: h.address,
      }}
      family={family}
      venueMark
      vaultHref={ethereumVaultHref(vault.address)}
      holdingHref={ethereumVaultHref(vault.address, h.address)}
      assetAddress={vault.asset.address}
      shares={h.shares}
      claim={h.claim}
      totalSupply={data.totalSupply}
      dust={h.dust}
      maxWithdraw={h.maxWithdraw}
      maxRedeem={umbrella ? h.maxRedeem : undefined}
      exit={umbrella ? "cooldown(), then redeem()" : "redeem()"}
      cooldown={
        h.cooldown
          ? {
              state: h.cooldown.state,
              text: cooldownWords(h.cooldown),
              sentence: cooldownSentence(h.cooldown, sd),
              prov: aaveVaultCooldownStateProv(coords),
            }
          : undefined
      }
      census={census}
      history={history}
      learnMore={vaultHoldingContent(vault.asset.symbol, shareSymbol, census != null, HOLDING_REWARDS[family])}
      explanation={
        <HoldingExplanation
          blockNumber={data.blockNumber}
          censusBlock={census?.census.block ?? null}
          assetSymbol={vault.asset.symbol}
          rewards={HOLDING_REWARDS[family]}
          shape={
            h.shape ? (
              <HolderShapeLine
                shape={h.shape}
                blockNumber={data.blockNumber}
                chainId={MAINNET_CHAIN_ID}
                prov={aaveVaultHolderShapeProv(coords, h.shape.kind, h.shape.codeSize)}
                nameProv={h.shape.kind === "attested" ? aaveAttestedNameProv(coords, h.shape.attested) : undefined}
              />
            ) : undefined
          }
          extra={
            <>
              {h.catalogued && (
                <ExplainBullet data-figure="holder-catalogued">
                  It is itself <CatalogueMemberLink vault={h.catalogued} coords={coords} what="This holder" />, one
                  vault in Aave&rsquo;s layer holding another:{" "}
                  <Link
                    href={ethereumVaultsListingHref({ vault: h.catalogued.address })}
                    className={PAGE_LINK}
                    prefetch={false}
                    data-link="holder-vault-holders"
                    data-holder-vault-holders={h.catalogued.address}
                  >
                    its holders
                  </Link>
                  .
                </ExplainBullet>
              )}
              {wrapper && h.claim && wrapper.holderClaim && (
                <ExplainBullet>
                  Through the wrapper the claim is{" "}
                  <Fig>
                    <span data-figure="holder-wrapper-claim">
                      <Prov info={aaveUmbrellaWrapperClaimProv(coords, wrapper.symbol ?? "the wrapper")}>
                        {assetText(wrapper.holderClaim, reserve?.decimals ?? vault.asset.decimals)}
                      </Prov>
                    </span>{" "}
                    {reserve?.symbol ?? ""}
                  </Fig>
                  , a conversion at this block.
                </ExplainBullet>
              )}
            </>
          }
        />
      }
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault, holder } = await params;
  const address = vault.toLowerCase();
  if (!ADDRESS.test(address)) return { title: "Vault · Ethereum" };
  // Metadata is about the VAULT and the address AS TYPED: metadata must not
  // make a network call of its own, so no name is resolved here.
  const data = await load(address, undefined);
  if (!data.served) return { title: "Vault · Ethereum" };
  const name = data.vault.name || shortAddr(address);
  const subject = ADDRESS.test(holder) ? shortAddr(holder.toLowerCase()) : decodeURIComponent(holder);
  return sectionPositionMetadata({
    section: { label: "Vaults", chainId: MAINNET_CHAIN_ID },
    market: name,
    subject,
    canonicalPath: ethereumVaultHref(address, holder),
    description: `A Rails reading of this address's holding in the ${name} vault: shares, claim, earned, what is redeemable now, lifetime flows and every one of its own events, read from chain at one block.`,
    // The route's own opengraph-image.tsx draws this position's census row.
    image: "dynamic",
  });
}

export default async function AaveEthereumVaultPositionPage({ params }: Props) {
  const { vault, holder, eventId } = (await params) as Awaited<Props["params"]> & { eventId?: string };
  // The event route re-renders this page (ui-jobs 236): the sub-nav and the
  // event's card beside the shared column, nothing else.
  const onEventPage = eventId != null;
  const address = vault.toLowerCase();
  if (!ADDRESS.test(address)) notFound();

  const typed = decodeURIComponent(holder);
  const lookup = await resolveAaveVaultHolder(typed);
  const data = await load(address, lookup.address ?? undefined);
  // `served: false` is a CHAIN answer — the enumerators ran and did not name
  // this address. A read that FAILED leaves it true, so a bad minute on the RPC
  // never turns a real vault into a 404.
  if (!data.served) notFound();

  const vaultName = data.vault.name || shortAddr(address);
  const subject = lookup.address ? shortAddr(lookup.address) : typed;

  // The top row's price dropdown. A holder holds SHARES, and the one price
  // the vault states about them is its own `convertToAssets` — one whole
  // share in the vault's asset, read at the block this page names. No USD:
  // the vault's own stake token has no oracle Rails reads here.
  // Where the chain read failed the row still names the share and shows no
  // figure, because what is held is true whether or not the read landed.
  const sharePrice =
    !data.chainStale && data.sharePrice != null && data.sharePrice.value > 0 ? data.sharePrice.value : undefined;
  const shareAssets: LatestPriceAsset[] = [
    {
      symbol: data.vault.symbol ?? shortAddr(data.vault.address),
      address: data.vault.address,
      price: sharePrice,
      unit: sharePrice ? data.vault.asset.symbol : undefined,
      label: `One share in ${data.vault.asset.symbol}, the vault's own convertToAssets`,
      info: aaveVaultSharePriceProv(
        {
          blockNumber: data.blockNumber,
          vault: data.vault.address,
          vaultName: data.vault.name ?? undefined,
          assetSymbol: data.vault.asset.symbol,
          shareSymbol: data.vault.symbol ?? undefined,
          reserveSymbol: data.umbrella?.reserve?.symbol,
        },
        data.vault.shareDecimals ?? 18,
      ),
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
            session="aave-vaults"
            fallbackHref={ethereumVaultsListingHref()}
            assets={shareAssets}
            priceReason={ORACLE_USD_REASON["aave-vaults"]}
            owner={{
              wallet: lookup.address,
              ensName: lookup.ensName,
              filterProtocol: null,
              // The bookmark the card's wallet pill carried: the position page's
              // card leaves the wallet to this row.
            }}
            // The card's ⋮ carries the menu; the event route draws no card.
            tools={onEventPage}
          />
          {!onEventPage && (
            <>
              <h2
                className="text-2xl font-semibold text-foreground"
                data-vault-page={address}
                data-vault-family={data.vault.family}
              >
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
              {lookup.kind === "ens" && lookup.address && (
                <p className="mt-1 text-[11px] text-rb-500" data-holder-ens={lookup.typed}>
                  {lookup.typed} · resolved through mainnet ENS
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
              {/* The family; the card names the block. */}
              <span data-vault-block={data.blockNumber}>
                {AAVE_FAMILY_SINGULAR[data.vault.family]}, deployed by Aave
              </span>
              <Link href={ethereumVaultHref(address)} className={PAGE_LINK} prefetch={false} data-link="vault-market">
                {vaultName} <span aria-hidden>→</span>
              </Link>
              <Link
                href={ethereumVaultsListingHref({ vault: address })}
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
            That is neither of the two accepted forms. A holding is opened with a 20-byte address starting{" "}
            <code>0x</code>, or an ENS name ending <code>.eth</code>.
          </p>
        )}
        {lookup.error === "unresolved" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="unresolved">
            No address is recorded for {lookup.typed} on Ethereum mainnet at the time of this read.
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
