// Morpho Blue Base — the two detail routes, formed in one place.
// ----------------------------------------------------------------------------
// A position on Blue is a (market, wallet) pair, and the Ethereum explorer's
// detail page is exactly one of them (`/ethereum/morpho/<marketId>-<owner>`).
// On Base the wallet page came first, because the chain reads are wallet-
// scoped — and it stacked every market's card, tower and timeline on one
// scroll. The position page beneath it restores the Ethereum grain:
//
//   /base/morpho/<wallet>            the wallet — one card per position, each a link
//   /base/morpho/<wallet>/<market>   one position — card, tower, whole-life timeline
//
// The market segment is the 0x-prefixed 32-byte id, lowercased; the wallet
// segment the address, lowercased. Nested rather than `<market>-<owner>` at
// the top level because Next resolves one dynamic segment per level and the
// wallet page already holds it.

const MARKET_ID = /^0x[0-9a-f]{64}$/;

/** Normalise a market id to the route's form: 0x-prefixed, lowercase. */
export function morphoBaseMarketSegment(marketId: string): string {
  const m = marketId.toLowerCase();
  return m.startsWith("0x") ? m : `0x${m}`;
}

export function isMorphoBaseMarketSegment(s: string | undefined): s is string {
  return typeof s === "string" && MARKET_ID.test(s);
}

export function morphoBaseWalletHref(wallet: string): string {
  return `/base/morpho/${wallet.toLowerCase()}`;
}

export function morphoBasePositionHref(wallet: string, marketId: string): string {
  return `${morphoBaseWalletHref(wallet)}/${morphoBaseMarketSegment(marketId)}`;
}

// The vault routes (`/base/morpho/vaults` and its children) are formed
// in lib/vaults/routes.ts: a vault is a chain-scoped section beside the
// VAULTS tab of this same explorer (rails-ops decision 0028).
