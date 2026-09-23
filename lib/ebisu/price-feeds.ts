// Ebisu's five branch PriceFeeds, graded (fork playbook §6 in rails-ops).
// ----------------------------------------------------------------------------
// What each branch's price is made of: the legs its PriceFeed reads, the
// arithmetic over them, each oracle leg's heartbeat and deviation, and the age
// after which the PriceFeed counts a leg down and shuts the branch. Read from
// the verified PriceFeed sources on Etherscan and from mainnet on 2026-09-22;
// `scripts/verify-ebisu-price-feeds.mjs` reads every value below back from
// chain and recomputes each fetchPrice and fetchRedemptionPrice from its legs.
//
// Three kinds of leg:
//   • Chainlink (EACAggregatorProxy) — ETH/USD, weETH/ETH, BTC/USD, WBTC/BTC,
//     LBTC/BTC. Heartbeat and deviation are Chainlink's published parameters.
//   • RedStone push feeds (TransparentUpgradeableProxy over a
//     PriceFeedWithoutRounds) — USDe/USD, sUSDe/USD, and cUSD_FUNDAMENTAL,
//     which is Cap's reserve-backed value for cUSD rather than a market price.
//     Heartbeat and deviation come from RedStone's mainnet relayer manifest.
//   • Token rate getters (`state`) — weETH.getRate(), sUSDe.previewRedeem,
//     stcUSD.convertToAssets. Read live, so they never age.
//
// WBTC and LBTC are 8-decimal collateral: the PriceFeed multiplies its USD
// price by 1e10, so fetchPrice is 1e28 × USD.

import type { LiquityForkPriceGrade, LiquityForkPriceLeg } from "@/lib/shared/liquity-fork-live-provenance";

const H1 = 3_600;
const H2 = 7_200;
const H24 = 86_400;
const H25 = 90_000;

const chainlink = (
  label: string,
  feedName: string,
  address: string,
  getter: string,
  heartbeatS: number,
  deviationPct: number,
  stalenessS: number,
): LiquityForkPriceLeg => ({
  label,
  source: "chainlink",
  feedName,
  address,
  getter,
  pclass: "oracle",
  heartbeatS,
  deviationPct,
  stalenessS,
});

const redstone = (
  label: string,
  feedName: string,
  address: string,
  getter: string,
  deviationPct: number,
): LiquityForkPriceLeg => ({
  label,
  source: "redstone",
  feedName,
  address,
  getter,
  pclass: "oracle",
  heartbeatS: H24,
  deviationPct,
  stalenessS: H25,
});

const rate = (label: string, read: string, address: string, getter: string): LiquityForkPriceLeg => ({
  label,
  source: "rate",
  read,
  address,
  getter,
  pclass: "state",
});

const ETH_USD = chainlink(
  "ETH/USD",
  "ETH / USD",
  "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
  "ethUsdOracle",
  H1,
  0.5,
  H2,
);
const BTC_USD = chainlink(
  "BTC/USD",
  "BTC / USD",
  "0xf4030086522a5beea4988f8ca5b36dbc97bee88c",
  "ethUsdOracle",
  H1,
  0.5,
  H2,
);

/** Keyed by branch key, as EBISU_BRANCHES is. */
export const EBISU_PRICE_GRADES: Record<string, LiquityForkPriceGrade> = {
  weeth: {
    contractName: "WEETHPriceFeed",
    formula: "min(ETH/USD × weETH/ETH, ETH/USD × weETH rate)",
    legs: [
      ETH_USD,
      chainlink(
        "weETH/ETH",
        "weETH / ETH",
        "0x5c9c449bbc9a6075a2c061df312a35fd1e05ff22",
        "weEthEthOracle",
        H24,
        0.5,
        H25,
      ),
      rate("weETH rate", "weETH.getRate()", "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee", "rateProviderAddress"),
    ],
    redemption: "Redemptions take the max of the two products when they sit within 2% of each other.",
    onFailure:
      "ETH/USD or the weETH rate down: shut down at lastGoodPrice. weETH/ETH down: shut down at min(ETH/USD × weETH rate, lastGoodPrice), then lastGoodPrice once ETH/USD also fails.",
  },
  susde: {
    contractName: "sUSDePriceFeed",
    formula: "min(sUSDe/USD, USDe/USD × sUSDe rate)",
    legs: [
      redstone(
        "sUSDe/USD",
        "RedStone Price Feed for sUSDe",
        "0xb99d174ed06c83588af997c8859f93e83dd4733f",
        "sUSDeUsdOracle",
        0.2,
      ),
      redstone(
        "USDe/USD",
        "RedStone Price Feed for USDe",
        "0xbc5fbcf58ceaea19d523abc76515b9aefb5cfd58",
        "ethUsdOracle",
        0.2,
      ),
      rate("sUSDe rate", "sUSDe.previewRedeem(1e18)", "0x9d39a5de30e57443bff2a8307a4256c8797a3497", "sUsde"),
    ],
    redemption: "Redemptions take the max of the two when they sit within 2% of each other.",
    onFailure:
      "Either RedStone leg down: the branch shuts down and prices at lastGoodPrice from then on. A reverting previewRedeem reverts the price read without shutting down.",
  },
  wbtc: {
    contractName: "WBTCPriceFeed",
    formula: "min(BTC/USD × WBTC/BTC, BTC/USD)",
    legs: [
      BTC_USD,
      chainlink("WBTC/BTC", "WBTC / BTC", "0xfdfd9c85ad200c506cf9e21f1fd8dd01932fbb23", "wbtcBtcOracle", H24, 0.5, H25),
    ],
    redemption: "Redemptions take the max of the two when they sit within 2% of each other.",
    onFailure: "Either leg down: the branch shuts down and prices at lastGoodPrice from then on.",
  },
  lbtc: {
    contractName: "LBTCPriceFeed",
    formula: "min(BTC/USD × LBTC/BTC, BTC/USD)",
    legs: [
      BTC_USD,
      chainlink("LBTC/BTC", "LBTC / BTC", "0x5c29868c58b6e15e2b962943278969ab6a7d3212", "lbtcBtcOracle", H24, 0.5, H25),
    ],
    redemption: "Redemptions take the max of the two when they sit within 2% of each other.",
    onFailure: "Either leg down: the branch shuts down and prices at lastGoodPrice from then on.",
  },
  stcusd: {
    contractName: "YieldBearingStablecoinPriceFeed",
    formula: "cUSD/USD × stcUSD rate",
    legs: [
      {
        ...redstone(
          "cUSD/USD",
          "RedStone Price Feed for cUSD_FUNDAMENTAL",
          "0x9a5a3c3ed0361505cc1d4e824b3854de5724434a",
          "ethUsdOracle",
          0.05,
        ),
        contractName: "RedStone cUSD fundamental feed",
      },
      rate(
        "stcUSD rate",
        "stcUSD.convertToAssets(1e18)",
        "0x88887be419578051ff9f4eb6c858a951921d8888",
        "yieldBearingToken",
      ),
    ],
    redemption: null,
    onFailure: "cUSD/USD down: the branch shuts down and prices at lastGoodPrice from then on.",
  },
};
