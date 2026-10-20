// Compound V3 Base's adapter onto the shared holder strip
// (components/shared/holder-strip.tsx): what the holder view,
// /base/compound-v3/<wallet>, states above the wallet's Comet cards. The
// figures are built as Arbitrum's are (lib/compound-arbitrum/holder-strip.ts):
// counts by status; collateral, debt and the lent base in dollars at each
// Comet's own feed, the ETH-quoted cWETHv3 converted at WETH in dollars,
// with the per-Comet amounts beneath. Every receipt names Base's wallet route.

import type { HolderStripProps } from "@/components/shared/holder-strip";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import {
  compoundHolderStrip,
  type HolderStripComet,
  type HolderStripSource,
} from "@/lib/compound-arbitrum/holder-strip";

const BASE_SOURCE: HolderStripSource = {
  via: "GET /api/chain/compound-base/wallet",
  // The Base roster states no feeds, so its read carries no `ethUsd`; the
  // holder view reads the WETH Comet's base price in dollars beside it, the
  // conversion the market page's prices route makes.
  ethUsdFrom: "on cUSDCv3's WETH feed, read beside it at the latest block",
};

export function compoundBaseHolderStrip(
  head: CompoundWalletChainResponse | null,
  comets: HolderStripComet[],
): HolderStripProps {
  return compoundHolderStrip(head, comets, BASE_SOURCE);
}
