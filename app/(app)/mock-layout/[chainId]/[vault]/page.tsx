// A layout mock of one MetaMorpho vault's page (Miles, 10 Nov 2026): the live
// page's reads (components/vaults/metamorpho-vault-route.tsx) drawn by
// components/mock-layout/mock-vault-layout.tsx, plus
// lib/mock-layout/vault-config-read.ts. Localhost only; not linked from the app.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { MockVaultLayout } from "@/components/mock-layout/mock-vault-layout";
import { metaMorphoRosterEntry, type MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { loadMorphoBaseVault } from "@/lib/sources/chain/morpho-base-vault";
import { loadVaultCensusRow } from "@/lib/vaults/census-read";
import { loadVaultPageSeries } from "@/lib/vaults/yield-read";
import { loadAssetScales } from "@/lib/vaults/asset-scale";
import { readVaultProtects } from "@/lib/vaults/protects-read";
import { protectsLine, underneathLine } from "@/lib/vaults/protects-words";
import { protectsProv, underneathProv } from "@/lib/vaults/protects-provenance";
import { readMockVaultConfig } from "@/lib/mock-layout/vault-config-read";
import { metaMorphoVaultHref } from "@/lib/vaults/routes";

export const dynamic = "force-dynamic";

/** The live sections keep their receipts; the two new tables have none yet. */
export const PROV_EXEMPT =
  "layout mock: the new tiles (configuration, roles and addresses) state no receipts yet; the reused sections keep theirs";

export const metadata: Metadata = {
  title: "Vault page layout mock",
  robots: { index: false, follow: false },
};

const chainOf = (s: string): MetaMorphoChainId | null => (s === "1" ? 1 : s === "8453" ? 8453 : null);

export default async function MockVaultPage({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string; vault: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const p = await params;
  const chainId = chainOf(p.chainId);
  const address = p.vault.toLowerCase();
  if (chainId == null || !(await metaMorphoRosterEntry(chainId, address))) notFound();

  // The holder finder's GET lands here; it goes on to the holder's page, as
  // from the live vault page.
  const holder = (await searchParams).holder;
  const h = (Array.isArray(holder) ? holder[0] : holder)?.trim();
  if (h) redirect(metaMorphoVaultHref(chainId, address, h));

  // The protects read is taken here, once, rather than through
  // VaultProtectsSection: the roles tile needs its guardian.
  const [data, census, series, r] = await Promise.all([
    loadMorphoBaseVault(address, undefined, { chainId }),
    loadVaultCensusRow(chainId, address),
    loadVaultPageSeries(chainId, address),
    readVaultProtects({ chainId, address, kind: "metamorpho" }),
  ]);
  const [assetScales, config] = await Promise.all([
    data.chainStale ? {} : loadAssetScales(chainId, [data.vault.asset.address]),
    readMockVaultConfig(chainId, address, data.vault.createdBlock, r?.block ?? null),
  ]);
  const protects =
    r && r.protects.kind === "metamorpho"
      ? {
          block: r.block,
          guardian: r.protects.guardian,
          protects: {
            line: protectsLine(r.protects),
            info: protectsProv(r.protects, r.chainId, r.block),
            contracts: r.protectsContracts,
          },
          underneath: {
            line: underneathLine(r.underneath),
            info: underneathProv(r.underneath, r.chainId, r.block),
            contracts: r.underneathContracts,
          },
        }
      : null;

  return (
    <div className="min-h-screen py-8" data-mock-page="">
      {data.chainStale ? (
        <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
          This vault could not be read from chain just now, so no figure is stated for it.
        </p>
      ) : (
        <MockVaultLayout
          data={data}
          census={census}
          assetScales={assetScales}
          yieldFigure={series.yieldFigure}
          strip={series.strip}
          protects={protects}
          config={config}
        />
      )}
      <ProvInspectorLayer />
    </div>
  );
}
