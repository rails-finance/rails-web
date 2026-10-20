// One Aave vault's page — /ethereum/aave/vaults/<vault>.
// ----------------------------------------------------------------------------
// The vault card (V2), where the assets are (V3) and the holder finder (V4),
// rails-ops ui-jobs 407, drawn by components/vaults/aave-ethereum-vault-page.tsx
// from one pinned read of the vault and of the contracts it hops to; Holders
// is the census's, Yield the daily store's. The Holders headline links to the
// section's listing filtered to this vault.
//
// `?holder=` IS NOT A READING HERE. It is what the native GET form emits, and
// this route sends it straight on to that position's own path — a position is a
// subject with a URL, the way a trove is, not a filter on a vault. Every
// outcome of the input (an address, a name that resolves, a name that does not,
// something that is neither) is stated by the holder route, so there is one
// place that answers for what was typed.
//
// WHICH VAULTS THIS SERVES. The catalogue, and the catalogue is a CHAIN READ:
// `StataTokenFactory.getStataTokens()`, `Umbrella.getStkTokens()` and the one
// address Aave's address book names for sGHO, all answered at the same block
// the figures are read at. There is no hand-picked roster anywhere — the Base
// build's one recorded mistake was exactly that, a per-vault route serving a
// narrower set than a sibling surface already served for the same address, and
// catalogue membership is the whole test here. Every other address 404s.
//
// WHERE IT LIVES. Under the chain's Vaults section (rails-ops decision 0017),
// not under an explorer: a vault is a fund factsheet, the chain is the path's
// first segment, and the venue is a header fact stated under the H1. No rail
// header and no ChainProvider, for the reasons `app/(app)/ethereum/layout.tsx`
// gives: chain 1 is the render layer's default, so every explorer link under
// /ethereum/… resolves to Etherscan with no extra wiring.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { AaveEthereumVaultPage } from "@/components/vaults/aave-ethereum-vault-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { aaveVaultAttestation } from "@/lib/aave-vaults/vault-catalog";
import { ethereumVaultHref } from "@/lib/vaults/routes";
import { loadAaveEthereumVault } from "@/lib/sources/chain/aave-ethereum-vault";
import { RailHeader } from "@/components/shared/rail-header";
import { loadVaultCensusRow } from "@/lib/vaults/census-read";
import { loadVaultPageSeries } from "@/lib/vaults/yield-read";

// Every figure is a call at the head — nothing about this is cacheable across
// requests.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ vault: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((vault: string) => loadAaveEthereumVault(vault, undefined));

const firstParam = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!ADDRESS.test(address)) return { title: "Vault · Ethereum" };
  const data = await load(address);
  if (!data.served) return { title: "Vault · Ethereum" };
  const name = data.vault.name || shortAddr(address);
  return listingMetadata({
    title: `${name} · Vaults on Ethereum`,
    description: `What the ${name} vault holds — total assets, shares issued, share price and the family's own mechanic, read from chain at one block in native units.`,
    canonicalPath: ethereumVaultHref(address),
  });
}

export default async function AaveEthereumVaultRoute({ params, searchParams }: Props) {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!ADDRESS.test(address)) notFound();

  // The form's submit, sent on to the position's own path AS TYPED — a name is
  // resolved where the reading is made, so the URL a reader shares is the one
  // they wrote. `redirect()` throws, so it sits before every read.
  const typed = firstParam((await searchParams).holder)?.trim();
  if (typed) redirect(ethereumVaultHref(address, typed));

  const data = await load(address);
  // `served: false` is a CHAIN answer — the enumerators ran and did not name
  // this address. A read that FAILED leaves it true, so a bad minute on the RPC
  // never turns a real vault into a 404.
  if (!data.served) notFound();

  const attestation = aaveVaultAttestation(address, data.vault.family);
  const [census, series] = await Promise.all([
    loadVaultCensusRow(MAINNET_CHAIN_ID, address),
    loadVaultPageSeries(MAINNET_CHAIN_ID, address),
  ]);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <RailHeader session="aave-vaults" venue="subPage" />
        </header>

        {data.chainStale ? (
          <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
            This vault could not be read from chain just now, so no figure is stated for it.
          </p>
        ) : (
          <AaveEthereumVaultPage
            data={data}
            census={census}
            yieldFigure={series.yieldFigure}
            strip={series.strip}
            attestation={attestation}
          />
        )}

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
