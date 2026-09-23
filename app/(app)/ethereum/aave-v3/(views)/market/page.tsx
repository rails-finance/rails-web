"use client";

// Aave V3 market overview (/aave-v3/market). Protocol-aggregate, read-only:
// the Core Pool's full reserve roster — size, rates, risk parameters, oracle
// prices — read live from the Pool + IAaveOracle. The V3 carry-across of the
// /aave-v4/hubs shape (single market, so one summary card, not a hub band).
// Scoped to Core, the explorer's market; Prime / EtherFi can join later
// through the same reader (lib/sources/chain/aave-market-overview.ts takes any
// Pool). Framing: present, don't rank — no score, no risk valence.

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { aaveMarketOverviewContent } from "@/lib/shared/learn-more-content";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export default function AaveV3MarketPage() {
  return (
    <>
      <AaveMarketPage
        protocol="aave-v3"
        apiRoute="/api/chain/aave-v3/market"
        listingHref="/ethereum/aave-v3"
        protocolName="Aave V3"
        marketLabel="Aave V3 Core"
        purpose="The main Aave V3 market on Ethereum: one Pool, the broadest reserve roster, every account cross-collateralised under a shared health factor."
        learnMore={aaveMarketOverviewContent("aave-v3")}
      />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
