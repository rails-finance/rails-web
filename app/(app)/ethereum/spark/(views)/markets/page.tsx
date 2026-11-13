"use client";

// SparkLend market overview (/spark/markets). Protocol-aggregate, read-only:
// the single SparkLend Pool's reserve roster — size, rates, risk parameters,
// oracle prices — read live from the Pool + IAaveOracle. Shares the whole
// surface with /aave-v3/markets (SparkLend is an Aave V3 fork; one market-
// overview shape, per the presentation-parity rule). Reserve rows drill into
// the listing's per-asset facets (?supply= / ?borrow=).

import { AaveMarketPage } from "@/lib/aave-family/product";
import { SPARK_MARKET } from "@/lib/shared/aave-market-configs";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export default function SparkMarketPage() {
  return (
    <>
      <AaveMarketPage market={SPARK_MARKET} />
      {/* The inspector, armed from the profile menu's switch. */}
      <ProvInspectorLayer />
    </>
  );
}
