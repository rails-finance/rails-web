// The Alchemix position's top-row price list: a vault share in the asset
// underneath, and the synthetic at the value the protocol counts it at, one
// unit of that asset. The asset underneath has no on-chain dollar price here,
// so the list carries no dollar price (ui-jobs 743).

import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import type { AlchemixCollateral } from "@/types/api/alchemix";

export function alchemixPriceAssets(
  priceView: Pick<AlchemixCollateral, "formatted" | "underlying"> | null,
  mytSymbol: string,
  sym: string,
): LatestPriceAsset[] {
  const u = priceView?.underlying;
  const out: LatestPriceAsset[] = [];
  if (u?.symbol && priceView && priceView.formatted > 0)
    out.push({
      symbol: mytSymbol,
      price: u.formatted / priceView.formatted,
      unit: u.symbol,
      label: `One ${mytSymbol} in ${u.symbol}`,
    });
  out.push(
    u?.symbol
      ? { symbol: sym, price: 1, unit: u.symbol, label: `One ${sym} as the protocol counts it, in ${u.symbol}` }
      : { symbol: sym },
  );
  return out;
}

/** Why the list prices what it does. */
export function alchemixPriceReason(underSym: string | null, mytSymbol: string, sym: string): string {
  return underSym
    ? `A ${mytSymbol} share is shown in ${underSym} at the vault's share price, and ${sym} at 1 ${underSym}, the protocol's accounting value: Alchemix counts each ${sym} of debt as one ${underSym}. Its market price can differ. ${underSym} has no on-chain dollar price here, so neither carries a dollar value.`
    : `${sym} and ${mytSymbol} are shown in their units with no dollar price: no share price has been read for this position.`;
}
