// Shared price-resolution helpers for Aave V4 (and any other protocol that
// converts per-asset amounts to USD for display). The lookup table maps
// common symbols to mainnet addresses so we can find them in the
// address-keyed prices map threaded through from the oracle / DefiLlama proxy.
//
// RULE: Rails never invents a price. An asset the map does not carry resolves
// to `null`, and every caller must then show the holding in that asset's units
// with no USD leg — see lib/aave-v4/unpriced.ts for the display and receipt
// vocabulary that implements it. There is no $1 pin for stablecoins: the V4
// oracle map prices every stable a spoke lists, so a pin could only stand in
// for a gap the reader should have been told about.

export interface PriceEntry {
  usd: number;
}

export const TOKEN_ADDR: Record<string, string> = {
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  wstETH: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  rETH: "0xae78736cd615f374d3085123a210448e74fc6393",
  cbETH: "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
  weETH: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
  sDAI: "0x83f20f44975d03b1b09e64809b757c47f942beea",
  WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  cbBTC: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  LUSD: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
  BOLD: "0x6440f144b7e50d6a8439336510312d2f54beb01d",
  GHO: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f",
  crvUSD: "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
  USDe: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
  sUSDe: "0x9d39a5de30e57443bff2a8307a4256c8797a3497",
  AAVE: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
  LINK: "0x514910771af9ca656af840dff83e8264ecf986ca",
  LBTC: "0x8236a87084f8b84306f72007f36f2618a5634494",
  rsETH: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
  XAUt: "0x68749665ff8d2d112fa859aa293f07a622782f38",
  EURC: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
  USDG: "0xe343167631d89b6ffc58b88d6b7fb0228795491d",
  frxUSD: "0xcacd6fd266af91b8aed52accc382b4e165586e29",
  RLUSD: "0x8292bb45bf1ee4d140127049757c2e0ff06317ed",
  "PT-sUSDE": "0x3de0ff76e8b528c092d47b9dac775931cef80f49",
  "PT-USDe-7MAY2026": "0xaebf0bb9f57e89260d57f31af34eb58657d96ce0",
  "PT-USDG-24SEP2026": "0xc1906aecf868749a2dee203f59b904c0cf212140",
};

/** The asset's live USD price, or `null` when no source covers it. A `null` is
 *  a fact the surface has to state, never a number to substitute for. */
export function resolvePrice(symbol: string, prices?: Record<string, PriceEntry | number>): number | null {
  if (!prices) return null;
  const addr = TOKEN_ADDR[symbol];
  if (!addr) return null;
  const p = prices[addr];
  if (!p) return null;
  return typeof p === "number" ? p : p.usd;
}
