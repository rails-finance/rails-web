"use client";

// Aave V3 on Arbitrum — the market overview (/arbitrum/aave-v3/markets): the
// Pool's reserve roster, the /base/aave-v3/market shape. The server half,
// page.tsx beside this file, carries the metadata.

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { AAVE_V3_ARBITRUM_MARKET } from "@/lib/shared/aave-market-configs";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export function AaveV3ArbitrumMarketsPage() {
  return (
    <>
      <AaveMarketPage market={AAVE_V3_ARBITRUM_MARKET} />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
