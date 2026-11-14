// The roster of MetaMorpho vaults on one chain — /base/morpho/vaults and
// /ethereum/morpho/vaults (rails-ops ui-jobs 486).
// ----------------------------------------------------------------------------
// The VAULTS tab of the Morpho Blue rail on that chain. MetaMorpho is Morpho's
// own vault layer, so the vaults live inside this explorer rather than in a
// section beside it (rails-ops decision 0028): every vault the two factories
// had deployed at the roster's block, one vault row each (ui-jobs 407, V1).
//
// IT IS A PAGE, not a drawer: a Multicall3 wave over the whole catalogue is a
// reading a reader chooses to open, and a surface a reader chooses is a surface
// a reader can link to. The loader caches for five minutes and never caches a
// failure.
//
// TWO LANES MEET HERE. The rows' Total assets and Share price are the chain
// reading at the block the roster names; Holders is the census's, at the census
// block; Yield is the daily store's (decision 0047). On chain 1 the census read
// is scoped to `morpho`: the chain also holds Aave's vault families.
//
// SERVER-ONLY.

import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { morphoVaultCardContent } from "@/lib/vaults/card-words";
import { VaultDirectoryView } from "@/components/vaults/vault-directory-view";
import { loadMetaMorphoVaultDirectory } from "@/lib/sources/chain/morpho-base-vault-directory";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { protocolForPathname } from "@/lib/shared/protocols";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import type { MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";
import { morphoBaseVaultSummaries, withAssetScale } from "@/lib/vaults/summary";
import { loadVaultYields } from "@/lib/vaults/yield-read";
import { loadAssetScales } from "@/lib/vaults/asset-scale";
import { metaMorphoVaultRosterHref } from "@/lib/vaults/routes";

/** The census header alone — one row per catalogued vault, no live overlay:
 *  the rows' Holders figure is the census's count. An unanswered census leaves
 *  the figure out rather than printing a zero nobody read. */
export async function loadMetaMorphoCensus(chainId: MetaMorphoChainId): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({
      chainId,
      families: chainId === 1 ? "morpho" : undefined,
      overlay: false,
      limit: 1,
      ...hop,
    });
    return r.census;
  } catch (error) {
    console.error(`The vault census did not answer for the MetaMorpho roster (chain ${chainId}):`, error);
    return [];
  }
}

export async function MetaMorphoRosterPage({
  chainId,
  initialSearch,
}: {
  chainId: MetaMorphoChainId;
  initialSearch: string;
}) {
  const protocol = protocolForPathname(metaMorphoVaultRosterHref(chainId))!;
  const data = await loadMetaMorphoVaultDirectory(chainId);
  const [census, yields, scales] = await Promise.all([
    loadMetaMorphoCensus(chainId),
    loadVaultYields(
      chainId,
      data.rows.map((r) => r.address),
    ),
    // The "decimals disagree" standing, as the index reads it (ui-jobs 664).
    loadAssetScales(chainId, [...new Set(data.rows.map((r) => r.asset.address))]),
  ]);

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={protocol} title="Vaults" learnMore={morphoVaultCardContent()} />

        {/* `data-roster-panel` marks the rows for the readers that hold them to
            the chain. The view states a refused read in words, so this is never
            an empty panel. */}
        <div data-roster-panel>
          <VaultDirectoryView
            chainId={chainId}
            initialSearch={initialSearch}
            vaults={morphoBaseVaultSummaries(data, census).map((v) => withAssetScale(v, scales))}
            yields={yields}
            blockNumber={data.blockNumber}
            readBy={serverReadOf(data)}
            chainStale={data.chainStale}
            catalogSize={data.catalogSize}
            censusBlock={data.censusBlock}
            withCensus={census.length > 0}
          />
        </div>

        {/* The inspector, armed from the profile menu's switch. */}
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
