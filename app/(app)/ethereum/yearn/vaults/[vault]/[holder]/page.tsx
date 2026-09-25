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
// THERE IS NO POSITION CARD AND NO SHARE IMAGE HERE, and both absences are
// facts rather than omissions. The other two vault layers draw a card from the
// daily census — transfers, first seen, what the holding address is — and Yearn
// has no census: every `(vault, holder)` pair on this roster is the
// share-ledger job parked at TO-DO-infra-and-backend §5.4. A card drawn without
// it would have to invent the half it cannot read, and an unfurl image would
// draw that same invention. What this page states is what it read: the flows
// reduced over the whole life, and the life itself.
//
// The rows below DO carry a permalink each — `event/[eventId]` under this
// route, added 2026-09-20 — and that route has no share image of its own for a
// third, separate reason: a Yearn event can only be found by sweeping the whole
// life, and an image route must not do that on a free parameter. Its own header
// states it.
//
// The vault's own figures — idle, debt, the withdrawal queue, the roles — are
// NOT restated here. They are the factsheet one path segment up.

import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { RailHeader } from "@/components/shared/rail-header";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { LatestPrices } from "@/components/shared/latest-prices";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { VaultFlowsTower } from "@/components/vaults/vault-flows-tower";
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

// Every figure is a call at the head with the holder in the path — nothing
// about this is cacheable across requests.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ vault: string; holder: string }> };

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((vault: string, holder: string | undefined) => loadYearnEthereumVault(vault, holder));

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The holder's own events in this vault, streamed in beside the reading.
 *
 *  It takes the BLOCK the vault loader already pinned rather than reading one
 *  of its own: the reading and the history are one claim about one moment.
 *  Every read inside it ends at that block, and each row's share price is
 *  called at that row's own block — never at "latest".
 *
 *  Rendered inside a `<Suspense>` because its reads are log sweeps and the rest
 *  of the page is `eth_call`s that have already answered. */
async function YearnTimelineSection({ data, holder }: { data: YearnVaultResponse; holder: string }) {
  // Without the vault's own `decimals()` there is no exponent to ask a share
  // price with, and inventing one would print a 6-decimal price 1e12 too large.
  // No reading, so no rows.
  if (data.vault.shareDecimals == null) return null;
  const entry = await yearnRosterEntry(data.vault.address);
  if (!entry) return null;

  const { timeline, allEvents } = await loadYearnEthereumVaultTimeline(data.vault.address, holder, {
    blockNumber: data.blockNumber,
    shareDecimals: data.vault.shareDecimals,
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
  // window's arithmetic wearing a lifetime's caption. The component below is a
  // renderer and holds no reducer at all, so there is no second place this
  // could happen.
  const economics = data.holder
    ? computeVaultPositionEconomics({
        timeline: { ...timeline, events: allEvents },
        coords,
        sharesRaw: data.holder.shares.raw,
        claimRaw: data.holder.claim?.raw ?? null,
        shareSymbol: data.vault.symbol ?? shortAddress(data.vault.address),
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
    description: `A Rails reading of what this address holds of the ${name} Yearn V3 vault: shares, claim, lifetime flows and every one of its own events, read from chain at one block in native units.`,
  });
}

export default async function YearnVaultHoldingPage({ params }: Props) {
  const { vault, holder } = await params;
  const address = vault.toLowerCase();
  // Catalogue membership is the served set, exactly as on the factsheet: a miss
  // means "not in this census", never "not a Yearn V3 vault".
  if (!(await isYearnRosterVault(address))) notFound();

  const typed = decodeURIComponent(holder);
  const lookup = await resolveYearnVaultHolder(typed);
  const data = await load(address, lookup.address ?? undefined);

  const vaultName = data.vault.name ?? data.vault.censusName;
  const subject = lookup.address ? shortAddress(lookup.address) : typed;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <div className="mb-4">
            <RailHeader session="yearn" venue="position" />
          </div>
          {/* Smart-back returns the reader wherever they came from; the
              fallback — a fresh tab, a pasted link — is the vault's own
              factsheet, which is where a holding is opened from. */}
          {/* The one thin row of "latest" (rails-ops TO-DO-ui-jobs 48): back,
              the chain head and its age, and the holding's assets at their
              current prices — empty here until this section prices them —
              with the page's instruments in Tools at the right end. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2" data-back-row>
            <div className="flex min-w-0 items-center gap-2">
              <DetailBackButton fallbackHref={yearnVaultHref(address)} compact />
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
              drawn. */}
          {lookup.kind === "ens" && lookup.address && (
            <p className="mt-1 text-[11px] text-rb-500" data-holder-ens={lookup.typed}>
              {lookup.typed} · resolved through mainnet ENS
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
                Yearn V3 {data.vault.apiVersion} · asset{" "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "address", data.vault.asset.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={data.vault.asset.named ? "link-external" : "link-external font-mono"}
                >
                  {data.vault.asset.symbol}
                </a>
                {" · shares "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "address", address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external font-mono"
                >
                  {shortAddress(address)}
                </a>
              </p>
              <p className="mt-2 text-[11px] text-rb-500" data-vault-block={data.blockNumber}>
                Read at block{" "}
                <a
                  href={explorerUrl(YEARN_CHAIN_ID, "block", data.blockNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {data.blockNumber.toLocaleString("en-US")}
                </a>{" "}
                · every figure read at this block is a call answered at it, on this vault. Each row below states its own
                share price at its own block.
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={yearnVaultHref(address)} className={PAGE_LINK} prefetch={false} data-link="vault-market">
                  {vaultName} <span aria-hidden>→</span>
                </Link>
                <Link href={yearnVaultRosterHref()} className={PAGE_LINK} prefetch={false} data-link="vault-roster">
                  Every Yearn V3 vault <span aria-hidden>→</span>
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
            That is neither of the two accepted forms. A holding is opened with a 20-byte address starting{" "}
            <code>0x</code>, or an ENS name ending <code>.eth</code>.
          </p>
        )}
        {lookup.error === "unresolved" && (
          <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="unresolved">
            No address is recorded for {lookup.typed} on Ethereum mainnet at the time of this read.
          </p>
        )}

        {!data.chainStale && data.holder && (
          <Suspense
            fallback={
              <div className="mb-6" data-skel-section="vault-timeline-pending">
                <SkeletonBlock height={180} />
              </div>
            }
          >
            <YearnTimelineSection data={data} holder={data.holder.address} />
          </Suspense>
        )}

        <ProvInspectorLayer />
      </div>
    </div>
  );
}
