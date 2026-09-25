// ONE POSITION — /base/morpho/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// A position is the pair `(vault, holder)`, and it has a path of its own the
// way a trove does. The holder is a SEGMENT rather than a query because it is
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
import { MorphoBaseVaultExposureView } from "@/components/protocol/morpho-base/vault-exposure-view";
import { MorphoBaseVaultTimeline } from "@/components/protocol/morpho-base/vault-timeline";
import { VaultFlowsTower } from "@/components/vaults/vault-flows-tower";
import { computeVaultPositionEconomics } from "@/lib/aave-vaults/position-economics";
import { VaultPositionCard } from "@/components/vaults/vault-position-card";
import { VaultContextStrip, VaultContextStripStandalone } from "@/components/vaults/vault-context-strip";
import { RiskFooterStrip } from "@/components/shared/risk-footer-strip";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { LatestPrices } from "@/components/shared/latest-prices";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { assetText } from "@/lib/shared/vault-amount-text";
import { vaultHolderMaxWithdrawProv, type MorphoVaultCoords } from "@/lib/morpho-base/vault-provenance";
import { sectionPositionMetadata } from "@/lib/shared/page-metadata";
import { aaveVaultPositionContent } from "@/lib/shared/learn-more-content";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { RailHeader } from "@/components/shared/rail-header";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_BASE_METAMORPHO_FACTORIES } from "@/lib/morpho-base/vault-catalog";
import { isMorphoBaseRosterVault } from "@/lib/morpho-base/vault-roster";
import { resolveHolder, type HolderLookup } from "@/lib/morpho-base/vault-holder";
import { morphoBaseWalletHref } from "@/lib/morpho-base/routes";
import { baseVaultHref, baseVaultsListingHref } from "@/lib/vaults/routes";
import { loadMorphoBaseVault, type MorphoBaseVaultResponse } from "@/lib/sources/chain/morpho-base-vault";
import { loadMorphoBaseVaultTimelineWithTail } from "@/lib/sources/chain/morpho-base-vault-timeline";
import { fetchVaultTail, putVaultTail } from "@/lib/api/fetch-vault-tail";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { MORPHO_BASE_VAULT_TAIL_VERSION, type VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
import type { VaultPositionRow } from "@/lib/aave-vaults/vault-position";

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

/** The holder's own events in this vault, streamed in beside the reading.
 *
 *  It takes the BLOCK the vault loader already pinned rather than reading one
 *  of its own: the reading and the history are one claim about one moment, and
 *  two `eth_blockNumber` calls a second apart are two different moments. Every
 *  read inside it ends at that block, each row's share price is called at that
 *  row's own block, and the sweeps start at the vault's own creation block —
 *  there is nothing to find before a vault exists.
 *
 *  Rendered inside a `<Suspense>` because its reads are log sweeps and the rest
 *  of the page is `eth_call`s that have already answered; the vault's figures
 *  paint first and this arrives when the chain has spoken. */
async function VaultTimelineSection({ data, holder }: { data: MorphoBaseVaultResponse; holder: string }) {
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

  return (
    <>
      {/* The lifetime flows, drawn under exactly the condition the rows are —
          the feeder answers null on every path the gate refused. */}
      {data.holder && (
        <VaultFlowsTower
          computed={economics}
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

/** The listing's own card for this `(vault, holder)` pair, with receipts.
 *
 *  Its CENSUS lane — transfers, first seen, last activity, what the holding
 *  address is — comes from the store through this deployment's own listing
 *  proxy, which is the only place that set exists. Its LIVE lane is replaced
 *  with the page's OWN reading, so the card and the sections under it state one
 *  block rather than two; the proxy's block timestamps are kept, because a
 *  block's timestamp is the same fact whichever request read it.
 *
 *  Null where the census has no row for this address. That is a fact about the
 *  census — a daily sweep, and an address that first appeared since the last
 *  tick has no row yet — and it says nothing about the reading below it. */
async function VaultPositionCardSection({
  data,
  holder,
  lookup,
}: {
  data: MorphoBaseVaultResponse;
  holder: string;
  lookup: HolderLookup;
}) {
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
    console.error("The vault position card's census row did not answer:", error);
  }
  const row = rows.find((r) => r.holder.toLowerCase() === holder.toLowerCase());
  const strip = vaultContextStrip(data);
  // THE CENSUS HAS NO ROW, AND THE READING IS STILL A READING — the same
  // statement the Ethereum page makes, for the same reason. What can be
  // withdrawn at this block and the exit are calls this page made itself.
  if (!row)
    return (
      <VaultContextStripStandalone
        {...strip}
        absence={`The census has no row for this address in this vault yet — it sweeps once a day, and an address first seen since the last tick has none. Nothing above or below depends on it: every figure on this page is a call answered at block ${data.blockNumber.toLocaleString("en-US")}.`}
      />
    );

  const onPage: VaultPositionRow = {
    ...row,
    shareDecimals: data.vault.decimals,
    symbol: data.vault.symbol || row.symbol,
    asset: {
      address: data.vault.asset.address,
      symbol: data.vault.asset.symbol,
      decimals: data.vault.asset.decimals,
    },
    live: {
      blockNumber: data.blockNumber,
      shares: data.holder.shares,
      claim: data.holder.claim,
      totalSupply: data.totalSupply,
      live: BigInt(data.holder.shares.raw) > BigInt(0),
    },
  };
  return (
    // `data-max-withdraw-raw` is the loader's own answer for this address at
    // this block, stated as data so a check reads the wei rather than the
    // printed words. The section's siblings on the other chain state
    // `data-max-redeem-raw` in the same place and for the same reason.
    <div className="mb-6" data-max-withdraw-raw={data.holder.maxWithdraw?.raw ?? ""}>
      <VaultPositionCard
        row={onPage}
        receipts
        holderIdentity={{ ensName: lookup.ensName }}
        // The same "?" the Ethereum position card carries, on this chain's own
        // family: what each figure on the card is a reading of, and what the
        // section refuses to state. It is where the prose that left the
        // listing's face stays reachable from inside a position view.
        learnMore={aaveVaultPositionContent("morpho", data.vault.asset.symbol, data.vault.symbol)}
        rowExtra={
          <RiskFooterStrip>
            <VaultContextStrip {...strip} />
          </RiskFooterStrip>
        }
        explanation={<PositionCardExplanation row={onPage} maxWithdrawRead={data.holder.maxWithdraw != null} />}
      />
    </div>
  );
}

/** What the card's context strip says for THIS reading. A MetaMorpho vault has
 *  no cooldown and no queue for a holder to join: a withdrawal is refused only
 *  by what the markets in the withdraw queue can pay at that block, which is
 *  exactly what `maxWithdraw` answers — so the strip states that figure and the
 *  two functions a holder leaves through, and nothing else. */
function vaultContextStrip(data: MorphoBaseVaultResponse) {
  const holder = data.holder!;
  const { vault } = data;
  const coords: MorphoVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name || undefined,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol || undefined,
    holder: holder.address,
  };
  return {
    redeemable: holder.maxWithdraw
      ? {
          text: `${assetText(holder.maxWithdraw, vault.asset.decimals)} ${vault.asset.symbol}`,
          prov: vaultHolderMaxWithdrawProv(coords),
          figure: "holder-max-withdraw" as const,
        }
      : { unread: true as const, figure: "holder-max-withdraw" as const },
    // ERC-4626 offers both, and which one a holder uses decides which side is
    // exact: `withdraw()` names an amount of the asset, `redeem()` names a
    // count of shares. Both are the vault's own functions and neither is a
    // recommendation.
    exit: "withdraw() or redeem()",
  };
}

/** The card's Explanation pane — facts only, and its whole subject is WHICH
 *  LANE each figure came from, because the card is the one surface on this page
 *  that draws two: a live reading at the page's block and a counted set from
 *  the daily census at the census block. */
function PositionCardExplanation({ row, maxWithdrawRead }: { row: VaultPositionRow; maxWithdrawRead: boolean }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const items = [
    `Shares, claim and share of the vault are calls answered at block ${n(row.live?.blockNumber ?? 0)} — the same block every figure under this card is read at.`,
    maxWithdrawRead
      ? `"Redeemable now" on the row above is the vault's own maxWithdraw() for this address at that same block, in ${row.asset?.symbol ?? "the vault's asset"} — what the vault says could be taken out then, bounded by the liquidity of the markets in its withdraw queue at that block. It is not the claim beside it and it is not a promise about the next block.`
      : `"Redeemable now" is stated as not read: the vault's own maxWithdraw() did not answer for this address at block ${n(row.live?.blockNumber ?? 0)}, and an unread call is said rather than shown as a zero.`,
    `Transfers, first seen and last activity are counted by the census: one whole-Transfer sweep of this vault from its own creation block, proven complete by Σ balanceOf equalling totalSupply() wei-exact, swept to block ${n(row.census.block)}.`,
    `The claim is the vault's own convertToAssets of this exact balance, in ${row.asset?.symbol ?? "the vault's asset"} — never shares multiplied by a price.`,
    row.value.usdE8 != null
      ? `Value · USD is the census's figure at block ${n(row.value.pricedBlock ?? row.census.block)}: the balance at that block through the vault's own convertToAssets and the chain's Aave V3 oracle (IAaveOracle.getAssetPrice) at the same block, the oracle named on its receipt — computed once by the daily census and never read for this page, so it says what the position was worth then and nothing about now.`
      : row.value.pricedBlock == null
        ? "Value · USD is stated as not priced: the daily census has not yet run its price pass over this vault, so no oracle was asked."
        : `Value · USD is stated as not priced: the chain's Aave V3 oracle declined ${row.value.assetSymbol ?? "this vault's asset"} at block ${n(row.value.pricedBlock)} — reverted or answered zero — and the card carries an empty slot rather than a figure from some other feed.`,
    "Nothing here is annualised; the blocks are stated rather than reconciled into one.",
  ];
  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">This card draws two lanes, and each figure names the block its own lane read.</p>
      {items.map((text) => (
        <div key={text} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">&bull;</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
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
    description: `A Rails reading of this address's position in the ${name} vault on Base: shares, claim, what is redeemable now, lifetime flows and every one of its own events, read from chain at one block in native units.`,
    // The route's own opengraph-image.tsx draws this position's census row.
    image: "dynamic",
  });
}

export default async function MorphoBaseVaultPositionPage({ params }: Props) {
  const { vault, holder } = await params;
  const address = vault.toLowerCase();
  if (!(await isMorphoBaseRosterVault(address))) notFound();

  const typed = decodeURIComponent(holder);
  const lookup = await resolveHolder(typed);
  const data = await load(address, lookup.address ?? undefined);

  const vaultName = data.vault.name || shortAddr(address);
  const subject = lookup.address ? shortAddr(lookup.address) : typed;
  const factory = MORPHO_BASE_METAMORPHO_FACTORIES.find((f) => f.version === data.vault.factory);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <div className="mb-4">
            <RailHeader session="morpho-base" venue="position" />
          </div>
          {/* Smart-back returns the reader wherever they came from; the
              fallback — a fresh tab, a pasted link — is the position listing
              under the vault roster. */}
          {/* The one thin row of "latest" (rails-ops TO-DO-ui-jobs 48): back,
              the chain head and its age, and the holding's assets at their
              current prices — empty here until this section prices them —
              with the page's instruments in Tools at the right end. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2" data-back-row>
            <div className="flex min-w-0 items-center gap-2">
              <DetailBackButton fallbackHref={baseVaultsListingHref()} compact />
              <RecencyStamp />
              <LatestPrices assets={[]} />
            </div>
            <ToolsMenu />
          </div>
          <h1 className="text-2xl font-semibold text-foreground" data-vault-page={address}>
            <span className="font-mono">{subject}</span>
            <span className="ml-2 text-base font-normal text-rb-500">in {vaultName}</span>
          </h1>
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

          {data.chainStale ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for this address in it. The page
              states nothing it could not read.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[12px] text-rb-500">
                {/* The venue is on the rail above by construction now
                    (rails-ops decision 0028), so this line names the standard
                    and the factory version and carries no link of its own. */}
                MetaMorpho {data.vault.factory} on Morpho Blue
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
                {" · shares "}
                <a
                  href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external font-mono"
                >
                  {shortAddr(address)}
                </a>
              </p>
              <p className="mt-2 text-[11px] text-rb-500" data-vault-block={data.blockNumber}>
                Read at block{" "}
                <a
                  href={explorerUrl(MORPHO_BASE_CHAIN_ID, "block", data.blockNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {data.blockNumber.toLocaleString("en-US")}
                </a>{" "}
                · every figure read at this block is a call answered at it, on this vault and on the{" "}
                <a
                  href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", data.vault.morpho)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  Morpho Blue singleton
                </a>
                .
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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
                  Every address that has held this vault <span aria-hidden>→</span>
                </Link>
                <Link href={morphoBaseWalletHref(address)} className={PAGE_LINK} prefetch={false}>
                  This vault&rsquo;s own positions on Morpho Blue <span aria-hidden>→</span>
                </Link>
              </p>
            </>
          )}
        </header>

        {/* An input that named no address is a stated reading, not a 404: the
            vault is real, the question was asked, and this is the answer to
            what was typed. */}
        {lookup.error === "invalid" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="invalid">
            That is none of the accepted forms. A position is opened with a 20-byte address starting <code>0x</code>, an
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

        {!data.chainStale && (
          <MorphoBaseVaultExposureView
            data={data}
            lookup={lookup}
            showLookup={false}
            positionCard={
              data.holder ? (
                <Suspense
                  fallback={
                    <div className="mb-6" data-skel-section="vault-position-card-pending">
                      <SkeletonBlock height={120} />
                    </div>
                  }
                >
                  <VaultPositionCardSection data={data} holder={data.holder.address} lookup={lookup} />
                </Suspense>
              ) : null
            }
            timeline={
              data.holder ? (
                <Suspense
                  fallback={
                    <div className="mb-6" data-skel-section="vault-timeline-pending">
                      <SkeletonBlock height={180} />
                    </div>
                  }
                >
                  <VaultTimelineSection data={data} holder={data.holder.address} />
                </Suspense>
              ) : null
            }
          />
        )}

        <ProvInspectorLayer />
      </div>
    </div>
  );
}
