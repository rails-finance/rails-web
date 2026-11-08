"use client";

// SparkLend market overview (/spark/market). Protocol-aggregate, read-only:
// the single SparkLend Pool's reserve roster — size, rates, risk parameters,
// oracle prices — read live from the Pool + IAaveOracle. Shares the whole
// surface with /aave-v3/market (SparkLend is an Aave V3 fork; one market-
// overview shape, per the presentation-parity rule). Reserve rows drill into
// the listing's per-asset facets (?supply= / ?borrow=).

import { AaveMarketPage } from "@/components/shared/aave-market-page";
import { SPARK_MARKET } from "@/lib/shared/aave-market-configs";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";

export default function SparkMarketPage() {
  return (
    <>
      <AaveMarketPage market={SPARK_MARKET} />
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </>
  );
}
