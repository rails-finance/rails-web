// ONE METAMORPHO VAULT'S PAGE — /<chain>/morpho/vaults/<vault>, on Base and
// Ethereum (rails-ops ui-jobs 407, 486). Each chain's page.tsx is these two
// exports with its chain fixed.
// ----------------------------------------------------------------------------
// The holder finder (V4), the vault card (V2) and the grid of tiles, drawn by
// components/vaults/morpho-base-vault-page.tsx from one pinned read of the
// vault and of Blue, the fee and the guardian at the same block
// (lib/vaults/config-read.ts); Holders and Who holds it are the census's
// (lib/vaults/holders-read.ts), Yield the daily store's, the steward's record
// the /vaults directory's (lib/vaults/steward-record.ts). What protects it,
// The protocol underneath and the record's bad-debt episodes stream behind
// their own Suspense.
//
// THE PAGE LINKS TO THE FILTERED LISTING, IT DOES NOT LIST. The Holders
// headline links to the position listing filtered to this address. What ONE
// address holds is the position page one segment down.
//
// `?holder=` IS A REDIRECT, NOT A READING. A position is the pair
// `(vault, holder)` and it has a path of its own, so the lookup form's native
// GET lands here and is sent (307) to that path.
//
// WHICH VAULTS THIS SERVES. Every vault in the chain's roster
// (lib/metamorpho/vault-roster.ts); every other address 404s.
// lib/morpho-base/vault-case-study.ts has the reasoning.
//
// WHERE IT LIVES. Under the Vaults tab of the chain's Morpho Blue explorer
// (rails-ops decision 0028): a MetaMorpho factory deployed this contract, so
// Morpho is the door, and the rail above the card says so.
//
// SERVER-ONLY.

import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { VaultProtectsSection } from "@/components/vaults/vault-protects-section";
import { VaultBadDebtSection } from "@/components/vaults/vault-bad-debt-section";
import { MorphoBaseVaultPage as MorphoBaseVaultPageView } from "@/components/vaults/morpho-base-vault-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { RailHeader } from "@/components/shared/rail-header";
import { chainMeta } from "@/lib/shared/chains";
import { metaMorphoFactoryAddress, metaMorphoRosterEntry, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { metaMorphoVaultHref } from "@/lib/vaults/routes";
import { loadMorphoBaseVault } from "@/lib/sources/chain/morpho-base-vault";
import { loadVaultCensusRow } from "@/lib/vaults/census-read";
import { loadVaultPageSeries } from "@/lib/vaults/yield-read";
import { loadAssetScales } from "@/lib/vaults/asset-scale";
import { FocusSourceGate } from "@/components/shared/aim-gate";
import { readVaultConfig } from "@/lib/vaults/config-read";
import { loadVaultHolders } from "@/lib/vaults/holders-read";
import { loadStewardRecord } from "@/lib/vaults/steward-record";

export type MetaMorphoVaultParams = {
  params: Promise<{ vault: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The explorer a chain's MetaMorpho vaults sit under. */
export const metaMorphoSession = (chainId: MetaMorphoChainId) => (chainId === 1 ? "morpho" : "morpho-base");

/** One read per request: `generateMetadata` and the page both await this, and
 *  React's cache() collapses the two into one chain read. */
const load = cache((chainId: MetaMorphoChainId, vault: string, holder: string | undefined) =>
  loadMorphoBaseVault(vault, holder, { chainId }),
);

const firstParam = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function metaMorphoVaultMetadata(
  chainId: MetaMorphoChainId,
  { params }: Pick<MetaMorphoVaultParams, "params">,
): Promise<Metadata> {
  const { vault } = await params;
  const address = vault.toLowerCase();
  const chain = chainMeta(chainId).name;
  if (!(await metaMorphoRosterEntry(chainId, address))) return { title: `Vault exposure · ${chain}` };
  // Metadata is about the VAULT, so it is generated without a holder — that also
  // keeps the cache key stable across every `?holder=` on the same vault.
  const data = await load(chainId, address, undefined);
  const name = data.vault.name || shortAddr(address);
  return listingMetadata({
    title: `${name} vault exposure · ${chain}`,
    description: `One address's proportional exposure to each Morpho Blue market the ${name} vault allocates to, read from chain at one block.`,
    canonicalPath: metaMorphoVaultHref(chainId, address),
  });
}

export async function MetaMorphoVaultRoute({
  chainId,
  params,
  searchParams,
}: MetaMorphoVaultParams & { chainId: MetaMorphoChainId }) {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!(await metaMorphoRosterEntry(chainId, address))) notFound();

  // `?holder=` names a POSITION, and a position has a path. The form on this
  // page is a native GET, so this is where its submit lands; it is sent on to
  // the pair's own URL rather than answered here, so one reading has one link.
  // `redirect()` throws, so it sits outside any try. The address is passed on
  // AS TYPED — a name is resolved by the page that reads it.
  const holderParam = firstParam((await searchParams).holder);
  if (holderParam && holderParam.trim()) redirect(metaMorphoVaultHref(chainId, address, holderParam.trim()));

  const [data, census, series, holders, stewardRecord] = await Promise.all([
    load(chainId, address, undefined),
    loadVaultCensusRow(chainId, address),
    loadVaultPageSeries(chainId, address),
    loadVaultHolders(chainId, address, "morpho"),
    loadStewardRecord(chainId, address, null),
  ]);
  const [assetScales, config] = data.chainStale
    ? [{}, null]
    : await Promise.all([
        loadAssetScales(chainId, [data.vault.asset.address]),
        readVaultConfig(chainId, address, data.blockNumber, data.vault.createdBlock),
      ]);

  return (
    <FocusSourceGate source={data.vault} chain={chainId} what="This vault">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            <RailHeader session={metaMorphoSession(chainId)} venue="subPage" />
          </header>

          {data.chainStale || !config ? (
            <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for it.
            </p>
          ) : (
            <MorphoBaseVaultPageView
              data={data}
              census={census}
              assetScales={assetScales}
              yieldFigure={series.yieldFigure}
              strip={series.strip}
              factory={metaMorphoFactoryAddress(chainId, data.vault.factory)}
              config={config}
              holders={holders}
              stewardRecord={stewardRecord}
              badDebt={
                <Suspense fallback={null}>
                  <VaultBadDebtSection chainId={chainId} vault={address} />
                </Suspense>
              }
              protects={
                <Suspense fallback={null}>
                  <VaultProtectsSection
                    subject={{ chainId, address, kind: "metamorpho" }}
                    vaultName={data.vault.name || shortAddr(address)}
                    look="paragraph"
                  />
                </Suspense>
              }
            />
          )}

          {/* The inspector, armed from the profile menu's switch. */}
          <ProvInspectorLayer />
        </div>
      </div>
    </FocusSourceGate>
  );
}
