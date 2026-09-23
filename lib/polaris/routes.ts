// The Polaris explorer's routes, spelled once. The listing is the roster's
// derived href (`/sepolia/polaris`); a position is `/<market>/<id>` beneath
// it because the grain is (market, cdpId) — the same id exists in both
// markets, so a bare id names nothing.

import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { explorerUrl, SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";

export const POLARIS_BASE_PATH = "/sepolia/polaris";
export const POLARIS_MARKETS_PATH = `${POLARIS_BASE_PATH}/markets`;

export function polarisPositionHref(market: PolarisMarket, cdpId: string): string {
  return `${POLARIS_BASE_PATH}/${market}/${cdpId}`;
}

/**
 * Where a CDP's NFT can be looked at outside Rails — the token page for that
 * id on the market's own ERC-721, on Sepolia's block explorer.
 *
 * NOT OpenSea, which is where the audit sent this: OpenSea retired testnet
 * support, and on 2026-09-10 both `testnets.opensea.io/assets/sepolia/<c>/<id>`
 * and its `/item/` twin answered a 307 to a farewell article. Etherscan runs
 * the Sepolia explorer itself (chains.ts), so the link stays on the chain's
 * own explorer and needs no marketplace to exist.
 *
 * The form is the `token` kind plus `?a=<id>`, not Etherscan's prettier
 * `/nft/<contract>/<id>`. Both name the same page, but measured in a real
 * browser on 2026-09-10 the `/nft/` path answers a Cloudflare interstitial
 * (403, "Just a moment…") on every attempt while `?a=` answers 200 with the
 * ERC-721 page — a link a reader cannot open is not a link.
 */
export function polarisCdpNftUrl(market: PolarisMarket, cdpId: string): string {
  return `${explorerUrl(SEPOLIA_CHAIN_ID, "token", POLARIS_MARKET_CONFIG[market].cdpNft)}?a=${cdpId}`;
}
