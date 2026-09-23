// Basedollar's five branch PriceFeeds, graded (fork playbook §6 in rails-ops).
// ----------------------------------------------------------------------------
// What each branch's price is made of: the oracle legs its PriceFeed reads, the
// arithmetic it does over them, the heartbeat and deviation each leg is pushed
// on, and the staleness threshold after which the PriceFeed treats a leg as down
// and shuts the branch. Read from the verified PriceFeed sources and from Base
// on 2026-09-21; `scripts/verify-basedollar-price-feeds.mjs` reads every value
// below back from chain and recomputes each fetchPrice from its legs.
//
// Every market leg is an API3 dAPI read through an Api3ReaderProxyV1 (an
// ERC1967 proxy speaking AggregatorV3Interface, `version() == 4913`, owned by
// API3's OwnableCallForwarder): none is a Chainlink aggregator. Heartbeat and
// deviation are the dAPI's update parameters in API3's AirseekerRegistry; the
// subscription that pays for those updates runs to `api3SubscriptionEnds`.
// The one non-API3 input is rETH's canonical rate, Rocket Pool's L1 rate
// relayed to Base into a RocketOvmPriceOracle.
//
// The composite exchange rates (wstETH/stETH, cbETH/ETH) are API3 feeds on
// Base, so they grade `oracle`: bridged wstETH and cbETH carry no rate getter
// here. Only rETH's canonical leg is a contract slot (`state`).

import type { LiquityForkPriceGrade } from "@/lib/shared/liquity-fork-live-provenance";

/** API3 contracts on Base (the `@api3/contracts` deployment list, chain 8453). */
export const API3_BASE = {
  airseekerRegistry: "0x7b42df2563e128ae3f68e2cfb1904808f61c8f12",
  api3MarketV2: "0x3f5c77bb36a16118ccc9ca83ddee8a01b6c01811",
  api3ServerV1: "0x709944a48caf83535e43471680fda4905fb3920a",
} as const;

/** The date every dAPI subscription below was paid through, per Api3MarketV2
 *  `getDapiData` on 2026-09-21. After it, updates stop unless renewed, and a
 *  branch shuts down 25 h after its oldest leg's last update. */
export const API3_SUBSCRIPTION_ENDS = "2026-12-20";

/** The PriceFeed staleness threshold — 90,000 s (25 h) on every leg of every
 *  branch, one hour over the dAPIs' 24 h heartbeat. */
const STALE_25H = 90_000;
const HB_24H = 86_400;

const api3 = (label: string, dapiName: string, address: string, getter: string) => ({
  label,
  source: "api3" as const,
  dapiName,
  address,
  getter,
  pclass: "oracle" as const,
  heartbeatS: HB_24H,
  deviationPct: 0.5,
  stalenessS: STALE_25H,
});

const ETH_USD = (getter = "ethUsdOracle") =>
  api3("ETH/USD", "ETH/USD", "0x77003c51b6febe7b88d1215004b91d4d3493fa30", getter);

/** Keyed by branch key, as BASEDOLLAR_BRANCHES is. */
export const BASEDOLLAR_PRICE_GRADES: Record<string, LiquityForkPriceGrade> = {
  weth: {
    contractName: "WETHPriceFeed",
    formula: "ETH/USD",
    legs: [ETH_USD()],
    redemption: null,
    onFailure: "ETH/USD down: the branch shuts down and prices at lastGoodPrice from then on.",
  },
  wsteth: {
    contractName: "WSTETHPriceFeed",
    formula: "stETH/USD × wstETH/stETH",
    legs: [
      api3("stETH/USD", "stETH/USD", "0x3df401c6ce98d6976acb7395460e32d99eb79d05", "stEthUsdOracle"),
      api3(
        "wstETH/stETH",
        "wstETH/stETH Exchange Rate",
        "0x00caeda3cb375a17a084b1bdce7136bb01bbd13d",
        "wstEthStEthOracle",
      ),
      { ...ETH_USD(), role: "redemptions and the stETH/USD fallback only" },
    ],
    redemption:
      "Redemptions take max(stETH/USD, ETH/USD) × wstETH/stETH when the two USD legs sit within 1% of each other.",
    onFailure:
      "wstETH/stETH or ETH/USD down: shut down at lastGoodPrice. stETH/USD down: shut down at min(ETH/USD × wstETH/stETH, lastGoodPrice).",
  },
  reth: {
    contractName: "RETHPriceFeed",
    formula: "min(ETH/USD × rETH/ETH, ETH/USD × rETH rate)",
    legs: [
      ETH_USD(),
      api3("rETH/ETH", "rETH/ETH Exchange Rate", "0xd75f2752ded6995106b163da472b96186ccf0441", "rEthEthOracle"),
      {
        label: "rETH rate",
        source: "rocket-ovm-rate",
        address: "0x658843bb859b7b85ceab5cf77167e3f0a78dfe7f",
        getter: "rateProviderAddress",
        pclass: "state",
        stalenessS: STALE_25H,
      },
    ],
    redemption: "Redemptions take the max of the two products when they sit within 2% of each other.",
    onFailure:
      "ETH/USD or the rETH rate down: shut down at lastGoodPrice. rETH/ETH down: shut down at min(ETH/USD × rETH rate, lastGoodPrice).",
  },
  wcbbtc: {
    contractName: "cbBTCPriceFeed",
    formula: "min(cbBTC/USD, BTC/USD)",
    legs: [
      api3("cbBTC/USD", "cbBTC/USD", "0x021d31211f81bc37ed7c9d535380cfaddd62c111", "cbBTCUsdOracle"),
      api3("BTC/USD", "BTC/USD", "0xb15fb0fe60b20689390f8306dedebc608ae1ff3d", "btcUsdOracle"),
    ],
    redemption: "Redemptions take the max of the two when they sit within 2% of each other.",
    onFailure: "Either leg down: the branch shuts down and prices at lastGoodPrice from then on.",
  },
  cbeth: {
    contractName: "cbETHPriceFeed",
    formula: "ETH/USD × cbETH/ETH",
    legs: [
      ETH_USD(),
      api3("cbETH/ETH", "cbETH/ETH Exchange Rate", "0xbe3efb4209ee6962c309e3ce8650d54b326d9cd3", "cbEthEthOracle"),
    ],
    redemption: null,
    onFailure: "Either leg down: the branch shuts down and prices at lastGoodPrice from then on.",
  },
};
