"use client";

import { PriceRunway } from "@/components/shared/price-runway";
import { Prov } from "@/components/shared/provenance";
import { fluidLiqPriceProv, vaultOraclePriceProv } from "@/lib/fluid/live-provenance";
import { formatNumber } from "@/lib/utils/format";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";

/**
 * Liquidation runway for a Fluid position — the shared bar in its PRICE mode,
 * but on the vault's OWN price axis: the collateral priced in the debt token
 * (Fluid oracles quote debt-per-col; the protocol has no USD feed). Value =
 * the vault oracle's liquidate price at head, liquidation line = the price at
 * which the position's ratio hits the vault's liquidation threshold (borrow ÷
 * (supply × threshold) — the liquidation equation rearranged for price, every
 * input one resolver read at the same block). The axis is the metric ("% from
 * liquidation"), so the non-USD unit changes only the captions.
 *
 * Hidden without live debt, without a live price, or when the read hasn't
 * landed. `compact` renders the bare stat-line bar for the position card's
 * heading-button row.
 */
export function FluidRunway({ chain, compact = false }: { chain: FluidPositionChainResponse; compact?: boolean }) {
  if (
    chain.chainStale ||
    !chain.found ||
    chain.isEmpty ||
    chain.borrow <= 0 ||
    chain.supply <= 0 ||
    chain.oraclePriceLiquidateDebtPerCol == null ||
    chain.liqPriceDebtPerCol == null
  )
    return null;
  const colSym = chain.supplySymbol ?? "DEX shares";
  const debtSym = chain.borrowSymbol ?? "DEX shares";
  const pair = `${colSym} / ${debtSym}`;

  if (compact) {
    return (
      <PriceRunway compact currentPrice={chain.oraclePriceLiquidateDebtPerCol} liqPrice={chain.liqPriceDebtPerCol} />
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-3 text-[11px] uppercase tracking-wider text-rb-500">Liquidation runway</div>
      <PriceRunway
        currentPrice={chain.oraclePriceLiquidateDebtPerCol}
        liqPrice={chain.liqPriceDebtPerCol}
        liqCaption={
          <>
            liquidation{" "}
            <Prov info={fluidLiqPriceProv(colSym, debtSym, chain.vault, pair)}>
              {formatNumber(chain.liqPriceDebtPerCol)}
            </Prov>{" "}
            · {colSym}{" "}
            <Prov info={vaultOraclePriceProv(colSym, debtSym, chain.oracle, "liquidate")}>
              {formatNumber(chain.oraclePriceLiquidateDebtPerCol)} {debtSym}
            </Prov>
          </>
        }
        underwaterCaption={
          <>
            recovers at {formatNumber(chain.liqPriceDebtPerCol)} {debtSym} per {colSym}
          </>
        }
      />
    </div>
  );
}
