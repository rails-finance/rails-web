"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import { Prov } from "@/components/shared/provenance";
import { fmtPrice } from "@/components/shared/price-pill";
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

  if (slot) {
    return (
      <div className="w-full">
        <PriceRunway compact currentPrice={v.priceUsd} liqPrice={v.liquidationPriceUsd} asset={v.collateralSymbol} />
        <div className="mt-1.5 flex items-baseline justify-end gap-1 text-[11px] tabular-nums text-rb-500">
          {/* The liquidation price is the ratio column's "Liquidates at" line;
              the caption names the price the bar starts from. */}
          <span>
            {v.collateralSymbol} now <Prov info={osmPriceProv(v.collateralSymbol, v.ilk)}>{fmtPrice(v.priceUsd)}</Prov>
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
    />
  );
}
