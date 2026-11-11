"use client";

// Aave V3 on Optimism — the market overview's client half.

import { AaveMarketPage } from "@/lib/aave-family/product";
import { AAVE_V3_OPTIMISM_MARKET } from "@/lib/shared/aave-market-configs";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export function AaveV3OptimismMarketsPage() {
  return (
    <>
      <AaveMarketPage market={AAVE_V3_OPTIMISM_MARKET} />
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
