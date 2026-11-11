// Morpho Blue on Optimism, the markets roster (/optimism/morpho/markets): the shared
// roster on rails-server's markets read
// (components/protocol/morpho-at-block/morpho-at-block-market-routes.tsx).

import { MorphoAtBlockMarketsRoute } from "@/components/protocol/morpho-at-block/morpho-at-block-market-routes";
import { MORPHO_OPTIMISM } from "@/lib/morpho-at-block/types";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Morpho Blue on Optimism · Markets",
  canonicalPath: "/optimism/morpho/markets",
  description:
    "Every Morpho Blue market on Optimism, grouped by the token it lends: its collateral, LLTV, size, rates and utilisation, read from the chain.",
});

export default function MorphoOptimismMarketsPage() {
  return <MorphoAtBlockMarketsRoute dep={MORPHO_OPTIMISM} />;
}
