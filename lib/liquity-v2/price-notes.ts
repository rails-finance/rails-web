// The words for a Liquity V2 price as the app reads it (/api/oracle/liquity-v2
// for the collateral, /api/chain/liquity-v2/bold-price for BOLD): one module,
// so the listing card's receipt, the wallet band's and the Prices chip's say
// the same thing (ui-jobs 737, 746).

/** Whose price each branch's collateral takes, and how it is composed: the
 *  Chainlink feeds and the LST's exchange rate, as the branch's PriceFeed
 *  composes them (rails-server utils/liquity-v2-prices.ts), at a read that
 *  states no block. BOLD's (liquityV2BoldPriceNote) is the Curve BOLD/USDC
 *  pool's last trade at a stated block (lib/liquity-v2/bold-price.ts). */
const LIQUITY_V2_PRICE_NOTE: Record<string, string> = {
  WETH: "WETH / USD: Chainlink ETH/USD, as the WETH branch's PriceFeed reads it",
  wstETH: "wstETH / USD: Chainlink stETH/USD × wstETH's stEthPerToken(), as the wstETH branch's PriceFeed composes it",
  rETH: "rETH / USD: Chainlink ETH/USD and rETH/ETH with rETH's getEthValue(), composed as the rETH branch's PriceFeed does",
};
export const liquityV2PriceNote = (ct: string) => LIQUITY_V2_PRICE_NOTE[ct] ?? `${ct} / USD`;

/** BOLD's, at the block the pool was read at. */
export const liquityV2BoldPriceNote = (block: number): string =>
  `BOLD / USD: 1 ÷ the Curve BOLD/USDC pool's last_price(0) at block ${block.toLocaleString("en-US")}, with USDC at $1`;
