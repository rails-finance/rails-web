// The Polaris explorer's routes, spelled once. The listing is the roster's
// derived href (`/sepolia/polaris`); a position is `/<market>/<id>` beneath
// it because the grain is (market, cdpId) — the same id exists in both
// markets, so a bare id names nothing.

import { POLARIS_CORE, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { explorerUrl, SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";

export const POLARIS_BASE_PATH = "/sepolia/polaris";
export const POLARIS_MARKETS_PATH = `${POLARIS_BASE_PATH}/markets`;
/** The two sub-pages beside the CDPs: the stability-pool deposits and the
 *  reserve loans (the roster's `subPages`). A deposit is (market, token id),
 *  as a CDP is; a loan's id is the loan NFT's, one series for the deployment. */
export const POLARIS_SP_PATH = `${POLARIS_BASE_PATH}/stability-pool`;
export const POLARIS_LOANS_PATH = `${POLARIS_BASE_PATH}/reserve-loans`;

/** One address's pETH account (ui-jobs 865): `/peth/<address>`, a static
 *  segment beside the two sub-pages, so it outranks the `[market]` slot. */
export const POLARIS_PETH_PATH = `${POLARIS_BASE_PATH}/peth`;

/** The account page of an address (lower-cased) or an ENS name, which the
 *  page resolves and redirects. */
export function polarisPethAccountHref(address: string): string {
  const a = address.trim();
  return `${POLARIS_PETH_PATH}/${/^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : encodeURIComponent(a)}`;
}

export function polarisDepositHref(market: PolarisMarket, tokenId: string): string {
  return `${POLARIS_SP_PATH}/${market}/${tokenId}`;
}

export function polarisLoanHref(loanId: string): string {
  return `${POLARIS_LOANS_PATH}/${loanId}`;
}

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

/** The same page for a deposit NFT: the stability pool is its ERC-721. */
export function polarisDepositNftUrl(market: PolarisMarket, tokenId: string): string {
  return `${explorerUrl(SEPOLIA_CHAIN_ID, "token", POLARIS_MARKET_CONFIG[market].stabilityPool)}?a=${tokenId}`;
}

/** And for a loan NFT. */
export function polarisLoanNftUrl(loanId: string): string {
  return `${explorerUrl(SEPOLIA_CHAIN_ID, "token", POLARIS_CORE.reserveLoansNft)}?a=${loanId}`;
}
