// Compound V3 Arbitrum — the wallet route, formed in one place:
//
//   /arbitrum/compound-v3/<wallet>   every Comet's position for the wallet, one section each

export function compoundArbitrumWalletHref(wallet: string): string {
  return `/arbitrum/compound-v3/${wallet.toLowerCase()}`;
}
