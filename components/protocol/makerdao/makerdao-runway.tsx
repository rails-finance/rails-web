"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import { Prov } from "@/components/shared/provenance";
import { fmtPrice } from "@/components/shared/price-pill";
import { liquidationPriceProv, osmPriceProv } from "@/lib/makerdao/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
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

  if (slot) {
    const dsym = ilkDebtSymbol(v.ilk);
    const liqProv =
      v.debtDai != null && v.matRatio != null
        ? liquidationPriceProv(
            `${formatNumber(v.debtDai)} ${dsym}`,
            `${(v.matRatio * 100).toFixed(0)}%`,
            `${formatNumber(v.ink)} ${v.collateralSymbol}`,
          )
        : null;
    return (
      <div className="w-full">
        <PriceRunway compact currentPrice={v.priceUsd} liqPrice={v.liquidationPriceUsd} />
        <div className="mt-1.5 flex items-baseline justify-end gap-1 text-[11px] tabular-nums text-rb-500">
          <span>
            liquidation{" "}
            {liqProv ? <Prov info={liqProv}>{fmtPrice(v.liquidationPriceUsd)}</Prov> : fmtPrice(v.liquidationPriceUsd)}{" "}
            · {v.collateralSymbol} <Prov info={osmPriceProv(v.collateralSymbol, v.ilk)}>{fmtPrice(v.priceUsd)}</Prov>
          </span>
        </div>
      </div>
    );
  }

  return <PriceRunway compact={compact} currentPrice={v.priceUsd} liqPrice={v.liquidationPriceUsd} />;
}
