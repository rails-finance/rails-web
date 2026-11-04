// The roster of MetaMorpho vaults on Ethereum — /ethereum/morpho/vaults
// (rails-ops ui-jobs 486). The page is the shared roster
// (components/vaults/metamorpho-roster-page.tsx).

import { MetaMorphoRosterPage } from "@/components/vaults/metamorpho-roster-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Vaults on Ethereum",
  canonicalPath: "/ethereum/morpho/vaults",
  description:
    "Every MetaMorpho vault the two factories had deployed on Ethereum at the census block, with its total assets, share price and 30-day yield read in its own asset, and how many addresses the census has counted in each.",
});

export default async function EthereumMorphoVaultRosterPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  return <MetaMorphoRosterPage chainId={1} initialSearch={initialSearch} />;
}
