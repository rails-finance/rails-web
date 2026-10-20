// The roster of MetaMorpho vaults on Base — /base/morpho/vaults.
// ----------------------------------------------------------------------------
// The VAULTS tab of the Morpho Blue Base rail. MetaMorpho is Morpho's own vault
// layer, so the vaults live inside this explorer rather than in a section
// beside it (rails-ops decision 0028): every vault the two factories had
// deployed at the census block, one vault row each (ui-jobs 407, V1), opening
// that vault's own page one segment down.
//
// IT IS A PAGE, not a drawer: a Multicall3 wave over the whole catalogue is a
// reading a reader chooses to open, and a surface a reader chooses is a surface
// a reader can link to. The loader caches for five minutes and never caches a
// failure.
//
// TWO LANES MEET HERE. The rows' Total assets and Share price are the chain
// reading at the block the roster names; Holders is the census's, at the census
// block; Yield is the daily store's (decision 0047).
//
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { VaultDirectoryView } from "@/components/vaults/vault-directory-view";
import { loadMorphoBaseVaultDirectory } from "@/lib/sources/chain/morpho-base-vault-directory";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { morphoBaseVaultSummaries } from "@/lib/vaults/summary";
import { loadVaultYields } from "@/lib/vaults/yield-read";

export const dynamic = "force-dynamic";

const PROTOCOL = protocolForHref("/base/morpho")!;

export const metadata = listingMetadata({
  title: "Vaults on Base",
  canonicalPath: "/base/morpho/vaults",
  description:
    "Every MetaMorpho vault the two factories had deployed on Base at the census block, with its total assets, share price and 30-day yield read in its own asset, and how many addresses the census has counted in each.",
});

/** The census header alone — one row per catalogued vault, no live overlay:
 *  the rows' Holders figure is the census's count. An unanswered census leaves
 *  the figure out rather than printing a zero nobody read. */
async function loadCensus(): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId: MORPHO_BASE_CHAIN_ID, overlay: false, limit: 1, ...hop });
    return r.census;
  } catch (error) {
    console.error("The vault census did not answer for the Base roster:", error);
    return [];
  }
}

export default async function BaseVaultRosterPage() {
  const data = await loadMorphoBaseVaultDirectory();
  const [census, yields] = await Promise.all([
    loadCensus(),
    loadVaultYields(
      MORPHO_BASE_CHAIN_ID,
      data.rows.map((r) => r.address),
    ),
  ]);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Vaults" />

        {/* `data-roster-panel` marks the rows for the readers that hold them to
            the chain. The view states a refused read in words, so this is never
            an empty panel. */}
        <div data-roster-panel>
          <VaultDirectoryView
            vaults={morphoBaseVaultSummaries(data, census)}
            yields={yields}
            blockNumber={data.blockNumber}
            chainStale={data.chainStale}
            catalogSize={data.catalogSize}
            censusBlock={data.censusBlock}
            withCensus={census.length > 0}
          />
        </div>

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
