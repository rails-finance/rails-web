"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import { Prov } from "@/components/shared/provenance";
import { liquidationPriceProv, protocolPriceProv } from "@/lib/liquity-v1/position-provenance";
import { fmtPrice } from "@/components/shared/price-pill";
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
 * landed.
 *
 * `compact` renders the bare stat-line bar for a tight heading row (no caption).
 * `slot` renders the compact bar PLUS the traced liquidation / oracle price
 * caption beneath it — the risk-slot form (the Display menu's "runway" view):
 * those two figures are then ON the card face and carry their own receipts,
 * so the Explanation stays pure prose about them.
 */
export function LiquityV1Runway({
  chain,
  compact = false,
  slot = false,
}: {
  chain: LiquityV1PositionChainResponse;
  compact?: boolean;
  slot?: boolean;
}) {
  if (chain.chainStale || chain.troveStatus !== "active" || chain.debt <= 0 || chain.coll <= 0 || chain.price <= 0)
    return null;

  const liqPrice = (chain.debt * chain.mcr) / chain.coll;

  if (slot) {
    return (
      <div className="w-full">
        <PriceRunway compact currentPrice={chain.price} liqPrice={liqPrice} />
        <div className="mt-1.5 flex items-baseline justify-end gap-1 text-[11px] tabular-nums text-rb-500">
          <span>
            liquidation{" "}
            <Prov info={liquidationPriceProv({ debt: chain.debt, coll: chain.coll })}>{fmtPrice(liqPrice)}</Prov> · ETH{" "}
            <Prov info={protocolPriceProv()}>{fmtPrice(chain.price)}</Prov>
          </span>
        </div>
      </div>
    );
  }

  if (compact) {
    return <PriceRunway compact currentPrice={chain.price} liqPrice={liqPrice} />;
  }

  return (
    <div className="mt-2">
      <div className="mb-3 text-[11px] uppercase tracking-wider text-rb-500">Liquidation runway</div>
      <PriceRunway
        currentPrice={chain.price}
        liqPrice={liqPrice}
        liqCaption={
          <>
            liquidation{" "}
            <Prov info={liquidationPriceProv({ debt: chain.debt, coll: chain.coll })}>{fmtPrice(liqPrice)}</Prov> · ETH{" "}
            <Prov info={protocolPriceProv()}>{fmtPrice(chain.price)}</Prov>
          </>
        }
      />
    </div>
  );
}
