// Morpho Blue on Arc, the markets roster (/arc/morpho/markets): the shared
// roster on rails-server's markets read
// (components/protocol/morpho-at-block/morpho-at-block-market-routes.tsx).

import { MorphoAtBlockMarketsRoute } from "@/components/protocol/morpho-at-block/morpho-at-block-market-routes";
import { MORPHO_ARC } from "@/lib/morpho-at-block/types";
import { listingMetadata } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arc · Markets",
  canonicalPath: "/arc/morpho/markets",
  description:
    "Every Morpho Blue market on Arc, grouped by the token it lends: its collateral, LLTV, size, rates and utilization, read from the chain.",
});

export default function MorphoArcMarketsPage() {
  return <MorphoAtBlockMarketsRoute dep={MORPHO_ARC} />;
}
