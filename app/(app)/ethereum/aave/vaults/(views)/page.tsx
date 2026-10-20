// The roster of Aave vaults on Ethereum — /ethereum/aave/vaults.
// ----------------------------------------------------------------------------
// The VAULTS tab of the section rail. The section route beside it lists
// POSITIONS; this states the vaults those positions are in, read from Aave's
// own enumerators at one block it names.
//
// IT IS A PAGE AGAIN. It was the section's front door, then a drawer beside the
// listing, and it is a page now — because it is a READING (a Multicall3 wave
// over eighteen vaults) that a reader chooses to open, and a surface a reader
// chooses is a surface a reader can link to. On the listing's own path it cost
// a second of every page-load for a panel most readers never opened; here it
// costs it only when it is asked for, and the loader's five-minute cache means
// a second reader in that window pays nothing.
//
// THE READ STATES ITS OWN BLOCK, so the rail draws no recency stamp: the
// roster's read-at line names the block every row's figures were read at. The
// rows are V1 vault rows (ui-jobs 407).
//
// THE INSPECTOR IS MOUNTED HERE, unlike on the listing. The roster's figures
// carry receipts — the view registers them in its own receipts scope — so the
// toggle has something to open. The listing face has none: it states two
// figures the census header carries and traces neither.

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { AaveVaultDirectoryView } from "@/components/vaults/aave-vault-directory-view";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { protocolForHref } from "@/lib/shared/protocols";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { aaveVaultAttestation } from "@/lib/aave-vaults/vault-catalog";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { aaveEthereumVaultSummaries } from "@/lib/vaults/summary";
import { loadVaultYields } from "@/lib/vaults/yield-read";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Vaults on Ethereum",
  canonicalPath: "/ethereum/aave/vaults",
  description:
    "Every ERC-4626 vault Aave deploys and publishes on Ethereum — savings GHO, the static aTokens and the Umbrella stake tokens — with total assets, share price and 30-day yield in each vault's own asset, read from Aave's enumerators at one block, and how many addresses the census has counted in each.",
});

const PROTOCOL = protocolForHref("/ethereum/aave")!;

/** The census header for Ethereum's Aave vaults: the rows' Holders figure. An
 *  unanswered census leaves the figure out. */
async function loadCensus(): Promise<VaultCensusRow[]> {
  try {
    const hop = await ssrHop();
    const r = await fetchVaultPositions({ chainId: MAINNET_CHAIN_ID, overlay: false, limit: 1, ...hop });
    return r.census;
  } catch (error) {
    console.error("The vault census did not answer for the Aave roster:", error);
    return [];
  }
}

export default async function EthereumVaultRosterPage() {
  // The loader is `unstable_cache`d for five minutes and returns a read that
  // failed as stale rather than caching the failure; the view states which of
  // those it is holding.
  const data = await loadAaveEthereumVaultDirectory();
  const [census, yields] = await Promise.all([
    loadCensus(),
    loadVaultYields(
      MAINNET_CHAIN_ID,
      data.rows.map((r) => r.address),
    ),
  ]);
  const vaults = aaveEthereumVaultSummaries(
    data,
    (address) => aaveVaultAttestation(address, data.rows.find((r) => r.address === address)!.family).kind === "book",
    census,
  );

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Vaults" />

        {/* `data-roster-panel` marks the rows for the readers that hold them to
            the chain. */}
        <div data-roster-panel>
          <AaveVaultDirectoryView
            vaults={vaults}
            yields={yields}
            blockNumber={data.blockNumber}
            chainStale={data.chainStale}
            counts={{ catalogSize: data.catalogSize, stataCount: data.stataCount, stakeCount: data.stakeCount }}
            censusBlock={census.length > 0 ? Math.max(...census.map((c) => c.censusBlock)) : null}
          />
        </div>

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
