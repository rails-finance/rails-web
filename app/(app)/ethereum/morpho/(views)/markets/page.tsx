// Morpho Blue on Ethereum, the markets roster (/ethereum/morpho/markets), on the
// shared product shell (rails-ops ui-jobs 549 step 5): the chain's head, then
// one table grouped by loan token (lib/morpho/roster.tsx). Server-rendered from
// the singleton at one block; the client view takes each loan token's summary
// and the markets that carry its book (lib/morpho/markets-shape rosterData).

import { MorphoRosterPage } from "@/lib/morpho/roster";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { rosterData } from "@/lib/morpho/markets-shape";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// ISR, ten minutes: the same render serves every visitor, and the read stamp
// states the block the page was read at.
export const revalidate = 600;

export const metadata = {
  title: "Morpho Blue markets",
  description:
    "Every Morpho Blue market on Ethereum, grouped by the token it lends: its collateral, LLTV, size, rates and utilisation.",
};

export default async function MorphoMarketsPage() {
  const data = await loadMorphoMarketsFromChain();
  return <MorphoRosterPage data={rosterData(data)} chainId={MAINNET_CHAIN_ID} />;
}
