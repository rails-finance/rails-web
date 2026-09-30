"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import { Prov } from "@/components/shared/provenance";
import { usdPrice } from "@/lib/makerdao/price-format";
import { osmPriceProv } from "@/lib/makerdao/event-provenance";
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
 *
 * `compact` renders the bare stat-line bar for a tight heading row (no caption).
 * `slot` renders the compact bar PLUS the traced liquidation / OSM price
 * caption beneath it — the risk-slot form (the Display menu's "runway" view):
 * those two figures are then ON the card face and carry their own receipts,
 * so the Explanation stays pure prose about them.
 */
export function MakerdaoRunway({
  v,
  compact = false,
  slot = false,
}: {
  v: MakerVaultView;
  compact?: boolean;
  slot?: boolean;
}) {
  if (
    v.source !== "chain" ||
    v.status !== "open" ||
    v.priceUsd == null ||
    v.priceUsd <= 0 ||
    v.liquidationPriceUsd == null ||
    v.liquidationPriceUsd <= 0
  )
    return null;

  const ratio =
    v.collateralUsd != null && v.debtDai != null && v.debtDai > 0 ? (v.collateralUsd / v.debtDai) * 100 : null;
  // A capped feed: the fall is in Maker's price for the collateral, which sits
  // at the cap under the oracle.
  const capped = v.priceCap != null && v.priceCap.oracleUsd != null && v.priceCap.oracleUsd > v.priceCap.capUsd;
  const label = capped
    ? `Maker's ${v.collateralSymbol} price can fall ${Math.round((1 - v.liquidationPriceUsd / v.priceUsd) * 100)}% before liquidation`
    : undefined;
  if (slot) {
    return (
      <div className="w-full">
        <PriceRunway
          compact
          currentPrice={v.priceUsd}
          liqPrice={v.liquidationPriceUsd}
          asset={v.collateralSymbol}
          label={label}
        />
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-rb-500">
          {/* The bar's two ends in words: the minimum ratio at its left, the
              ratio and price now at its right. */}
          <span>{v.matRatio != null ? <>minimum {Number((v.matRatio * 100).toFixed(2))}%</> : null}</span>
          <span>
            {ratio != null ? <>now {ratio.toFixed(0)}% · </> : null}
            {v.collateralSymbol} <Prov info={osmPriceProv(v.collateralSymbol, v.ilk)}>{usdPrice(v.priceUsd)}</Prov>
            {capped ? " (capped)" : null}
          </span>
        </div>
      </div>
    );
  }

  return (
    <PriceRunway
      compact={compact}
      currentPrice={v.priceUsd}
      liqPrice={v.liquidationPriceUsd}
      asset={v.collateralSymbol}
      label={label}
    />
  );
}
