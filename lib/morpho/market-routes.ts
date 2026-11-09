// Morpho Blue — where one market's page lives, formed in one place.
// ----------------------------------------------------------------------------
// /<chain>/morpho/markets/<loan token>/<market id>: under its loan token's page,
// because that is the axis the markets view is organised along (Blue measures
// every market in its loan token). Both segments lowercased, the id 0x-prefixed.
// Client-safe: the position card and the markets view link here.

import { chainMeta, type ChainId } from "@/lib/shared/chains";

/** One loan token's page — every market that lends it. */
export function morphoLoanTokenHref(chainId: ChainId, loanToken: string): string {
  return `/${chainMeta(chainId).slug}/morpho/markets/${loanToken.toLowerCase()}`;
}

export function morphoMarketHref(chainId: ChainId, loanToken: string, marketId: string): string {
  const id = marketId.toLowerCase();
  return `${morphoLoanTokenHref(chainId, loanToken)}/${id.startsWith("0x") ? id : `0x${id}`}`;
}
