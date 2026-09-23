// ONE VAULT'S MARKET VIEW — /base/morpho/vaults/<vault>.
// ----------------------------------------------------------------------------
// A MetaMorpho vault pools holders' asset and a curator routes it into Morpho
// Blue markets. This page is about the VAULT: what it holds, what Blue has
// settled of it, and which markets its withdraw queue puts the asset into, all
// at one block read from chain. No indexer and no backend table — the whole
// page is one pinned read of the vault and of Blue.
//
// A MARKET VIEW LINKS TO THE FILTERED LISTING, IT DOES NOT LIST. Who holds this
// vault is the position listing's question, and the header carries the link to
// it filtered to this address. What ONE address holds is the position page one
// path segment down, /base/morpho/vaults/<vault>/<holder>.
//
// `?holder=` IS A REDIRECT, NOT A READING. A position is the pair
// `(vault, holder)` and it has a path of its own, so the lookup form's native
// GET lands here and is sent (307) to that path. Nothing is rendered for the
// query — one reading, one URL.
//
// The /api/chain/morpho-base/vault route serves the identical read for anything
// that wants the numbers without the page; this page does not go through it,
// one hop shorter.
//
// WHICH VAULTS THIS SERVES. Every vault the census in
// lib/morpho-base/vault-catalog.ts knows — 511 at the census block — and every
// other address 404s. lib/morpho-base/vault-case-study.ts has the reasoning.
//
// WHERE IT LIVES. Under the Vaults tab of the Morpho Blue Base explorer
// (rails-ops decision 0028): a MetaMorpho factory deployed this contract, so
// Morpho is the door, and the rail above the H1 says so. The family words under
// the H1 name the standard and the factory version, and no longer carry the one
// link to the protocol. The sibling route /base/morpho/<vault> also resolves
// for the same address — it is the vault's OWN Blue positions, which is a true
// and different page. The allocation table links into it per market, and that
// page links back here.

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { MorphoBaseVaultExposureView } from "@/components/protocol/morpho-base/vault-exposure-view";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { RailHeader } from "@/components/shared/rail-header";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_BASE_METAMORPHO_FACTORIES } from "@/lib/morpho-base/vault-catalog";
import { isMorphoBaseRosterVault } from "@/lib/morpho-base/vault-roster";
import { resolveHolder } from "@/lib/morpho-base/vault-holder";
import { morphoBaseWalletHref } from "@/lib/morpho-base/routes";
import { baseVaultHref, baseVaultsListingHref } from "@/lib/vaults/routes";
import { loadMorphoBaseVault } from "@/lib/sources/chain/morpho-base-vault";

// Every figure is a slot read at the head, and the holder rides in the query —
// nothing about this is cacheable across requests.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ vault: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((vault: string, holder: string | undefined) => loadMorphoBaseVault(vault, holder));

const firstParam = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!(await isMorphoBaseRosterVault(address))) return { title: "Vault exposure · Base" };
  // Metadata is about the VAULT, so it is generated without a holder — that also
  // keeps the cache key stable across every `?holder=` on the same vault.
  const data = await load(address, undefined);
  const name = data.vault.name || shortAddr(address);
  return listingMetadata({
    title: `${name} Vault Exposure · Base`,
    description: `One address's proportional exposure to each Morpho Blue market the ${name} vault allocates to, read from chain at one block.`,
    canonicalPath: baseVaultHref(address),
  });
}

export default async function MorphoBaseVaultPage({ params, searchParams }: Props) {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!(await isMorphoBaseRosterVault(address))) notFound();

  // `?holder=` names a POSITION, and a position has a path. The form on this
  // page is a native GET, so this is where its submit lands; it is sent on to
  // the pair's own URL rather than answered here, so one reading has one link.
  // `redirect()` throws, so it sits outside any try. The address is passed on
  // AS TYPED — a name is resolved by the page that reads it, and resolving here
  // would put an address in the URL the reader did not write.
  const holderParam = firstParam((await searchParams).holder);
  if (holderParam && holderParam.trim()) redirect(baseVaultHref(address, holderParam.trim()));

  const lookup = await resolveHolder(null);
  const data = await load(address, undefined);

  const factory = MORPHO_BASE_METAMORPHO_FACTORIES.find((f) => f.version === data.vault.factory);
  // The label follows the chain rather than the convention: a vault whose
  // `curator()` is the zero address names no curator, and saying "Curator" over
  // an owner's address would attribute a role nobody holds.
  const stewardLabel = data.vault.curator ? "Curator" : "Owner";
  const steward = data.vault.curator ?? data.vault.owner;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <div className="mb-4">
            <RailHeader session="morpho-base" venue="subPage" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            <a
              href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", data.vault.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {data.vault.name || shortAddr(data.vault.address)}
            </a>
            {data.vault.symbol && <span className="ml-2 text-base font-normal text-rb-500">{data.vault.symbol}</span>}
          </h1>

          {data.chainStale ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for it. The page states nothing
              it could not read.
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
                {" · asset "}
                <a
                  href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", data.vault.asset.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={data.vault.asset.named ? "link-external" : "link-external font-mono"}
                >
                  {data.vault.asset.symbol}
                </a>
                {" · "}
                {stewardLabel}{" "}
                <a
                  href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", steward)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external font-mono"
                >
                  {shortAddr(steward)}
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
                · every figure below is a slot read at that block, on the vault and on the{" "}
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
                <Link href={morphoBaseWalletHref(data.vault.address)} className={PAGE_LINK} prefetch={false}>
                  This vault&rsquo;s own positions on Morpho Blue <span aria-hidden>→</span>
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
                <Link href={baseVaultsListingHref()} className={PAGE_LINK} prefetch={false} data-link="vault-directory">
                  All vault positions on Base <span aria-hidden>→</span>
                </Link>
              </p>
            </>
          )}
        </header>

        {!data.chainStale && <MorphoBaseVaultExposureView data={data} lookup={lookup} />}

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
