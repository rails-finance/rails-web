// Asymmetry's seven branch PriceFeeds, graded (fork playbook §6 in rails-ops).
// ----------------------------------------------------------------------------
// What each branch's price is made of: the legs its PriceFeed reads, the
// arithmetic over them, each oracle leg's heartbeat and deviation, and the age
// after which a leg counts as down. Read from the verified sources on
// Etherscan and from mainnet on 2026-09-22;
// `scripts/verify-asymmetry-price-feeds.mjs` reads every value below back from
// chain and recomputes each fetchPrice and fetchRedemptionPrice from its legs.
//
// Asymmetry's PriceFeeds read Asymmetry's own AggregatorV3 adapters (`via`),
// not the market feeds directly. Each adapter reads a Chainlink feed, and on a
// stale Chainlink answer switches to a fallback adapter that reads a Curve
// price aggregator (crvUSD's AggregatorStablePrice, or a crvUSD mint market's
// EMA oracle) and stamps the answer with the current block — so while the
// fallback is enabled, the PriceFeed's own staleness check does not trip.
// Asymmetry's owner (0xce35…738b) can disable each fallback; a disabled one
// answers 0 and the branch shuts down.
//
// Three stablecoin branches (scrvUSD, sUSDS, sfrxUSD) run canonical Liquity's
// WETHPriceFeed over an ERC-4626 adapter: USD feed × vault rate. ysyBOLD's
// adapter reads no market feed at all: two vault rates with BOLD taken as $1,
// stamped with the current block, behind a staleness threshold of 2^256 − 1.
// The BTC branches run a BTCPriceFeed that takes min(collateral/USD, BTC/USD)
// and, when Chainlink BTC/USD is stale, drops it and prices at the collateral
// leg alone rather than shutting down. sfrxUSD's adapter names its feed
// `_CL_SFRXUSD_USD_PRICE_FEED`; the feed is frxUSD/USD.
//
// Every collateral here is 18-decimal, so fetchPrice is 1e18 × USD.

import type { LiquityForkPriceGrade, LiquityForkPriceLeg } from "@/lib/shared/liquity-fork-live-provenance";

const H1 = 3_600;
const H23 = 82_800;
const H24 = 86_400;
const H48 = 172_800;

/** Asymmetry's owner of every fallback adapter (`disableFallback()`). */
export const ASYMMETRY_FALLBACK_OWNER = "0xce352181c0f0350f1687e1a44c45bc9d96ee738b";

const chainlink = (
  label: string,
  feedName: string,
  address: string,
  getter: string,
  heartbeatS: number,
  deviationPct: number,
  stalenessS: number,
  via?: { name: string; address: string },
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
  ...(via && { via }),
});

const rate = (
  label: string,
  read: string,
  address: string,
  via: { name: string; address: string },
): LiquityForkPriceLeg => ({
  label,
  source: "rate",
  read,
  address,
  getter: "ethUsdOracle",
  via,
  pclass: "state",
});

const curve = (
  label: string,
  aggName: string,
  address: string,
  via: { name: string; address: string },
  role: string,
): LiquityForkPriceLeg => ({
  label,
  source: "curve",
  read: `${via.name} → Curve ${aggName}.price()`,
  address,
  contractName: `Curve ${aggName}`,
  getter: "FALLBACK_ORACLE",
  via,
  pclass: "state",
  role,
});

const BTC_USD = (stalenessS: number) =>
  chainlink("BTC/USD", "BTC / USD", "0xf4030086522a5beea4988f8ca5b36dbc97bee88c", "btcUsdOracle", H1, 0.5, stalenessS);

const CRVUSD_ADAPTER = { name: "ScrvUsdOracle", address: "0x5a0605efb3a50adc9f81dd456812953655aa4ec9" };
const SUSDS_ADAPTER = { name: "SusdsOracle", address: "0x9d09d5175783f0caa56d6d1e7590c2b935082d10" };
const SFRXUSD_ADAPTER = { name: "SfrxUsdOracle", address: "0x48ba7b711a8d5dadc6690de2e86533f70ee5b433" };
const STYBOLD_ADAPTER = { name: "StyBoldOracle", address: "0xc1ed3729cfcf9f93a7dbe1e4669bc67793182d03" };
const TBTC_ADAPTER = { name: "TbtcOracle", address: "0x39fca0f77ba22926e8e5ec5df68271eb49a3a775" };
const WBTC_ADAPTER = { name: "WbtcOracle", address: "0x1919de21635276a80aa3384a852df8189e1b7205" };
const CBBTC_ADAPTER = { name: "CbbtcOracle", address: "0x2357105b6b16034ee2fea32e23edf403b18593d7" };

