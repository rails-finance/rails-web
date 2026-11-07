import type { Metadata } from "next";
import { AlchemixListing } from "@/components/protocol/alchemix/alchemix-listing";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import { alchemixListingPageData } from "@/lib/alchemix/listing-page-data";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

// Alchemix V3 on Ethereum — the alUSD and alETH lines.
//
// `robots` is not written here: `listingMetadata` reads it off the roster
// entry.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function generateMetadata(): Metadata {
  return listingMetadata({
    title: "Explore Alchemix positions",
    canonicalPath: ALCHEMIX_ETHEREUM.basePath,
    description:
      "Every Alchemix V3 self-repaying loan on Ethereum (alUSD and alETH): collateral and debt read from the contract, including what redemptions took.",
  });
}

async function AlchemixEthereumListingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const data = await alchemixListingPageData(ALCHEMIX_ETHEREUM, await searchParams);
  return <AlchemixListing deployment={ALCHEMIX_ETHEREUM} {...data} />;
}

export default AlchemixEthereumListingPage;
