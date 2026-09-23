// Sepolia (11155111) symbol → address — the three Polaris tokens, hand-kept.
//
// No icon CDN indexes a testnet, so this table exists for one reason: it lets
// the token chip resolve a Sepolia symbol to the ADDRESS the local icon tier
// keys on (public/icons/tokens/<address>.png — the address is the identity,
// never the symbol). There is no generator behind it, unlike the Base table:
// a testnet's token set is whatever the one protocol on it deploys.
export const SEPOLIA_TOKEN_ADDRESSES: Record<string, string> = {
  /** Polaris's reserve token — the bonding-curve ETH wrapper every CDP posts. */
  pETH: "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89",
  /** The USD-tracking stablecoin of the `usdp` market. */
  USDp: "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6",
  /** The gold-tracking stablecoin of the `goldp` market. */
  GOLDp: "0x1068ed496d21bf5357b2f1e9d25f46934f43ca99",
};
