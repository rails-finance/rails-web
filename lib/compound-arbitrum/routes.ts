// Compound V3 Arbitrum — the routes, formed in one place
// (rails-ops reference/arbitrum-position-first-lane.md):
//
//   /arbitrum/compound-v3/<wallet>            the overview: one row per Comet the wallet touched
//   /arbitrum/compound-v3/<market>/<wallet>   one Comet's position; `market` is the roster key

export function compoundArbitrumWalletHref(wallet: string): string {
  return `/arbitrum/compound-v3/${wallet.toLowerCase()}`;
}

export function compoundArbitrumMarketHref(market: string, wallet: string): string {
  return `/arbitrum/compound-v3/${market.toLowerCase()}/${wallet.toLowerCase()}`;
}
