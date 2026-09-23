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
// THE READ STATES ITS OWN BLOCK, so the rail draws no recency stamp: a stamp
// would name the chain head while every figure below was read at the block the
// view states, which are two different blocks and one of them is not this
// page's.
//
// THE INSPECTOR IS MOUNTED HERE, unlike on the listing. The roster's figures
// carry receipts — the view registers them in its own receipts scope — so the
// toggle has something to open. The listing face has none: it states two
// figures the census header carries and traces neither.

import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { AaveVaultDirectoryView } from "@/components/vaults/aave-vault-directory-view";
import Link from "next/link";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { protocolForHref } from "@/lib/shared/protocols";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { ethereumVaultRosterHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Vaults on Ethereum",
  canonicalPath: "/ethereum/aave/vaults",
  description:
    "Every ERC-4626 vault Aave deploys and publishes on Ethereum — savings GHO, the static aTokens and the Umbrella stake tokens — with total assets, shares issued, share price and each family's own mechanic, read from Aave's enumerators at one block.",
});

const PROTOCOL = protocolForHref("/ethereum/aave")!;

export default async function EthereumVaultRosterPage() {
  // The loader is `unstable_cache`d for five minutes and returns a read that
  // failed as stale rather than caching the failure; the view states which of
  // those it is holding, so a refused read is words here and never an empty
  // panel.
  const data = await loadAaveEthereumVaultDirectory();

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Vaults"
          stamp={
            /* The two surfaces under this roster. The rail's own (i) opens the
               EXPLORER's about page, so the vault layer's own — how the
               catalogue is read and what it refuses to state — is reached from
               here, beside the rows it is about. */
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link href={ethereumVaultsListingHref()} className={PAGE_LINK} prefetch={false}>
                Every address that holds one <span aria-hidden>&rarr;</span>
              </Link>
              <Link href={`${ethereumVaultRosterHref()}/info`} className={PAGE_LINK} prefetch={false}>
                How this is built <span aria-hidden>&rarr;</span>
              </Link>
            </p>
          }
        />

        {/* `data-roster-panel` is where the roster's rows were read from when
            this was a drawer, and it is kept: the rows are the same rows and
            the readers that hold them to the chain scope to it. */}
        <div data-roster-panel>
          <AaveVaultDirectoryView data={data} />
        </div>

        <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
