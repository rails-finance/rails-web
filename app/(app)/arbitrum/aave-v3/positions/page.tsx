// Aave V3 on Arbitrum — the wallets rails-server has recorded a position
// read for (GET /api/aave-v3-arbitrum/positions), in the standard listing
// (components/shared/arbitrum-positions-listing.tsx). Public on every deployment
// (rails-ops TO-DO-arbitrum-scoping.md item 16).

import { RailHeader } from "@/components/shared/rail-header";
import { ArbitrumPositionsListing } from "@/components/shared/arbitrum-positions-listing";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { loadAaveV3ArbitrumPositions } from "@/lib/sources/api/aave-v3-arbitrum-positions";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Explore Aave V3 Positions on Arbitrum",
  canonicalPath: "/arbitrum/aave-v3/positions",
});

export default async function AaveV3ArbitrumPositionsPage() {
  const answer = await loadAaveV3ArbitrumPositions({ readerIp: await readerIpFromHeaders() });
  if (!answer)
    return (
      <div className="py-8">
        <div className="mb-6">
          <RailHeader session="aave-v3-arbitrum" venue="listing" />
        </div>
        <p className="text-sm text-rb-500">The store did not answer; the list could not be read.</p>
      </div>
    );
  // A read that found nothing held is not a position.
  const open = answer.rows.filter((r) => r.chainOpen === true);
  return <ArbitrumPositionsListing family="aave-v3" rows={open} recorded={answer.total} />;
}
