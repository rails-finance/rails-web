// Morpho Blue on Arbitrum — the wallets rails-server has recorded a position
// read for (GET /api/morpho-blue-arbitrum/positions), in the standard listing
// (components/shared/arbitrum-positions-listing.tsx). Public on every deployment
// (rails-ops TO-DO-arbitrum-scoping.md item 16).

import { RailHeader } from "@/components/shared/rail-header";
import { ArbitrumPositionsListing } from "@/components/shared/arbitrum-positions-listing";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { loadMorphoArbitrumPositions } from "@/lib/sources/api/morpho-arbitrum-positions";
import { loadArbitrumCensus } from "@/lib/sources/api/arbitrum-census";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Explore Morpho Blue Positions on Arbitrum",
  canonicalPath: "/arbitrum/morpho/positions",
});

export default async function MorphoArbitrumPositionsPage() {
  const readerIp = await readerIpFromHeaders();
  const [answer, census] = await Promise.all([
    loadMorphoArbitrumPositions({ readerIp }),
    loadArbitrumCensus("morpho-arbitrum"),
  ]);
  if (!answer)
    return (
      <div className="py-8">
        <div className="mb-6">
          <RailHeader session="morpho-arbitrum" venue="listing" />
        </div>
        <p className="text-sm text-rb-500">The store did not answer; the list could not be read.</p>
      </div>
    );
  // A read that found nothing held is not a position.
  const open = answer.rows.filter((r) => r.chainOpen === true);
  return <ArbitrumPositionsListing family="morpho" rows={open} recorded={answer.total} census={census} />;
}
