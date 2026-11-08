"use client";

// Aave V3 market overview on Ethereum (/ethereum/aave-v3/market): Core, or the
// Prime or EtherFi Pool on `?market=` (lib/shared/aave-market-configs.ts).
// Protocol-aggregate, read-only: the Pool's full reserve roster — size, rates,
// risk parameters, oracle prices — read live from the Pool + IAaveOracle.
// Framing: present, don't rank — no score, no risk valence.

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { ethereumAaveV3Market } from "@/lib/shared/aave-market-configs";

export function AaveV3MarketPage({ market }: { market?: string }) {
  return (
    <>
      <AaveMarketPage market={ethereumAaveV3Market(market)} />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
