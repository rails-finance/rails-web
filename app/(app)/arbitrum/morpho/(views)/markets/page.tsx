// Morpho Blue on Arbitrum, the markets roster (/arbitrum/morpho/markets), on the
// shared product shell (rails-ops ui-jobs 549 step 5): the chain's head, then
// one table grouped by loan token (lib/morpho/roster.tsx), each row opening its
// market's page. The census's markets read at the head per request: no index
// serves this chain's state, so the page is never read at build.

import { MorphoRosterPage } from "@/lib/morpho/roster";
import { loadMorphoRoster } from "@/lib/sources/chain/morpho-roster-reads";
import { MORPHO_ARBITRUM_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_ARBITRUM_CHAIN_ID } from "@/lib/morpho-arbitrum/asset-catalog";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arbitrum · Markets",
  canonicalPath: "/arbitrum/morpho/markets",
  description:
    "Every Morpho Blue market censused on Arbitrum, grouped by the token it lends: its collateral, LLTV, size, rates and utilization, read from the chain.",
});

export default async function MorphoArbitrumMarketsPage() {
  const data = await loadMorphoRoster(MORPHO_ARBITRUM_DEPLOYMENT, MORPHO_ARBITRUM_CHAIN_ID);
  return <MorphoRosterPage data={data} chainId={MORPHO_ARBITRUM_CHAIN_ID} />;
}
