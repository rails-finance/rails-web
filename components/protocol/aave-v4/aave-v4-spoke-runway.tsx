"use client";

import { type AaveSpokeCardInfo, liquidationBuffer } from "@/lib/aave-v4/spoke-cards";
import { PriceRunway } from "@/components/shared/price-runway";

/**
 * Liquidation runway for the active Aave V4 spoke — one bar answering "how close
 * is this to liquidation?" at a glance. Two modes, set by how many assets are
 * enabled as collateral (see `liquidationBuffer`); both feed the shared
 * `PriceRunway`, whose axis IS the "% from liquidation" metric, so the live
 * marker, the fixed-position liquidation zone, the ruler and the underwater
 * handling are identical between them — and identical to Liquity's runway too.
 *
 *   • Single collateral asset → a PRICE runway: value = the asset's live price,
 *     liquidation line = its liquidation price (`currentPrice / HF`, chain-state,
 *     no LT table). The right caption shows that concrete price — clearer than a
 *     bare % when there's one asset.
 *   • Two or more collateral assets → a HEALTH-FACTOR runway: value = HF, the
 *     liquidation line = HF 1.0. No single asset's price (which would overstate
 *     safety for a correlated basket); the threshold caption is `HF 1.0`.
 *
 * Both reduce to the same risk metric — `(HF − 1) / HF` — so the "% from
 * liquidation" readout agrees with the card's stat and a marker at a given spot
 * means the same risk in either mode. Hidden when there's no debt (HF null).
 *
 * `compact` is the stat-line shorthand (the V2 trove treatment): the
 * "% from liquidation" figure with the inline bar, no heading and no threshold
 * caption — for riding the position card's heading-button row. The liquidation
 * price itself already lives on the card as the HF stat's "Liquidates at"
 * caption, so nothing traced is lost when the full section retires.
 */
export function AaveV4SpokeRunway({ spoke, compact }: { spoke: AaveSpokeCardInfo; compact?: boolean }) {
  const hf = spoke.healthFactor;
  if (spoke.totalDebtUsd <= 0 || hf == null) return null;

  const buf = liquidationBuffer(spoke);

  if (buf.single) {
    const bar = <PriceRunway compact={compact} currentPrice={buf.single.currentPrice} liqPrice={buf.single.liqPrice} />;
    if (compact) return bar;
    return (
      <div className="mt-2">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-rb-500">Collateral price runway</div>
        {bar}
      </div>
    );
  }

  const bar = (
    <PriceRunway
      compact={compact}
      currentPrice={hf}
      liqPrice={1}
      liqCaption="liquidation · HF 1.0"
      underwaterCaption="below HF 1.0"
    />
  );
  if (compact) return bar;
  return (
    <div className="mt-2">
      <div className="mb-3 text-[11px] uppercase tracking-wider text-rb-500">Liquidation runway</div>
      {bar}
    </div>
  );
}
