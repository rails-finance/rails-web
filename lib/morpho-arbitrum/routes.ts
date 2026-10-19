// Morpho Blue Arbitrum — the two detail routes, formed in one place, on Base's
// pattern (lib/morpho-base/routes.ts):
//
//   /arbitrum/morpho/<wallet>            the wallet — one card per position, each a link
//   /arbitrum/morpho/<wallet>/<market>   one position — card, flows, whole-life timeline
//
// The market segment is the 0x-prefixed 32-byte id, lowercased.

import { isMorphoBaseMarketSegment, morphoBaseMarketSegment } from "@/lib/morpho-base/routes";

export const isMorphoArbitrumMarketSegment = isMorphoBaseMarketSegment;

export function morphoArbitrumWalletHref(wallet: string): string {
  return `/arbitrum/morpho/${wallet.toLowerCase()}`;
}

export function morphoArbitrumPositionHref(wallet: string, marketId: string): string {
  return `${morphoArbitrumWalletHref(wallet)}/${morphoBaseMarketSegment(marketId)}`;
}
