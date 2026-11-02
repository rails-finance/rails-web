// Compound V3 Base's adapter onto the shared holder strip
// (components/shared/holder-strip.tsx): what the holder view,
// /base/compound-v3/<wallet>, states above the wallet's Comet cards. The
// figures are built as Arbitrum's are (lib/compound-arbitrum/holder-strip.ts):
// counts by status; collateral, debt and the lent base in dollars at each
// Comet's own feed, the ETH-quoted cWETHv3 converted at WETH in dollars,
// with the per-Comet amounts beneath. Every receipt names Base's wallet route.

import type { HolderStripProps } from "@/components/shared/holder-strip";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
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

/** The block and reader of the WETH-in-dollars leg (`CometPriceRead`,
 *  lib/sources/chain/compound-prices.ts). */
export interface WethUsdRead {
  blockNumber: number;
  head?: PositionHeadStamp;
  stored?: { blockNumber: number; blockTimestamp: number | null; readAt: string; provider: string };
}

/** Where the WETH-in-dollars leg was read: its block, and rails-server's
 *  read (live or stored) where it made it. */
function ethUsdFrom(read: WethUsdRead | undefined): string {
  if (!read) return BASE_SOURCE.ethUsdFrom;
  const at = `on cUSDCv3's WETH feed, read beside it at block ${read.blockNumber.toLocaleString("en-US")}`;
  if (read.stored)
    return `${at}, from rails-server's stored read taken ${read.stored.readAt.slice(0, 10)} ${read.stored.readAt.slice(11, 19)} UTC because the latest read failed`;
  if (read.head) return `${at} by rails-server at ${read.head.readAt.slice(11, 19)} UTC through ${read.head.provider}`;
  return at;
}

export function compoundBaseHolderStrip(
  head: CompoundWalletChainResponse | null,
  comets: HolderStripComet[],
  wethRead?: WethUsdRead,
): HolderStripProps {
  return compoundHolderStrip(head, comets, { ...BASE_SOURCE, ethUsdFrom: ethUsdFrom(wethRead) });
}
