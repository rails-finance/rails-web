// ONE IPOR FUSION VAULT'S PAGE — /ethereum/ipor-fusion/vaults/<vault>.
// ----------------------------------------------------------------------------
// The factsheet (rails-ops TO-DO-ipor-scoping §6.3), drawn by
// components/vaults/ipor-fusion-vault-page.tsx from one block's read. Serves
// every vault the census holds; any other address 404s, which means "not in
// this census" and never "not an IPOR Fusion vault".

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { RailHeader } from "@/components/shared/rail-header";
import { IporFusionVaultPage } from "@/components/vaults/ipor-fusion-vault-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { iporFusionVaultHref } from "@/lib/vaults/routes";
import { iporFusionRosterEntry } from "@/lib/ipor-fusion/vault-roster";
import { loadIporFusionVault } from "@/lib/sources/chain/ipor-fusion-vault";
import { FocusSourceGate } from "@/components/shared/aim-gate";

export const dynamic = "force-dynamic";

const CHAIN_ID = 1;

type Props = { params: Promise<{ vault: string }> };

/** One read per request: metadata and the page share it. */
const load = cache((vault: string) => loadIporFusionVault(CHAIN_ID, vault));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!iporFusionRosterEntry(CHAIN_ID, address)) return { title: "IPOR Fusion vault" };
  const data = await load(address);
  const name = data.vault.name ?? data.vault.censusName ?? address;
  return listingMetadata({
    title: `${name} · IPOR Fusion`,
    description: `What the ${name} vault holds, its fees and supply cap, who holds the roles over it and the fuses it acts through, read from the contracts at one block.`,
    canonicalPath: iporFusionVaultHref(CHAIN_ID, address)!,
  });
}

export default async function IporFusionVaultRoute({ params }: Props) {
  const { vault } = await params;
  const address = vault.toLowerCase();
  if (!iporFusionRosterEntry(CHAIN_ID, address)) notFound();
  const data = await load(address);
  return (
    <FocusSourceGate source={data.vault} chain={CHAIN_ID} what="This vault">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            <RailHeader session="ipor-fusion" venue="subPage" />
          </header>
          {data.chainStale ? (
            <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">
              This vault could not be read from chain just now, so no figure is stated for it.
            </p>
          ) : (
            <IporFusionVaultPage data={data} />
          )}
          <ProvInspectorLayer />
        </div>
      </div>
    </FocusSourceGate>
  );
}
