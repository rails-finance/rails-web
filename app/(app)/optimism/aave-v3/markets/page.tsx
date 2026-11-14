// Aave V3 on Optimism — the market overview (/optimism/aave-v3/markets): the
// Pool's reserve roster, the /arbitrum/aave-v3/markets shape, read by
// rails-server at the head (lib/shared/aave-market-configs.ts AAVE_V3_OPTIMISM_MARKET).

import { listingMetadata } from "@/lib/shared/page-metadata";
import { AaveV3OptimismMarketsPage } from "./markets-page";

export const metadata = listingMetadata({
  title: "Aave V3 on Optimism · Market overview",
  canonicalPath: "/optimism/aave-v3/markets",
  description:
    "Every reserve of Aave V3's Optimism Pool: size, rates, risk configuration and oracle price, read from the Pool when the page opens.",
});

export default function Page() {
  return <AaveV3OptimismMarketsPage />;
}
