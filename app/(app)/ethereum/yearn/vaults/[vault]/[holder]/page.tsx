// ONE HOLDING — /ethereum/yearn/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// A holding is the pair `(vault, holder)`, and it has a path of its own the way
// an Aave vault position does. The holder is a SEGMENT rather than a query
// because it is the subject of the page, not a filter on the factsheet beside
// it.
//
// WHAT THE SEGMENT ACCEPTS. An address, or an ENS name — resolved here, on the
// server, through mainnet's Universal Resolver before any read runs, so a link
// to a reading is a link to that same reading. A name that resolves to nothing,
// and an input that is neither, are STATED here rather than 404ing: the vault
// is real and the question was asked, and the answer is that no address was
// found for what was typed. An address holding nothing is a reading too.
//
// TWO READS, ONE BLOCK. The vault and this address's balance are `eth_call`s at
// one pinned block; the timeline's log sweeps stream in behind a Suspense
// boundary and REUSE that block. Two `eth_blockNumber` calls a second apart are
// two different moments, so nothing here reads a second one.
//
// THE CARD NEEDS NO CENSUS. Balance, share of the vault, claim and Redeemable
// now are calls at the page's block; First seen and Earned come from this page's
// own sweep of the address's transfers. There is no USD line: no oracle is read
// for this roster's assets. The page is the family header, the holder card,
// Lifetime flows and the Activity timeline (rails-ops ui-jobs 407 step 4).
//
// The rows below carry a permalink each — `event/[eventId]` under this route —
// and neither route has a share image: a Yearn event can only be found by
// sweeping the whole life, and an image route must not do that on a free
// parameter.
//
// The vault's own figures — idle, debt, the withdrawal queue, the roles — are
// NOT restated here. They are the factsheet one path segment up.

