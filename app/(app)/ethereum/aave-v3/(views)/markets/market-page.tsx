"use client";

// Aave V3 markets on Ethereum (/ethereum/aave-v3/markets): with no `?market=`,
// the overview of the Core, Prime and EtherFi Pools (anatomy M4); with
// `?market=core|prime|etherfi`, that Pool's panel and reserves table (M1)
// (lib/shared/aave-market-configs.ts).
// Protocol-aggregate, read-only: the Pool's full reserve roster — size, rates,
// risk parameters, oracle prices — read live from the Pool + IAaveOracle.
// Framing: present, don't rank — no score, no risk valence.

import { AaveMarketPage, AaveMarketsOverview } from "@/lib/aave-family/product";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { ETHEREUM_AAVE_V3_MARKETS, ethereumAaveV3Market } from "@/lib/shared/aave-market-configs";

const OVERVIEW = ETHEREUM_AAVE_V3_MARKETS.map((x) => x.config);

export function AaveV3MarketPage({ market }: { market?: string }) {
  return (
    <>
      {market ? <AaveMarketPage market={ethereumAaveV3Market(market)} /> : <AaveMarketsOverview markets={OVERVIEW} />}
      {/* Each section arms the inspector from its ⋮; no page-wide toggle. */}
      <ProvInspectorLayer />
    </>
  );
}
