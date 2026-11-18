// A Compound V2 liquidation's valued two-leg breakdown (ui-jobs 743): each
// leg's product from its receipt's shown rows, the premium from the two shown
// products. Lifted from the event card so scripts/test can assert it.

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import type { LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  liqAtBlockPriceProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  liqPremiumProv,
  liqIncentiveRefProv,
  type CompoundV2Coords,
} from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2LiquidationValues } from "@/lib/compound-v2/liquidation-values";
import { formatNumber, formatUsdValue, formatPrice } from "@/lib/utils/format";

/** "oracle at block 47,020,084": the price pill names the block it was read at. */
export const oracleNote = (block?: number) =>
  block != null ? `oracle at block ${block.toLocaleString("en-US")}` : "oracle at block";

/**
 * The valued two-leg liquidation breakdown, at Compound's OWN oracle price
 * captured at the event block (mig 151). NATIVE-ONLY: the legs are denominated
 * in ETH before the oracle migration (block 10,678,764) and USD after — the
 * exact numeraire the Comptroller computed the seizure in; `priceNumeraire`
 * says which, and the format seam renders each leg in it. The premium is a
 * ratio of two same-block legs, numeraire-invariant, and should reproduce the
 * liquidation incentive read at the same block (the self-audit beneath it).
 *
 * Undefined until the price walk has priced BOTH legs at this block — the card
 * stays token-only meanwhile (partial fill is a safe state, and a half-valued
 * breakdown would invite a cross-leg comparison the data can't support).
 */
export function buildCompoundV2LiqForensics(
  ctx: CompoundV2Context,
  coords: CompoundV2Coords,
): LiquidationForensicsProps | undefined {
  const v = compoundV2LiquidationValues(ctx);
  if (!v) return undefined;
  const { numeraire, seizedUnderlying, repaid, collPrice, debtPrice, seizedValue, clearedValue, incPct } = v;
  const collM = COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket!];

  const collSym = ctx.collateralSymbol ?? collM.symbol;
  const debtSym = ctx.marketSymbol;
  // An ETH-era leg's product runs to six decimals, as its receipt rows show it.
  const fmtValue =
    numeraire === "ETH"
      ? (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`
      : formatUsdValue;
  const fmtPrice = numeraire === "ETH" ? (n: number) => `${formatNumber(n)} ETH` : formatPrice;

  return {
    seized: {
      symbol: collSym,
      usd: seizedValue,
      usdProv: liqSeizedValueProv(collSym, numeraire, coords, {
        amount: seizedUnderlying,
        price: collPrice,
        cSymbol: collM.cSymbol,
      }),
    },
    cleared: {
      symbol: debtSym,
      usd: clearedValue,
      usdProv: liqClearedValueProv(debtSym, numeraire, coords, {
        amount: repaid,
        price: debtPrice,
        cSymbol: COMPOUND_V2_MARKET_BY_KEY[ctx.market]?.cSymbol ?? debtSym,
      }),
    },
    premium: seizedValue / clearedValue - 1,
    premiumProv: liqPremiumProv(coords, {
      seized: fmtValue(seizedValue),
      cleared: fmtValue(clearedValue),
      numeraire,
    }),
    premiumReference: {
      label: "Liquidation incentive",
      value: `${(1 + incPct).toFixed(2)}×`,
      prov: liqIncentiveRefProv(coords),
    },
    pricePills: [
      {
        symbol: collSym,
        priceUsd: collPrice,
        priceProv: liqAtBlockPriceProv(collSym, numeraire, coords),
        note: oracleNote(coords.blockNumber),
      },
      {
        symbol: debtSym,
        priceUsd: debtPrice,
        priceProv: liqAtBlockPriceProv(debtSym, numeraire, coords),
        note: oracleNote(coords.blockNumber),
      },
    ],
    // ETH before the oracle migration, USD after — Compound's own numeraire.
    format: { value: fmtValue, price: fmtPrice },
  };
}
