"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";

/**
 * Liquidation runway for a fork trove — the shared bar in its PRICE mode (a
 * trove has exactly one collateral asset, so the axis is the real collateral
 * price, the Liquity V1 treatment): value = the branch's own PriceFeed price
 * (fetchPrice simulated at head), liquidation line = the price at which the
 * collateral ratio hits the branch MCR (entire debt × MCR ÷ entire collateral
 * — the liquidation equation rearranged for price, every input a chain read
 * at the same block).
 *
 * The compact stat-line form only (the V2 reference's "% from liquidation"
 * figure + bar): the liquidation price is stated on the card face beneath the
 * ratio and the oracle price rides the page's price strip, so the bar carries
 * no caption of its own.
 *
 * Zombie troves (status 4) still carry debt and can be liquidated, so they
 * keep the runway. Hidden when there's no live debt or the read hasn't landed.
 */
export function LiquityForkRunway({ chain }: { chain: LiquityForkTroveChainResponse }) {
  if (
    chain.chainStale ||
    (chain.status !== "active" && chain.status !== "zombie") ||
    chain.entireDebt <= 0 ||
    chain.entireColl <= 0 ||
    chain.priceUsd == null ||
    chain.liqPriceUsd == null
  )
    return null;
  return <PriceRunway compact currentPrice={chain.priceUsd} liqPrice={chain.liqPriceUsd} />;
}
