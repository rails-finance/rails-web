// The roster of MetaMorpho vaults on Base — /base/morpho/vaults.
// ----------------------------------------------------------------------------
// The VAULTS tab of the Morpho Blue Base rail. MetaMorpho is Morpho's own vault
// layer, so the vaults live inside this explorer rather than in a section
// beside it (rails-ops decision 0028): every vault the two factories had
// deployed at the census block, with its name, totals, share price and curator
// read from chain at one block, and each row opening that vault's own page one
// segment down.
//
// IT IS A PAGE, not a drawer: a Multicall3 wave over the whole catalogue is a
// reading a reader chooses to open, and a surface a reader chooses is a surface
// a reader can link to. The loader caches for five minutes and never caches a
// failure.
//
// TWO LANES MEET HERE AND ARE KEPT APART IN THE WORDS. The roster's own columns
// are the chain reading at the block this page names; the Positions column is
// the census's, at the census block. A vault the census swept and found nobody
// in says "no holder yet" — a chain reading, and the reason it is offered as no
// filter option on the listing.
//
import Link from "next/link";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { VaultDirectoryView } from "@/components/vaults/vault-directory-view";
import { loadMorphoBaseVaultDirectory } from "@/lib/sources/chain/morpho-base-vault-directory";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ssrHop } from "@/lib/shared/listing-ssr";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { protocolForHref } from "@/lib/shared/protocols";
import { explorerUrl } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_BASE_METAMORPHO_FACTORIES } from "@/lib/morpho-base/vault-catalog";
import { baseVaultRosterHref } from "@/lib/vaults/routes";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";

export const dynamic = "force-dynamic";

const PROTOCOL = protocolForHref("/base/morpho")!;

/** The vault families this roster catalogues, stated on its denominator line.
 *  Read off the census's own factory list rather than written down a second
 *  time — a family exists here exactly when a factory made it. */
const FAMILIES = MORPHO_BASE_METAMORPHO_FACTORIES.map((f) => f.version.replace(/^v/, "MetaMorpho V"));

export const metadata = listingMetadata({
  title: "Vaults on Base",
  canonicalPath: "/base/morpho/vaults",
  description:
    "Every MetaMorpho vault the two factories had deployed on Base at the census block, with its name, asset, total assets, shares issued, share price and curator read from chain at one block, and how many addresses the census has counted in each.",
});

/** The census header alone — one row per catalogued vault, no live overlay:
 *  the roster's Positions column is the census's count, and nothing on this
 *  page is about a position. An unanswered census leaves that column and its
 *  paragraph out rather than printing a zero nobody read. */
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
  const [data, census] = await Promise.all([loadMorphoBaseVaultDirectory(), loadCensus()]);

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
                    href={explorerUrl(MORPHO_BASE_CHAIN_ID, "block", data.blockNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-external"
                  >
                    {data.blockNumber.toLocaleString("en-US")}
                  </a>{" "}
                  · every name, total, share price and curator below is a call answered at that block, re-read at most
                  every five minutes.
                </p>
              )}
              {/* The two surfaces under this roster. The rail's own (i) opens
                  the EXPLORER's about page, so the vault layer's own — how the
                  census is swept and what it refuses to state — is reached from
                  here, beside the rows it is about. */}
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={`${baseVaultRosterHref()}/positions`} className={PAGE_LINK} prefetch={false}>
                  Every address that holds one <span aria-hidden>→</span>
                </Link>
                <Link href={`${baseVaultRosterHref()}/info`} className={PAGE_LINK} prefetch={false}>
                  How this is built <span aria-hidden>→</span>
                </Link>
              </p>
            </>
          }
        />

        {/* `data-roster-panel` is where the roster's rows were read from when
            this was a drawer, and it is kept: the rows are the same rows and
            the readers that hold them to the chain scope to it. The view states
            a refused read in words, so this is never an empty panel. */}
        <div data-roster-panel>
          <VaultDirectoryView data={data} census={census} families={FAMILIES} />
        </div>

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
