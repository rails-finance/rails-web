"use client";

// Aave V3 on Base — the market overview (/base/aave-v3/market). The explorer's
// front door is the listing at /base/aave-v3 since 2026-08-25; this page is the
// Pool's reserve roster, the /ethereum/aave-v3/market shape.
//
// What is here is complete on its own terms: the whole reserve roster with each
// asset's size, rates and risk parameters, every one of them decoded from the
// reserve's own configuration word rather than a copied governance table, with
// USD from the oracle the Pool liquidates with.

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { aaveMarketOverviewContent } from "@/lib/shared/learn-more-content";

export default function AaveV3BaseMarketPage() {
  return (
    <>
      <AaveMarketPage
        protocol="aave-v3-base"
        chainId={BASE_CHAIN_ID}
        apiRoute="/api/chain/aave-v3-base/market"
        listingHref="/base/aave-v3"
        protocolName="Aave V3"
        marketLabel="Aave V3 · Base"
        purpose="Aave V3's Base deployment: its own Pool, its own reserves and its own risk parameters, separate from the Ethereum market of the same name."
        learnMore={aaveMarketOverviewContent("aave-v3-base")}
      />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
