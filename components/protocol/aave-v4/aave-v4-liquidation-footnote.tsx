"use client";

import type { LiquidationBuffer } from "@/lib/aave-v4/spoke-cards";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fmtLiqPrice } from "@/lib/aave-v4/format";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { Prov, type Provenance } from "@/components/shared/provenance";

/**
 * Compact liquidation read shown directly beneath the Health Factor stat — the
 * tangible restatement of HF, not a peer of it (the buffer is `1 − 1/HF`, the
 * single-asset price is `currentPrice / HF`). Single collateral asset → its
 * liquidation price (the token icon carries the asset identity, since the column
 * is labelled "Health Factor"); two or more → the `1 − 1/HF` combined-collateral
 * drop. Renders nothing when there's no debt or the position is already
 * liquidatable (the red HF value already says so).
 */
export function AaveV4LiquidationFootnote({ buf }: { buf: LiquidationBuffer }) {
  if (buf.dropPct == null || buf.liquidatable) return null;

  if (buf.atLine) {
    return <div className="text-xs mt-0.5 font-semibold text-rb-500">At the liquidation line</div>;
  }

  // Collateral and debt move together (wstETH against WETH): the price that
  // matters is the collateral's price in the debt asset.
  if (buf.single?.against) {
    const a = buf.single.against;
    const liqRatioProv: Provenance = {
      kind: "derived",
      summary: `The ${aaveV4DisplaySymbol(buf.single.symbol)} price, in ${aaveV4DisplaySymbol(a.symbol)}, at which the position becomes liquidatable. The debt moves with the collateral, so the price between the two is the one that matters.`,
      via: "collateral price ÷ debt price ÷ health factor",
      formula: "(collateralPrice ÷ debtPrice) ÷ HF",
    };
    return (
      <div className="text-xs mt-0.5 text-rb-500 inline-flex items-center gap-1">
        Liquidates at
        <TokenChipIcon symbol={buf.single.symbol} size={14} filterable={false} />
        <Prov info={liqRatioProv}>
          {a.liqRatio.toLocaleString("en-US", { maximumFractionDigits: 4 })} {aaveV4DisplaySymbol(a.symbol)}
        </Prov>
      </div>
    );
  }

  if (buf.single) {
    // The single-asset liquidation price is currentPrice ÷ HF, and currentPrice
    // is the OFF-CHAIN market price — so it's a derived/off-chain read, hidden in
    // On-chain-values like the collateral/debt USD it shares a price source with.
    // Mirrors the Liquity trove's liq-price treatment (a <Prov> middot).
    const liqProv: Provenance = {
      kind: "derived",
      summary:
        "Liquidation price for this collateral — the price at which the position becomes liquidatable. Derived from the current off-chain market price and the health factor.",
      via: "current price ÷ health factor",
      formula: "currentPrice ÷ HF",
    };
    return (
      <div className="text-xs mt-0.5 text-rb-500 inline-flex items-center gap-1">
        Liquidates at
        <TokenChipIcon symbol={buf.single.symbol} size={14} filterable={false} />
        <Prov info={liqProv}>{fmtLiqPrice(buf.single.liqPrice)}</Prov>
      </div>
    );
  }

  // Multi-collateral: the drop is 1 − 1/HF, a pure function of the health factor
  // (no off-chain price on the line), so it stays in On-chain-values.
  return <div className="text-xs mt-0.5 text-rb-500">Liquidates on a {buf.dropPct.toFixed(0)}% drop</div>;
}
