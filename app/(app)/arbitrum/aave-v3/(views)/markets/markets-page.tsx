"use client";

// Aave V3 on Arbitrum — the market overview (/arbitrum/aave-v3/markets): the
// Pool's reserve roster, the /base/aave-v3/markets shape. The server half,
// page.tsx beside this file, carries the metadata.

import { AaveMarketPage } from "@/lib/aave-family/product";
import { AAVE_V3_ARBITRUM_MARKET } from "@/lib/shared/aave-market-configs";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export function AaveV3ArbitrumMarketsPage() {
  return (
    <>
      <AaveMarketPage market={AAVE_V3_ARBITRUM_MARKET} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
