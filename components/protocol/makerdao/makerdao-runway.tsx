"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import type { MakerVaultView } from "./makerdao-vault-card";

/**
 * Liquidation runway for a Maker vault — the shared bar in its PRICE mode
 * (a vault has exactly one collateral ilk, so the axis can be the real
 * collateral price, the Liquity V1 treatment): value = the ilk's own OSM
 * price, liquidation line = the price at which the Vat's safety predicate
 * (ink·spot ≥ art·rate) is crossed — debtDai × mat ÷ ink, the algebraic
 * equivalence machine-verified in scripts/verify-makerdao-chain.mjs §4.
 *
 * Hidden when there's no debt (nothing to liquidate) or the live overlay
 * hasn't landed (the replay summary can't supply mat) — decline, never guess.
 * Drawn as the bar alone under the card's collateral ratio, where "Liquidates
 * at" above it states the price (ui-jobs 209).
 */
export function MakerdaoRunway({ v }: { v: MakerVaultView }) {
  if (
    v.source !== "chain" ||
    v.status !== "open" ||
    v.priceUsd == null ||
    v.priceUsd <= 0 ||
    v.liquidationPriceUsd == null ||
    v.liquidationPriceUsd <= 0
  )
    return null;
  // A capped feed: the fall is in Maker's price for the collateral, which sits
  // at the cap under the oracle.
  const capped = v.priceCap != null && v.priceCap.oracleUsd != null && v.priceCap.oracleUsd > v.priceCap.capUsd;
  const label = capped
    ? `Maker's ${v.collateralSymbol} price can fall ${Math.round((1 - v.liquidationPriceUsd / v.priceUsd) * 100)}% before liquidation`
    : undefined;
  return (
    <PriceRunway
      compact
      barOnly
      currentPrice={v.priceUsd}
      liqPrice={v.liquidationPriceUsd}
      asset={v.collateralSymbol}
      label={label}
    />
  );
}
