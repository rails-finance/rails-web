// Aave V3 on Arbitrum — the wallets rails-server has recorded a position
// read for (GET /api/aave-v3-arbitrum/positions), in the standard listing
// (components/shared/arbitrum-positions-listing.tsx). Private until item 16's
// daily feeder lands: noindex, and a 404 on the production deployment.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { ArbitrumPositionsListing } from "@/components/shared/arbitrum-positions-listing";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { loadAaveV3ArbitrumPositions } from "@/lib/sources/api/aave-v3-arbitrum-positions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Positions read · Aave V3 on Arbitrum",
  robots: { index: false, follow: false },
};

/** Vercel names the production deployment; local dev and preview render. */
const isProductionDeployment = () => process.env.VERCEL_ENV === "production";

export default async function AaveV3ArbitrumPositionsPage() {
  if (isProductionDeployment()) notFound();
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
  // A read that found nothing held is not a position; the footer counts it.
  const open = answer.rows.filter((r) => r.chainOpen === true);
  return <ArbitrumPositionsListing family="aave-v3" rows={open} recorded={answer.total} />;
}