const BTC_REDEMPTION = "Redemptions take the max of the two when they sit within 2% of each other.";
const ADAPTER_ZERO = (adapter: string) =>
  `A zero or reverting answer from ${adapter} shuts the branch down at lastGoodPrice.`;

/** Keyed by branch key, as ASYMMETRY_BRANCHES is. */
export const ASYMMETRY_PRICE_GRADES: Record<string, LiquityForkPriceGrade> = {
  ysybold: {
    contractName: "WETHPriceFeed",
    formula: "st-yBOLD rate × yBOLD rate, BOLD taken as $1",
    pclass: "state",
    legs: [
      rate("st-yBOLD rate", "st-yBOLD.convertToAssets", "0x23346b04a7f55b8760e5860aa5a77383d63491cd", STYBOLD_ADAPTER),
      rate("yBOLD rate", "yBOLD.convertToAssets", "0x9f4330700a36b29952869fac9b33f45eedd8a3d8", STYBOLD_ADAPTER),
    ],
    redemption: null,
    onFailure: `No leg can go stale: StyBoldOracle stamps each answer with the current block and the PriceFeed's threshold is 2^256 − 1. ${ADAPTER_ZERO("StyBoldOracle")}`,
  },
  scrvusd: {
    contractName: "WETHPriceFeed",
    formula: "crvUSD/USD × scrvUSD rate",
    legs: [
      chainlink(
        "crvUSD/USD",
        "CRVUSD / USD",
        "0xeef0c605546958c1f899b6fb336c20671f9cd49f",
        "ethUsdOracle",
        H24,
        0.5,
        H48,
        CRVUSD_ADAPTER,
      ),
      rate(
        "scrvUSD rate",
        "scrvUSD.convertToAssets(1e18)",
        "0x0655977feb2f289a4ab78af67bab0d17aab84367",
        CRVUSD_ADAPTER,
      ),
      curve(
        "crvUSD/USD fallback",
        "AggregatorStablePrice",
        "0x18672b1b0c623a30089a280ed9256379fb0e4e62",
        { name: "CrvUsdFallbackOracle", address: "0x2b36d82bfb9ea09bbed084be34df942aad0eeb35" },
        "stands in for Chainlink crvUSD/USD once it is 48 h old",
      ),
    ],
    redemption: null,
    onFailure: `Chainlink crvUSD/USD 48 h old: ScrvUsdOracle answers from the Curve fallback and the branch stays open. ${ADAPTER_ZERO("ScrvUsdOracle")}`,
  },
  susds: {
    contractName: "WETHPriceFeed",
    formula: "USDS/USD × sUSDS rate",
    legs: [
      chainlink(
        "USDS/USD",
        "USDS / USD",
        "0xff30586cd0f29ed462364c7e81375fc0c71219b1",
        "ethUsdOracle",
        H23,
        0.3,
        H48,
        SUSDS_ADAPTER,
      ),
      rate("sUSDS rate", "sUSDS.convertToAssets(1e18)", "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd", SUSDS_ADAPTER),
    ],
    redemption: null,
    onFailure: `USDS/USD 48 h old: the branch shuts down at lastGoodPrice; SusdsOracle has no fallback. ${ADAPTER_ZERO("SusdsOracle")}`,
  },
  sfrxusd: {
    contractName: "WETHPriceFeed",
    formula: "frxUSD/USD × sfrxUSD rate",
    legs: [
      chainlink(
        "frxUSD/USD",
        "frxUSD / USD",
        "0x9b4a96210bc8d9d55b1908b465d8b0de68b7ff83",
        "ethUsdOracle",
        H24,
        0.5,
        H48,
        SFRXUSD_ADAPTER,
      ),
      rate(
        "sfrxUSD rate",
        "sfrxUSD.convertToAssets(1e18)",
        "0xcf62f905562626cfcdd2261162a51fd02fc9c5b6",
        SFRXUSD_ADAPTER,
      ),
    ],
    redemption: null,
    onFailure: `frxUSD/USD 48 h old: the branch shuts down at lastGoodPrice; SfrxUsdOracle has no fallback. ${ADAPTER_ZERO("SfrxUsdOracle")}`,
  },
  tbtc: {
    contractName: "BTCPriceFeed",
    formula: "min(tBTC/USD, BTC/USD)",
    legs: [
      chainlink(
        "tBTC/USD",
        "TBTC / USD",
        "0x8350b7de6a6a2c1368e7d4bd968190e13e354297",
        "ethUsdOracle",
        H24,
        2,
        H48,
        TBTC_ADAPTER,
      ),
      BTC_USD(H24),
      curve(
        "tBTC/USD fallback",
        "CryptoWithStablePriceTBTC",
        "0xbef434e2acf0fbad1f0579d2376fed0d1cfc4217",
        { name: "TbtcFallbackOracle", address: "0x193b7da0f8036709774054dfd7539ca36654aba5" },
        "stands in for Chainlink tBTC/USD once it is 48 h old",
      ),
    ],
    redemption: BTC_REDEMPTION,
    onFailure: `BTC/USD 24 h old: the PriceFeed prices at tBTC/USD alone and stays open. Chainlink tBTC/USD 48 h old: TbtcOracle answers from the Curve fallback. ${ADAPTER_ZERO("TbtcOracle")}`,
  },
  wbtc18: {
    contractName: "BTCPriceFeed",
    formula: "min(WBTC/BTC × BTC/USD, BTC/USD)",
    legs: [
      chainlink(
        "WBTC/BTC",
        "WBTC / BTC",
        "0xfdfd9c85ad200c506cf9e21f1fd8dd01932fbb23",
        "ethUsdOracle",
        H24,
        0.5,
        H48,
        WBTC_ADAPTER,
      ),
      BTC_USD(H24),
      curve(
        "WBTC/USD fallback",
        "CryptoWithStablePriceWBTC",
        "0xbe83fd842db4937c0c3d15b2aba6af7e854f8dcb",
        { name: "WbtcFallbackOracle", address: "0x66871db0ca840ac3e9cb2dbbfcff8ec060661b4b" },
        "stands in for WBTC/BTC × BTC/USD once WBTC/BTC is 48 h old or BTC/USD 24 h old",
      ),
    ],
    redemption: BTC_REDEMPTION,
    onFailure: `BTC/USD 24 h old: WbtcOracle answers from the Curve fallback and the PriceFeed prices at that alone, staying open. WBTC/BTC 48 h old: WbtcOracle answers from the Curve fallback. ${ADAPTER_ZERO("WbtcOracle")}`,
  },
  cbbtc18: {
    contractName: "BTCPriceFeed",
    formula: "min(cbBTC/USD, BTC/USD)",
    legs: [
      chainlink(
        "cbBTC/USD",
        "cbBTC / USD",
        "0x2665701293fcbeb223d11a08d826563edcce423a",
        "ethUsdOracle",
        H24,
        2,
        H24,
        CBBTC_ADAPTER,
      ),
      BTC_USD(H1),
      curve(
        "cbBTC/USD fallback",
        "CryptoFromPoolWAgg",
        "0x4710a77a0e0f4c7b0e11cdeb74acb042e62b8d22",
        { name: "CbbtcFallbackOracle", address: "0x95480dd073c2e47e4166fe2ce6da79662d8fe2fb" },
        "stands in for Chainlink cbBTC/USD once it is 24 h old",
      ),
    ],
    redemption: BTC_REDEMPTION,
    onFailure: `BTC/USD counts as down at 1 h, its heartbeat, so a quiet hour can end with the PriceFeed pricing at cbBTC/USD alone; the branch stays open. Chainlink cbBTC/USD 24 h old: CbbtcOracle answers from the Curve fallback. ${ADAPTER_ZERO("CbbtcOracle")}`,
  },
};
