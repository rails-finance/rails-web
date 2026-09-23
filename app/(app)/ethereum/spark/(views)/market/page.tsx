"use client";

// SparkLend market overview (/spark/market). Protocol-aggregate, read-only:
// the single SparkLend Pool's reserve roster — size, rates, risk parameters,
// oracle prices — read live from the Pool + IAaveOracle. Shares the whole
// surface with /aave-v3/market (SparkLend is an Aave V3 fork; one market-
// overview shape, per the presentation-parity rule). Reserve rows drill into
// the listing's per-asset facets (?supply= / ?borrow=).

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { aaveMarketOverviewContent } from "@/lib/shared/learn-more-content";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export default function SparkMarketPage() {
  return (
    <>
      <AaveMarketPage
        protocol="spark"
        apiRoute="/api/chain/spark/market"
        listingHref="/ethereum/spark"
        protocolName="SparkLend"
        marketLabel="SparkLend"
        purpose="The single SparkLend market: an Aave-V3-architecture Pool governed by Sky, centred on stablecoin liquidity against sDAI, ETH and BTC collateral."
        learnMore={aaveMarketOverviewContent("spark")}
        assetHref={(symbol, side) =>
          `/ethereum/spark?${side === "supply" ? "supply" : "borrow"}=${encodeURIComponent(symbol)}`
        }
      />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
