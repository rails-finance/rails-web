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
import { AAVE_V3_BASE_MARKET } from "@/lib/shared/aave-market-configs";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export default function AaveV3BaseMarketPage() {
  return (
    <>
      <AaveMarketPage market={AAVE_V3_BASE_MARKET} />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
