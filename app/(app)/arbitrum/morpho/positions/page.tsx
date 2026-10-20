// Morpho Blue on Arbitrum — the wallets rails-server has recorded a position
// read for (GET /api/morpho-blue-arbitrum/positions), in the standard listing
// (components/shared/arbitrum-positions-listing.tsx). Private until item 16's
// daily feeder lands: noindex, and a 404 on the production deployment.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { ArbitrumPositionsListing } from "@/components/shared/arbitrum-positions-listing";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { loadMorphoArbitrumPositions } from "@/lib/sources/api/morpho-arbitrum-positions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Positions read · Morpho Blue on Arbitrum",
  robots: { index: false, follow: false },
};

/** Vercel names the production deployment; local dev and preview render. */
const isProductionDeployment = () => process.env.VERCEL_ENV === "production";

export default async function MorphoArbitrumPositionsPage() {
  if (isProductionDeployment()) notFound();
  const answer = await loadMorphoArbitrumPositions({ readerIp: await readerIpFromHeaders() });
  if (!answer)
    return (
      <div className="py-8">
        <div className="mb-6">
          <RailHeader session="morpho-arbitrum" venue="listing" />
        </div>
        <p className="text-sm text-rb-500">The store did not answer; the list could not be read.</p>
      </div>
    );
  return <ArbitrumPositionsListing family="morpho" rows={answer.rows} total={answer.total} />;
}
