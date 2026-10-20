// The roster of Yearn V3 vaults on Ethereum — /ethereum/yearn/vaults.
// ----------------------------------------------------------------------------
// The VAULTS tab of the Yearn V3 rail, and what /ethereum/yearn opens on: this
// protocol's whole product is vaults, so its roster IS the explorer's landing
// page (rails-ops decisions 0027 point 2 and 0028 point 1). Every vault the five
// V3 factories had deployed at the census block, with its name, totals, share
// price and endorsement read from chain at one block, and each row opening that
// vault's factsheet one segment down.
//
// IT IS A PAGE, not a drawer: a Multicall3 wave over 247 vaults is a reading a
// reader chooses to open, and a surface a reader chooses is a surface a reader
// can link to. The loader caches for five minutes and never caches a failure.
//
// NO CENSUS. The rows' Holders slot reads "no census" and there is no listing
// link; one address's holding opens from the vault page's finder (V4). The
// rows are V1 vault rows (ui-jobs 407).
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { YearnVaultDirectoryView } from "@/components/vaults/yearn-vault-directory-view";
import { loadYearnEthereumVaultDirectory, YEARN_CHAIN_ID } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";
import { yearnVaultSummaries } from "@/lib/vaults/summary";
import { loadVaultYields } from "@/lib/vaults/yield-read";

export const dynamic = "force-dynamic";

const PROTOCOL = protocolForHref("/ethereum/yearn")!;

export async function generateMetadata() {
  const roster = await loadYearnVaultRoster();
  return listingMetadata({
    title: "Yearn V3 vaults",
    canonicalPath: "/ethereum/yearn/vaults",
    description: `Every vault the ${roster.factories.length} Yearn V3 factories had deployed on Ethereum at the census block — ${roster.vaults.length.toLocaleString("en-US")} of them, endorsed and unendorsed alike — with each one's name, asset, total assets, share price and endorsement read from chain at one block.`,
  });
}

export default async function YearnVaultRosterPage() {
  const data = await loadYearnEthereumVaultDirectory();
  const yields = await loadVaultYields(
    YEARN_CHAIN_ID,
    data.rows.map((r) => r.address),
  );

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Vaults" />

        {/* `data-roster-panel` marks the rows for the readers that hold them to
            the chain, the same marker the two other vault rosters carry. */}
        <div data-roster-panel>
          <YearnVaultDirectoryView
            vaults={yearnVaultSummaries(data)}
            yields={yields}
            blockNumber={data.blockNumber}
            chainStale={data.chainStale}
            catalogSize={data.catalogSize}
            censusBlock={data.censusBlock}
            endorsementUnread={data.rows.filter((r) => r.endorsed == null).map((r) => r.address)}
          />
        </div>

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
