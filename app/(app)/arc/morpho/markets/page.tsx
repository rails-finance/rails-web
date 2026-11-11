// Morpho Blue on Arc, the markets roster (/arc/morpho/markets): the shared
// roster (lib/morpho/roster.tsx) on rails-server's markets read
// (lib/morpho-arc/markets.ts), every market from the CreateMarket list read at
// the head when the page opens.

import { MorphoRosterPage } from "@/lib/morpho/roster";
import { rosterData, withRosterMarks } from "@/lib/morpho/markets-shape";
import { fetchMorphoArcMarkets } from "@/lib/api/fetch-morpho-arc";
import { arcMarketsResponse, arcRosterMarks } from "@/lib/morpho-arc/markets";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { STALE_MARKETS } from "@/lib/morpho-arc/stale";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arc · Markets",
  canonicalPath: "/arc/morpho/markets",
  description:
    "Every Morpho Blue market on Arc, grouped by the token it lends: its collateral, LLTV, size, rates and utilisation, read from the chain.",
});

export default async function MorphoArcMarketsPage() {
  const answer = await fetchMorphoArcMarkets();
  if (answer.kind !== "ok")
    return <MorphoRosterPage data={rosterData(STALE_MARKETS, null, "none")} chainId={ARC_CHAIN_ID} />;
  const d = rosterData(arcMarketsResponse(answer.data), null, "none");
  return <MorphoRosterPage data={withRosterMarks(d, arcRosterMarks(answer.data))} chainId={ARC_CHAIN_ID} />;
}
