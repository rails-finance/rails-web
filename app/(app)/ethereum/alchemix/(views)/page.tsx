import type { Metadata } from "next";
import { AlchemixListing } from "@/components/protocol/alchemix/alchemix-listing";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { alchemixListingPageData } from "@/lib/alchemix/listing-page-data";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

// Alchemix V3 on Ethereum — the alUSD and alETH lines.
//
// `robots: { index: false }` is not written here: the roster entry carries
// `unlaunched: true`, and `listingMetadata` reads it. The route serves and
// renders; nothing on the site points at it.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function generateMetadata(): Metadata {
  return listingMetadata({
    title: "Explore Alchemix Positions",
    canonicalPath: ALCHEMIX_ETHEREUM.basePath,
    description:
      "Every Alchemix V3 position on the alUSD and alETH lines. Both lines have had a redemption, which moves every open position's debt at once, so each figure here is read from the contract at the block shown beside it.",
  });
}

export default async function AlchemixEthereumListingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const data = await alchemixListingPageData(ALCHEMIX_ETHEREUM, await searchParams);
  return <AlchemixListing deployment={ALCHEMIX_ETHEREUM} {...data} />;
}
