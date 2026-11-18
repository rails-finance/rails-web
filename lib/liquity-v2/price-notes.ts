// The words for a Liquity V2 collateral price as the app reads it
// (/api/oracle/liquity-v2): one module, so the listing card's receipt and the
// wallet band's say the same thing (ui-jobs 737).

/** Whose price each branch's collateral takes, and how it is composed: the
 *  Chainlink feeds and the LST's exchange rate, as the branch's PriceFeed
 *  composes them (rails-server utils/liquity-v2-prices.ts), at a read that
 *  states no block. */
const LIQUITY_V2_PRICE_NOTE: Record<string, string> = {
  WETH: "WETH / USD: Chainlink ETH/USD, as the WETH branch's PriceFeed reads it",
  wstETH: "wstETH / USD: Chainlink stETH/USD × wstETH's stEthPerToken(), as the wstETH branch's PriceFeed composes it",
  rETH: "rETH / USD: Chainlink ETH/USD and rETH/ETH with rETH's getEthValue(), composed as the rETH branch's PriceFeed does",
};
export const liquityV2PriceNote = (ct: string) => LIQUITY_V2_PRICE_NOTE[ct] ?? `${ct} / USD`;
