// ONE VAULT'S PAGE — /base/morpho/vaults/<vault>.
// ----------------------------------------------------------------------------
// The vault card (V2), where the assets are (V3) and the holder finder (V4),
// rails-ops ui-jobs 407, drawn by components/vaults/morpho-base-vault-page.tsx
// from one pinned read of the vault and of Blue; Holders is the census's,
// Yield the daily store's.
//
// THE PAGE LINKS TO THE FILTERED LISTING, IT DOES NOT LIST. The Holders
// headline links to the position listing filtered to this address. What ONE
// address holds is the position page one segment down,
// /base/morpho/vaults/<vault>/<holder>.
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
// Morpho is the door, and the rail above the card says so. The sibling route /base/morpho/<vault> also resolves
// for the same address — it is the vault's OWN Blue positions, which is a true
// and different page. The card's ⋮ links to it, V3 links into it per market,
// and that page links back here.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { MorphoBaseVaultPage as MorphoBaseVaultPageView } from "@/components/vaults/morpho-base-vault-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { RailHeader } from "@/components/shared/rail-header";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_BASE_METAMORPHO_FACTORIES } from "@/lib/morpho-base/vault-catalog";
import { isMorphoBaseRosterVault } from "@/lib/morpho-base/vault-roster";
import { baseVaultHref } from "@/lib/vaults/routes";
import { loadMorphoBaseVault } from "@/lib/sources/chain/morpho-base-vault";
import { loadVaultCensusRow } from "@/lib/vaults/census-read";
import { loadVaultPageSeries } from "@/lib/vaults/yield-read";

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

  const [data, census, series] = await Promise.all([
    load(address, undefined),
    loadVaultCensusRow(MORPHO_BASE_CHAIN_ID, address),
    loadVaultPageSeries(MORPHO_BASE_CHAIN_ID, address),
  ]);
  const factory = MORPHO_BASE_METAMORPHO_FACTORIES.find((f) => f.version === data.vault.factory);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <RailHeader session="morpho-base" venue="subPage" />
        </header>

        {data.chainStale ? (
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            This vault could not be read from chain just now, so no figure is stated for it.
          </p>
        ) : (
          <MorphoBaseVaultPageView
            data={data}
            census={census}
            yieldFigure={series.yieldFigure}
            strip={series.strip}
            factory={factory?.address ?? null}
          />
        )}

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
