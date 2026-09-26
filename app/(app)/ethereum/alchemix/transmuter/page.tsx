import type { Metadata } from "next";
import { TransmuterListing } from "@/components/protocol/alchemix/transmuter-listing";
import { ALCHEMIX_ETHEREUM, transmuterListingPath } from "@/lib/alchemix/lines";
import { transmuterListingPageData } from "@/lib/alchemix/transmuter-listing-page-data";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

// Alchemix V3 Transmuter positions on Ethereum, the second type tab of the
// explorer. `robots: { index: false }` comes from the roster entry's
// `unlaunched: true`, which `listingMetadata` resolves by path prefix.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function generateMetadata(): Metadata {
  return listingMetadata({
    title: "Explore Alchemix Transmuter Positions",
    canonicalPath: transmuterListingPath(ALCHEMIX_ETHEREUM),
    description:
      "Every Alchemix V3 Transmuter position on the alUSD and alETH lines: the synthetic each one staked, the block it matures at, and what its claim paid out, each from the Transmuter's own events.",
  });
}

export default async function AlchemixEthereumTransmuterListingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const data = await transmuterListingPageData(ALCHEMIX_ETHEREUM, await searchParams);
  return <TransmuterListing deployment={ALCHEMIX_ETHEREUM} {...data} />;
}
