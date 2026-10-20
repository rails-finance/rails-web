// Morpho Blue on Arbitrum — the market overview. The client half is
// markets-page.tsx beside this file.

import { listingMetadata } from "@/lib/shared/page-metadata";
import { MorphoArbitrumMarketsPage } from "./markets-page";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arbitrum · Market overview",
  canonicalPath: "/arbitrum/morpho/markets",
  description:
    "The Morpho Blue markets censused on Arbitrum, read live from the singleton at one block: the funded ones in dollar stables or WETH ranked by supply in dollars, the rest in their own loan tokens.",
});

export default function Page() {
  return <MorphoArbitrumMarketsPage />;
}
