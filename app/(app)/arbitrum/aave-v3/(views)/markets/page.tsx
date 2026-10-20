// Aave V3 on Arbitrum — the market overview. The client half is
// markets-page.tsx beside this file.

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AaveV3ArbitrumMarketsPage } from "./markets-page";

export const metadata = listingMetadata({
  title: "Aave V3 on Arbitrum · Market overview",
  canonicalPath: "/arbitrum/aave-v3/markets",
  description:
    "Every reserve of Aave V3's Arbitrum Pool — size, rates, risk configuration and oracle price — read live from the Pool and decoded from each reserve's configuration.",
});

export default function Page() {
  return <AaveV3ArbitrumMarketsPage />;
}
