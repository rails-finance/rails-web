// The roster of IPOR Fusion vaults on Ethereum — /ethereum/ipor-fusion/vaults.
// ----------------------------------------------------------------------------
// The VAULTS tab of the IPOR Fusion rail and what /ethereum/ipor-fusion opens
// on (rails-ops TO-DO-ipor-scoping §6.3; decisions 0027, 0028). Every vault the
// factory made at the census block, with its name, totals and share price read
// from chain at one block, each row opening its factsheet one segment down.
// The loader caches five minutes and never caches a failure.

import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { iporFusionVaultCardContent } from "@/lib/vaults/card-words";
import { IporFusionVaultDirectoryView } from "@/components/vaults/ipor-fusion-vault-directory-view";
import { loadIporFusionVaultDirectory } from "@/lib/sources/chain/ipor-fusion-vault-directory";
import { iporFusionRoster } from "@/lib/ipor-fusion/vault-roster";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { iporFusionVaultSummaries } from "@/lib/vaults/summary";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";

const CHAIN_ID = 1;
const PROTOCOL = protocolForHref("/ethereum/ipor-fusion")!;

export async function generateMetadata() {
  const roster = iporFusionRoster(CHAIN_ID);
  return listingMetadata({
    title: "IPOR Fusion vaults",
    canonicalPath: "/ethereum/ipor-fusion/vaults",
    description: `Every vault the IPOR Fusion factory had made on Ethereum at the census block, ${roster.vaults.length.toLocaleString("en-US")} of them, with each one's name, asset, total assets and share price read from chain at one block.`,
  });
}

export default async function IporFusionVaultRosterPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  const data = await loadIporFusionVaultDirectory(CHAIN_ID);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Vaults" learnMore={iporFusionVaultCardContent()} />
        <div data-roster-panel>
          <IporFusionVaultDirectoryView
            chainId={CHAIN_ID}
            initialSearch={initialSearch}
            vaults={iporFusionVaultSummaries(data)}
            blockNumber={data.blockNumber}
            readBy={serverReadOf(data)}
            chainStale={data.chainStale}
            catalogSize={data.catalogSize}
            censusBlock={data.censusBlock}
            factory={data.factory}
          />
        </div>
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
