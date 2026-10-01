// Compound's Bulker contracts: the helper each deployment ships to bundle
// several Comet actions in one transaction and to wrap the chain's native ETH
// into WETH before supplying it. Where a Supply or SupplyCollateral event's
// `from` (the funder) is a Bulker, the tokens came through it, and the
// account that called the Bulker is not in the event.
//
// Addresses from compound-finance/comet `deployments/<network>/<market>/roots.json`
// ("bulker"): one per chain, shared by its markets.

import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const BULKERS: Record<number, string> = {
  [MAINNET_CHAIN_ID]: "0xa397a8c2086c554b531c02e29f3291c9704b00c7",
  [BASE_CHAIN_ID]: "0x78d0677032a35c63d142a48a2037048871212a8c",
};

/** True where `address` is the Compound Bulker of `chainId` (Ethereum when
 *  unset). */
export function isCompoundBulker(address: string | undefined, chainId?: number): boolean {
  if (!address) return false;
  return BULKERS[chainId ?? MAINNET_CHAIN_ID] === address.toLowerCase();
}
