import type { Metadata } from "next";
import { AlchemixV2Listing } from "@/components/protocol/alchemix/v2-listing";
import { ALCHEMIX_ETHEREUM, v2ListingPath } from "@/lib/alchemix/lines";
import { v2ListingPageData } from "@/lib/alchemix/v2-listing-page-data";
import { listingMetadata } from "@/lib/shared/page-metadata";
import type { RawSearchParams } from "@/lib/shared/listing-ssr";

// Alchemix V2 on Ethereum, the third type tab of the explorer. Every position
// closed on 2026-04-02. `robots: { index: false }` comes from the roster entry's
// `unlaunched: true`, which `listingMetadata` resolves by path prefix.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function generateMetadata(): Metadata {
  return listingMetadata({
    title: "Explore Alchemix V2 Positions",
    canonicalPath: v2ListingPath(ALCHEMIX_ETHEREUM),
    description:
      "Every Alchemix V2 account on the alUSD and alETH lines, closed when V2 was wound down on 2 April 2026: the debt and collateral each held at that block, and the V3 position the wallet holds now.",
  });
}

export default async function AlchemixEthereumV2ListingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const data = await v2ListingPageData(ALCHEMIX_ETHEREUM, await searchParams);
  return <AlchemixV2Listing deployment={ALCHEMIX_ETHEREUM} {...data} />;
}
