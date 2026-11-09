// Morpho Blue on Base, the markets roster (/base/morpho/markets), on the shared
// product shell (rails-ops ui-jobs 549 step 5): the chain's head, then one table
// grouped by loan token (lib/morpho/roster.tsx). It sits beside the positions
// listing at /base/morpho and the vault roster at /base/morpho/vaults, which the
// head's ⋮ links. Server-rendered from the singleton at one block.

import { MorphoRosterPage } from "@/lib/morpho/roster";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { rosterData } from "@/lib/morpho/markets-shape";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

// ISR, ten minutes: the same render serves every visitor, and the read stamp
// states the block the page was read at.
export const revalidate = 600;

export const metadata = {
  title: "Morpho Blue markets on Base",
  description:
    "Every Morpho Blue market on Base, grouped by the token it lends: its collateral, LLTV, size, rates and utilisation.",
  ...unlaunchedRobotsForPath("/base/morpho/markets"),
};

export default async function MorphoBaseMarketsPage() {
  const data = await loadMorphoMarketsFromChain(MORPHO_BASE_DEPLOYMENT);
  return <MorphoRosterPage data={rosterData(data)} chainId={MORPHO_BASE_CHAIN_ID} />;
}
