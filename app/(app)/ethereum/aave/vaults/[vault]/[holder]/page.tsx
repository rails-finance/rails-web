// ONE POSITION — /ethereum/aave/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// A position is the pair `(vault, holder)`, and it has a path of its own the
// way a trove does. The holder is a SEGMENT rather than a query because it is
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
// are the market view one path segment up, and the family's whole mechanic is
// in this page's intro drawer.

import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { AaveEthereumVaultPositionView } from "@/components/vaults/aave-ethereum-vault-view";
import { AaveVaultTimeline } from "@/components/vaults/aave-vault-timeline";
import { VaultFlowsTower } from "@/components/vaults/vault-flows-tower";
import { VaultPositionCard } from "@/components/vaults/vault-position-card";
import { VaultContextStrip, VaultContextStripStandalone } from "@/components/vaults/vault-context-strip";
import { RiskFooterStrip } from "@/components/shared/risk-footer-strip";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { LatestPrices } from "@/components/shared/latest-prices";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { shareText } from "@/lib/shared/vault-amount-text";
import { cooldownSentence } from "@/lib/aave-vaults/cooldown-words";
import {
  aaveVaultCooldownStateProv,
  aaveVaultMaxRedeemProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import { sectionPositionMetadata } from "@/lib/shared/page-metadata";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { resolveAaveVaultHolder, type AaveVaultHolderLookup } from "@/lib/aave-vaults/vault-holder";
import { aaveVaultPositionContent } from "@/lib/shared/learn-more-content";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { loadAaveEthereumVault, type AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import { loadAaveEthereumVaultTimelineWithTail } from "@/lib/sources/chain/aave-ethereum-vault-timeline";
import { computeVaultPositionEconomics } from "@/lib/aave-vaults/position-economics";
import { fetchVaultTail, putVaultTail } from "@/lib/api/fetch-vault-tail";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { AAVE_VAULT_TAIL_VERSION, type VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
import type { VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import { RailHeader } from "@/components/shared/rail-header";

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

/** The holder's own events in this vault, streamed in beside the reading.
 *
 *  It takes the BLOCK the vault loader already pinned rather than reading one
 *  of its own: the reading and the history are one claim about one moment, and
 *  two `eth_blockNumber` calls a second apart are two different moments. Every
 *  read inside it ends at that block, and each row's share price is called at
 *  that row's own block — never at "latest".
 *
 *  Rendered inside a `<Suspense>` because its reads are log sweeps and the rest
 *  of the page is `eth_call`s that have already answered; the reading paints
 *  first and this arrives when the chain has spoken. */
async function VaultTimelineSection({ data, holder }: { data: AaveEthereumVaultResponse; holder: string }) {
  // Without the share token's own `decimals()` there is no exponent to ask a
  // share price with, and inventing one would print a 6-decimal price 1e12 too
  // large. No reading, so no rows.
  if (data.vault.shareDecimals == null) return null;

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
      shareDecimals: data.vault.shareDecimals,
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
  // arithmetic wearing a lifetime's caption. The component below is a renderer
  // and holds no reducer at all, so there is no second place this could happen.
  const economics =
    data.holder && data.vault.shareDecimals != null
      ? computeVaultPositionEconomics({
          timeline: { ...timeline, events: allEvents },
          coords,
          sharesRaw: data.holder.shares.raw,
          claimRaw: data.holder.claim?.raw ?? null,
          shareSymbol: data.vault.symbol ?? shortAddr(data.vault.address),
          shareDecimals: data.vault.shareDecimals,
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
  data: AaveEthereumVaultResponse;
  holder: string;
  lookup: AaveVaultHolderLookup;
}) {
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
    console.error("The vault position card's census row did not answer:", error);
  }
  const row = rows.find((r) => r.holder.toLowerCase() === holder.toLowerCase());
  const strip = vaultContextStrip(data);
  // THE CENSUS HAS NO ROW, AND THE READING IS STILL A READING. What is
  // redeemable at this block, the exit and the cooldown are calls this page
  // made itself; they must not be lost because a daily sweep has not yet seen
  // this address. The same three clusters stand alone in the card's place, with
  // the sentence saying why there is no card.
  if (!row)
    return (
      <VaultContextStripStandalone
        {...strip}
        absence={`The census has no row for this address in this vault yet — it sweeps once a day, and an address first seen since the last tick has none. Nothing above or below depends on it: every figure on this page is a call answered at block ${data.blockNumber.toLocaleString("en-US")}.`}
      />
    );

  const shareDecimals = data.vault.shareDecimals ?? row.shareDecimals ?? 18;
  const onPage: VaultPositionRow = {
    ...row,
    shareDecimals,
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
    <VaultPositionCard
      row={onPage}
      receipts
      // The identity block that used to sit under this card is gone: what it
      // carried — the resolved name and the link out — rides the card itself.
      holderIdentity={{ ensName: lookup.ensName }}
      learnMore={aaveVaultPositionContent(data.vault.family, data.vault.asset.symbol, data.vault.symbol)}
      // The context strip rides the card's heading-button row, the trove card's
      // own grammar. It was three paragraphs under this card until 2026-09-09
      // (see components/vaults/aave-ethereum-vault-view.tsx's HolderSection).
      rowExtra={
        <RiskFooterStrip>
          <VaultContextStrip {...strip} />
        </RiskFooterStrip>
      }
      explanation={<PositionCardExplanation row={onPage} maxRedeemRead={data.holder.maxRedeem != null} />}
    />
  );
}

/** What the card's context strip says for THIS reading — built here, on the
 *  server, from the one loader the page already awaited, and handed to the card
 *  as already-formatted words plus the receipt that traces each.
 *
 *  THE EXIT IS THE CONTRACT'S OWN FUNCTION, per family. sGHO and a static
 *  aToken redeem outright; an Umbrella stake token cannot be redeemed until a
 *  cooldown has been started and waited out, so its exit names both calls in
 *  the order they must happen. No verb of this page's own choosing, and no
 *  advice about when to use either. */
function vaultContextStrip(data: AaveEthereumVaultResponse) {
  const holder = data.holder!;
  const { vault } = data;
  const sd = vault.shareDecimals ?? 18;
  const coords: AaveVaultCoords = {
    blockNumber: data.blockNumber,
    vault: vault.address,
    vaultName: vault.name ?? undefined,
    assetSymbol: vault.asset.symbol,
    shareSymbol: vault.symbol ?? undefined,
    reserveSymbol: data.umbrella?.reserve?.symbol,
    holder: holder.address,
  };
  return {
    redeemable: holder.maxRedeem
      ? {
          text: `${shareText(holder.maxRedeem, sd)} ${vault.symbol ?? "shares"}`,
          prov: aaveVaultMaxRedeemProv(coords, vault.family),
          figure: "holder-max-redeem" as const,
        }
      : { unread: true as const, figure: "holder-max-redeem" as const },
    exit: vault.family === "umbrella-stake" ? "cooldown(), then redeem()" : "redeem()",
    cooldown: holder.cooldown
      ? {
          text: `${cooldownSentence(holder.cooldown, sd)}. ${
            holder.cooldown.state === "open"
              ? "Inside it maxRedeem() answers what the snapshot covers."
              : "Outside it maxRedeem() answers zero."
          }`,
          prov: aaveVaultCooldownStateProv(coords),
        }
      : undefined,
  };
}

/** The card's Explanation pane — facts only, and its whole subject is WHICH
 *  LANE each figure came from, because the card is the one surface on this page
 *  that draws two: a live reading at the page's block and a counted set from
 *  the daily census at the census block. */
function PositionCardExplanation({ row, maxRedeemRead }: { row: VaultPositionRow; maxRedeemRead: boolean }) {
  const n = (v: number) => v.toLocaleString("en-US");
  const items = [
    `Shares, claim and share of the vault are calls answered at block ${n(row.live?.blockNumber ?? 0)} — the same block every figure under this card is read at.`,
    maxRedeemRead
      ? `"Redeemable now" on the row above is the vault's own maxRedeem() for this address at that same block, in share units — what the contract says can be redeemed then, not what the shares are worth. On a stake token it answers zero outside the holder's unstake window, and that zero is a state rather than an absence.`
      : `"Redeemable now" is stated as not read: the vault's own maxRedeem() did not answer for this address at block ${n(row.live?.blockNumber ?? 0)}, and an unread call is said rather than shown as a zero.`,
    `Transfers, first seen and last activity are counted by the census: one whole-Transfer sweep of this vault, proven complete by Σ balanceOf equalling totalSupply() wei-exact, swept to block ${n(row.census.block)}.`,
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
    description: `A Rails reading of this address's position in the ${name} vault: shares, claim, what is redeemable now, lifetime flows and every one of its own events, read from chain at one block in native units.`,
    // The route's own opengraph-image.tsx draws this position's census row.
    image: "dynamic",
  });
}

export default async function AaveEthereumVaultPositionPage({ params }: Props) {
  const { vault, holder } = await params;
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

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <div className="mb-4">
            <RailHeader session="aave-vaults" venue="position" />
          </div>
          {/* Smart-back returns the reader wherever they came from; the
              fallback — a fresh tab, a pasted link — is the section's own
              listing on this chain, which is where a position was opened from.
              No session: the Vaults section has no roster entry to derive one
              (rails-ops decision 0017). */}
          {/* The one thin row of "latest" (rails-ops TO-DO-ui-jobs 48): back,
              the chain head and its age, and the holding's assets at their
              current prices — empty here until this section prices them —
              with the page's instruments in Tools at the right end. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2" data-back-row>
            <div className="flex min-w-0 items-center gap-2">
              <DetailBackButton fallbackHref={ethereumVaultsListingHref()} compact />
              <RecencyStamp />
              <LatestPrices assets={[]} />
            </div>
            <ToolsMenu />
          </div>
          <h1
            className="text-2xl font-semibold text-foreground"
            data-vault-page={address}
            data-vault-family={data.vault.family}
          >
            <span className="font-mono">{subject}</span>
            <span className="ml-2 text-base font-normal text-rb-500">in {vaultName}</span>
          </h1>
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

          {data.chainStale ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for this address in it — not the
              family either, because which family it belongs to is a read like everything else on this page.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[12px] text-rb-500">
                {AAVE_FAMILY_SINGULAR[data.vault.family]}, deployed by Aave · shares{" "}
                <a
                  href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
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
                  href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {data.blockNumber.toLocaleString("en-US")}
                </a>{" "}
                · every figure read at this block is a call answered at it, on this vault and on the contracts it names.
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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
                  Every address that has held this vault <span aria-hidden>→</span>
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
            That is neither of the two accepted forms. A position is opened with a 20-byte address starting{" "}
            <code>0x</code>, or an ENS name ending <code>.eth</code>.
          </p>
        )}
        {lookup.error === "unresolved" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="unresolved">
            No address is recorded for {lookup.typed} on Ethereum mainnet at the time of this read.
          </p>
        )}

        {!data.chainStale && (
          <AaveEthereumVaultPositionView
            data={data}
            positionCard={
              data.holder ? (
                <Suspense
                  fallback={
                    <div data-skel-section="vault-position-card-pending">
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
