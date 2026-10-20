// Compound V3 Base: the routes, formed in one place (the shape of
// lib/compound-arbitrum/routes.ts, rails-ops reference/arbitrum-position-first-lane.md):
//
//   /base/compound-v3/<wallet>            the holder view: the holder strip, one card per Comet the wallet touched
//   /base/compound-v3/<market>/<wallet>   one Comet's position; `market` is the roster key

export function compoundBaseWalletHref(wallet: string): string {
  return `/base/compound-v3/${wallet.toLowerCase()}`;
}

export function compoundBaseMarketHref(market: string, wallet: string): string {
  return `/base/compound-v3/${market.toLowerCase()}/${wallet.toLowerCase()}`;
}