import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { yearnVaultSharePriceProv } from "@/lib/yearn/vault-provenance";
import { LatestPrices, type LatestPriceAsset } from "@/components/shared/latest-prices";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { VaultFlowsPanel } from "@/components/vaults/vault-flows-panel";
import { vaultFlowTimeline } from "@/lib/vaults/vault-flows";
import { vaultHoldingHistory, type VaultHoldingHistory } from "@/lib/vaults/earned";
import { VaultHoldingCard } from "@/components/vaults/vault-holding-card";
import { HoldingExplanation } from "@/components/vaults/holding-explanation";
import { HoldingReceiptsScope } from "@/components/vaults/holding-receipts-scope";
import { HOLDING_REWARDS, vaultHoldingContent } from "@/lib/vaults/card-words";
import { YearnVaultTimeline } from "@/components/vaults/yearn-vault-timeline";
import { computeVaultPositionEconomics } from "@/lib/aave-vaults/position-economics";
import { sectionPositionMetadata } from "@/lib/shared/page-metadata";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { yearnVaultHref, yearnVaultRosterHref } from "@/lib/vaults/routes";
import { resolveYearnVaultHolder } from "@/lib/yearn/vault-holder";
import { loadYearnEthereumVault } from "@/lib/sources/chain/yearn-ethereum-vault";
import type { YearnVaultResponse } from "@/lib/sources/chain/yearn-ethereum-vault";
import { loadYearnEthereumVaultTimeline } from "@/lib/sources/chain/yearn-ethereum-vault-timeline";
import { YEARN_CHAIN_ID } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { isYearnRosterVault, yearnRosterEntry } from "@/lib/yearn/vault-roster";
import type { VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
import { BlockRef } from "@/components/shared/block-ref";

// Every figure is a call at the head with the holder in the path — nothing
// about this is cacheable across requests.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ vault: string; holder: string }> };

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((vault: string, holder: string | undefined) => loadYearnEthereumVault(vault, holder));

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The holder's whole history in this vault, read once per request: the card's
 *  Earned and First seen, the Lifetime flows panel and the timeline all reduce
 *  the same rows (React's cache() hands every caller one promise).
 *
 *  It takes the BLOCK the vault loader already pinned rather than reading one
 *  of its own: the reading and the history are one claim about one moment.
 *  Every read inside it ends at that block, and each row's share price is
 *  called at that row's own block — never at "latest". */
const loadHistory = cache(async (data: YearnVaultResponse, holder: string) => {
  const shareDecimals = data.vault.shareDecimals;
  const entry = await yearnRosterEntry(data.vault.address);
  if (shareDecimals == null || !entry) return null;

  const { timeline, allEvents } = await loadYearnEthereumVaultTimeline(data.vault.address, holder, {
    blockNumber: data.blockNumber,
    shareDecimals,
    assetDecimals: data.vault.asset.decimals,
    createdBlock: entry.createdBlock,
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
  // `VAULT_TIMELINE_DRAW_ROWS`, and a tower summed from that slice would be a
  // window's arithmetic wearing a lifetime's caption.
  const economics = data.holder
    ? computeVaultPositionEconomics({
        timeline: { ...timeline, events: allEvents },
        coords,
        sharesRaw: data.holder.shares.raw,
        claimRaw: data.holder.claim?.raw ?? null,
        shareSymbol: data.vault.symbol ?? shortAddress(data.vault.address),
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
          shareSymbol: data.vault.symbol ?? shortAddress(data.vault.address),
          shareDecimals,
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
    shareDecimals,
    claimRaw: data.holder?.claim?.raw ?? null,
    blockNumber: data.blockNumber,
    replayed: economics != null && flowTimeline != null,
  });
  return { timeline, economics, flowTimeline, card };
});

/** The Lifetime flows panel and the timeline, streamed in behind a Suspense
 *  boundary: their reads are log sweeps, and the card has painted first. */
async function YearnTimelineSection({
  data,
  holder,
  onEventPage,
}: {
  data: YearnVaultResponse;
  holder: string;
  onEventPage: boolean;
}) {
  // Without the vault's own `decimals()` there is no exponent to ask a share
  // price with, and inventing one would print a 6-decimal price 1e12 too large.
  // No reading, so no rows.
  const history = await loadHistory(data, holder);
  if (!history) return null;
  const { timeline, economics, flowTimeline } = history;
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
          shareSymbol={data.vault.symbol ?? shortAddress(data.vault.address)}
          assetSymbol={data.vault.asset.symbol}
        />
      )}
      <YearnVaultTimeline
        timeline={timeline}
        vaultName={data.vault.name}
        shareSymbol={data.vault.symbol}
        assetSymbol={data.vault.asset.symbol}
      />
    </>
  );
}

/** The holder card (components/vaults/vault-holding-card.tsx). Yearn has no
 *  census, so every figure on it is a call at this page's block, and First seen
 *  and Earned come from this page's own sweep. */
function HoldingCard({
  data,
  holder,
}: {
  data: YearnVaultResponse;
  holder: NonNullable<YearnVaultResponse["holder"]>;
}) {
  const { vault } = data;
  const shareDecimals = vault.shareDecimals ?? vault.asset.decimals;
  const shareSymbol = vault.symbol ?? shortAddress(vault.address);
  const unread = { earned: { status: "unreplayed" as const, block: data.blockNumber }, firstSeen: null };
  const history: Promise<VaultHoldingHistory> = loadHistory(data, holder.address).then(
    (r) => r?.card ?? unread,
    () => unread,
  );
  const supply = vault.totalSupply ? BigInt(vault.totalSupply.raw) : BigInt(0);
  const held = BigInt(holder.shares.raw);
  return (
    <VaultHoldingCard
      coords={{
        chainId: YEARN_CHAIN_ID,
        blockNumber: data.blockNumber,
        vault: vault.address,
        vaultName: vault.name ?? undefined,
        shareSymbol,
        shareDecimals,
        assetSymbol: vault.asset.symbol,
        assetDecimals: vault.asset.decimals,
        holder: holder.address,
      }}
      family="yearn"
      venueMark={vault.endorsed === true}
      vaultHref={yearnVaultHref(vault.address)}
      holdingHref={yearnVaultHref(vault.address, holder.address)}
      assetAddress={vault.asset.address}
      shares={holder.shares}
      claim={holder.claim}
      totalSupply={vault.totalSupply}
      dust={held > BigInt(0) && supply > BigInt(0) && Number(held) / Number(supply) < 0.000001}
      maxWithdraw={holder.maxWithdraw}
      exit="withdraw() or redeem()"
      census={null}
      history={history}
      learnMore={vaultHoldingContent(vault.asset.symbol, shareSymbol, false, HOLDING_REWARDS.yearn)}
      explanation={
        <HoldingExplanation
          blockNumber={data.blockNumber}
          censusBlock={null}
          assetSymbol={vault.asset.symbol}
          rewards={HOLDING_REWARDS.yearn}
        />
      }
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault, holder } = await params;
  const address = vault.toLowerCase();
  if (!(await isYearnRosterVault(address))) return { title: "Yearn V3 vault" };
  // Metadata is about the VAULT and the address AS TYPED: metadata must not
  // make a network call of its own, so no name is resolved here.
  const data = await load(address, undefined);
  const name = data.vault.name ?? data.vault.censusName;
  const subject = ADDRESS.test(holder) ? shortAddress(holder.toLowerCase()) : decodeURIComponent(holder);
  return sectionPositionMetadata({
    section: { label: "Vaults", chainId: YEARN_CHAIN_ID },
    market: name,
    subject,
    canonicalPath: yearnVaultHref(address, holder),
    description: `A Rails reading of this address's holding in the ${name} Yearn V3 vault: shares, claim, earned, what is redeemable now, lifetime flows and every one of its own events, read from chain at one block.`,
  });
}

export default async function YearnVaultHoldingPage({ params }: Props) {
  const { vault, holder, eventId } = (await params) as Awaited<Props["params"]> & { eventId?: string };
  // The event route re-renders this page (ui-jobs 236): the sub-nav and the
  // event's card beside the shared column, nothing else.
  const onEventPage = eventId != null;
  const address = vault.toLowerCase();
  // Catalogue membership is the served set, exactly as on the factsheet: a miss
  // means "not in this census", never "not a Yearn V3 vault".
  if (!(await isYearnRosterVault(address))) notFound();

  const typed = decodeURIComponent(holder);
  const lookup = await resolveYearnVaultHolder(typed);
  const data = await load(address, lookup.address ?? undefined);

  const vaultName = data.vault.name ?? data.vault.censusName;
  const subject = lookup.address ? shortAddress(lookup.address) : typed;

  // The top row's price dropdown. A holder holds SHARES, and the one price
  // the vault states about them is its own `convertToAssets` — one whole
  // share in the vault's asset, read at the block this page names. No USD:
  // the roster's 72 assets have no common feed to value them against.
  // Where the chain read failed the row still names the share and shows no
  // figure, because what is held is true whether or not the read landed.
  const sharePrice =
    !data.chainStale && data.vault.sharePrice != null && data.vault.sharePrice.value > 0
      ? data.vault.sharePrice.value
      : undefined;
  const shareAssets: LatestPriceAsset[] = [
    {
      symbol: data.vault.symbol ?? shortAddress(data.vault.address),
      address: data.vault.address,
      price: sharePrice,
      unit: sharePrice ? data.vault.asset.symbol : undefined,
      label: `One share in ${data.vault.asset.symbol}, the vault's own convertToAssets`,
      info: yearnVaultSharePriceProv({
        blockNumber: data.blockNumber,
        vault: data.vault.address,
        vaultName: data.vault.name ?? undefined,
        assetSymbol: data.vault.asset.symbol,
      }),
    },
  ];

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          {/* Smart-back returns the reader wherever they came from; a fresh tab
              lands on the vault section's listing. The price and recency strip
              sits in the holder's address row, Back stands alone, and Tools
              closes the row. The share is quoted in the vault's asset. */}
          <DetailTopRow
            session="yearn"
            fallbackHref={yearnVaultHref(address)}
            assets={shareAssets}
            priceReason={ORACLE_USD_REASON["yearn"]}
            owner={{ wallet: lookup.address, filterProtocol: null, bookmark: false }}
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
              drawn. */}
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
              {/* The release; the card names the block. */}
              <span data-vault-block={data.blockNumber}>Yearn V3 {data.vault.apiVersion}</span>
              <Link href={yearnVaultHref(address)} className={PAGE_LINK} prefetch={false} data-link="vault-market">
                {vaultName} <span aria-hidden>→</span>
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

        {!data.chainStale && !onEventPage && data.holder && <HoldingCard data={data} holder={data.holder} />}
        {!data.chainStale && data.holder && (
          <HoldingReceiptsScope>
            <Suspense
              fallback={
                <div className="mb-6" data-skel-section="vault-timeline-pending">
                  <SkeletonBlock height={180} />
                </div>
              }
            >
              <YearnTimelineSection data={data} holder={data.holder.address} onEventPage={onEventPage} />
            </Suspense>
          </HoldingReceiptsScope>
        )}

        <ProvInspectorLayer />
      </div>
    </div>
  );
}
