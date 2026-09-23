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
// NO POSITION LANE. There is no Positions column and no listing link, because
// Yearn has neither here: the census that counts holders is built per vault
// layer and Yearn's is later work. What this page states, it read from the
// vaults themselves.
import Link from "next/link";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { YearnVaultDirectoryView } from "@/components/vaults/yearn-vault-directory-view";
import { loadYearnEthereumVaultDirectory, YEARN_CHAIN_ID } from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { yearnVaultRosterHref } from "@/lib/vaults/routes";
import { loadYearnVaultRoster } from "@/lib/yearn/vault-roster";

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

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Vaults"
          stamp={
            <>
              {!data.chainStale && (
                <p className="mt-2 text-[11px] text-rb-500" data-directory-block={data.blockNumber}>
                  Read at block{" "}
                  <a
                    href={explorerUrl(YEARN_CHAIN_ID, "block", data.blockNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-external"
                  >
                    {data.blockNumber.toLocaleString("en-US")}
                  </a>{" "}
                  · every name, total, share price and endorsement below is a call answered at that block, re-read at
                  most every five minutes.
                </p>
              )}
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={`${yearnVaultRosterHref()}/info`} className={PAGE_LINK} prefetch={false}>
                  How this is built <span aria-hidden>→</span>
                </Link>
              </p>
            </>
          }
        />

        {/* `data-roster-panel` marks the rows for the readers that hold them to
            the chain, the same marker the two older vault rosters carry. The
            view states a refused read in words, so this is never an empty
            panel. */}
        <div data-roster-panel>
          <YearnVaultDirectoryView data={data} />
        </div>

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
