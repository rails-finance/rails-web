// The roster of MetaMorpho vaults on Base — /base/morpho/vaults. The page is
// the shared roster (components/vaults/metamorpho-roster-page.tsx).

import { MetaMorphoRosterPage } from "@/components/vaults/metamorpho-roster-page";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { toURLSearchParams, type RawSearchParams } from "@/lib/shared/listing-ssr";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Vaults on Base",
  canonicalPath: "/base/morpho/vaults",
  description:
    "Every MetaMorpho vault the two factories had deployed on Base at the census block, with its total assets, share price and 30-day yield read in its own asset, and how many addresses the census has counted in each.",
});

export default async function BaseVaultRosterPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const initialSearch = toURLSearchParams(await searchParams).toString();
  return <MetaMorphoRosterPage chainId={8453} initialSearch={initialSearch} />;
}
