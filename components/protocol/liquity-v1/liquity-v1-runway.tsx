"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";

/**
 * Liquidation runway for a Liquity V1 Trove — the shared bar in its PRICE mode
 * (unlike the Aave-family pooled accounts, a Trove has exactly one collateral
 * asset, so the axis can be the real ETH price): value = the protocol's own
 * PriceFeed price, liquidation line = the price at which the collateral ratio
 * hits the 110% minimum (entire debt × MCR ÷ entire collateral — the
 * liquidation equation rearranged for price, every input a chain read at the
 * same block). `m = (price − liq) / price` reads as the same %-from-liquidation
 * risk as every other rail.
 *
 * Hidden when there's no debt (nothing to liquidate) or the chain read hasn't
 * landed. Drawn as the bar alone under the card's collateral ratio, where
 * "Liquidates at" above it states the price (ui-jobs 209).
 */
export function LiquityV1Runway({ chain }: { chain: LiquityV1PositionChainResponse }) {
  if (chain.chainStale || chain.troveStatus !== "active" || chain.debt <= 0 || chain.coll <= 0 || chain.price <= 0)
    return null;
  const liqPrice = (chain.debt * chain.mcr) / chain.coll;
  return <PriceRunway compact barOnly currentPrice={chain.price} liqPrice={liqPrice} asset="ETH" />;
}
