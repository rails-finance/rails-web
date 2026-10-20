"use client";

// Aave V3 on Arbitrum — the market overview (/arbitrum/aave-v3/markets): the
// Pool's reserve roster, the /base/aave-v3/market shape. The server half,
// page.tsx beside this file, carries the metadata.

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";
import { aaveV3MarketModal } from "@/lib/aave-v3/event-templates";

export function AaveV3ArbitrumMarketsPage() {
  return (
    <>
      <AaveMarketPage
        protocol="aave-v3-arbitrum"
        chainId={ARBITRUM_CHAIN_ID}
        apiRoute="/api/chain/aave-v3-arbitrum/market"
        listingHref="/arbitrum/aave-v3"
        protocolName="Aave V3"
        marketLabel="Aave V3 · Arbitrum"
        purpose="Aave V3's Arbitrum deployment: its own Pool, its own reserves and its own risk parameters, separate from the Ethereum market of the same name."
        learnMore={aaveV3MarketModal("aave-v3-arbitrum")}
      />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
