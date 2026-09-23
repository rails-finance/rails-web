// Token-logo CDN URL builders. Two tiers, tried in order by the chip
// component:
//   1. Trust Wallet — broad coverage, checksum-cased path.
//   2. DeFiLlama — covers newer DeFi-native assets Trust Wallet hasn't
//      indexed (cbBTC, rsETH, LBTC at time of writing). Lowercase address.
// Anything that fails both falls to UnknownTokenSvg.
//
// Both CDNs key a logo by (chain, address): a Base address looked up under
// Ethereum's path is a 404, which is how every Base-only asset (USDbC, AERO,
// DEGEN …) rendered as a letter until the chip started passing its chain.
//
// Neither CDN indexes a testnet. A Sepolia address looked up under Ethereum's
// directory would be a 404 at best and the WRONG token's mark at worst (the
// same address can be a different contract on each chain), so for a chain
// with no directory both builders answer null and the chip skips the CDN
// tiers — the local `public/icons/tokens/<address>.png` tier is that chain's
// only source, and the address is the identity it keys on.

import { getAddress } from "viem";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/** Trust Wallet's directory name per chain — absent where it has none. */
const TRUST_WALLET_CHAIN: Partial<Record<ChainId, string>> = { 1: "ethereum", 8453: "base" };

/** Chains DeFiLlama's icon service serves. Keyed by chain id in the path, so
 *  the set is what matters, not a name. */
const DEFILLAMA_CHAINS: ReadonlySet<ChainId> = new Set<ChainId>([1, 8453]);

export function getTokenLogoUrl(address: string, chainId: ChainId = MAINNET_CHAIN_ID): string | null {
  // viem throws if the address isn't 20 bytes / 0x-hex; for our use the input
  // is always from a curated TOKEN_ADDRESSES entry (or the API's verified
  // reserve catalog), so a malformed address is a programming error.
  const chain = TRUST_WALLET_CHAIN[chainId];
  if (!chain) return null;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${getAddress(address)}/logo.png`;
}

export function getDefiLlamaLogoUrl(address: string, chainId: ChainId = MAINNET_CHAIN_ID): string | null {
  if (!DEFILLAMA_CHAINS.has(chainId)) return null;
  return `https://token-icons.llamao.fi/icons/tokens/${chainId}/${address.toLowerCase()}?h=24&w=24`;
}
