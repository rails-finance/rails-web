import type { Metadata } from "next";
import { AlchemixListing } from "@/components/protocol/alchemix/alchemix-listing";
import { ALCHEMIX_BASE } from "@/lib/alchemix/lines";
import { alchemixListingPageData } from "@/lib/alchemix/listing-page-data";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

// Alchemix V3 on Base — the alUSDb line.
//
// The description differs from the Ethereum explorer's because the answer
// differs: Base has had no redemption, so a position's figures replay from its
// own events and are exact to the wei, while Ethereum's are read from the
// contract at a block. That is the one sentence a reader needs and it belongs
// in the page's own words (rails-ops decisions/0032).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function generateMetadata(): Metadata {
  return listingMetadata({
    title: "Explore Alchemix Positions",
    canonicalPath: ALCHEMIX_BASE.basePath,
    description:
      "Every Alchemix V3 position on the alUSDb line. This line has had no redemption, so each figure here is replayed from the position's own events and is exact to the wei at the block shown beside it.",
  });
}

export default async function AlchemixBaseListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const data = await alchemixListingPageData(ALCHEMIX_BASE, await searchParams);
  return <AlchemixListing deployment={ALCHEMIX_BASE} {...data} />;
}
