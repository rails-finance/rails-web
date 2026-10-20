// Compound V3 on Arbitrum One — the four Comets and what each one states
// (rails-ops TO-DO-arbitrum-scoping.md item 12, Phase 0, read on Tenderly's
// Arbitrum gateway 2026-10-19 at block 516,372,991).
// ----------------------------------------------------------------------------
// Comet enumerates nothing and the Configurator
// (0xb21b06d71c75973babde35b49ffdac3f82ad3775) keeps no list of its proxies,
// so the roster is the comet repository's `deployments/arbitrum/*/roots.json`,
// each entry confirmed on chain: all four answer the same `governor()`,
// 0x3fb4d38ea7ec20d91917c09591490eeda38cf88a. The keys are rails-server's roster keys (the timeline row's
// `market`), so a row and a Comet meet on them.
//
// Unlike Base, each entry also states the Comet's base feed, scales and
// collateral roster as `getAssetInfo` answered them. The wallet read asks
// every asset in one multicall per Comet and checks each asset and feed
// against the contract in the same call (lib/sources/chain/compound-
// position.ts); the factors and caps on the page are the contract's answers
// at the read block. `supplyCap` "0" (supply off) and `borrowCollateralFactor`
// 0 (no new borrowing against the asset) are both live here: rsETH in the
// WETH Comet, wUSDM in the USDC Comet.

import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";
import type { CometDeployment, CometMarket } from "@/lib/compound/asset-catalog";

/** The four Comets, in the order surfaces show them. The USDC Comet comes
 *  first: the WETH Comet's dollar figures convert at its WETH feed, and the
 *  price reader takes the first dollar-quoted Comet for that leg
 *  (lib/sources/chain/compound-prices.ts). */
const ARBITRUM_MARKETS: CometMarket[] = [
  {
    key: "usdc",
    label: "cUSDCv3",
    comet: "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf",
    baseSymbol: "USDC",
    baseToken: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    baseDecimals: 6,
    quoteUnit: "USD",
    deployBlock: 122_080_500,
    baseFeed: "0x880d36763bb470cd395b7d6c76b50446fa70ace5", // USDC / USD SVR Price Feed
    baseScale: "1000000",
    baseBorrowMin: "1",
    trackingIndexScale: "1000000000000000",
    collateral: [
      {
        asset: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        symbol: "ARB",
        decimals: 18,
        priceFeed: "0x5998a5c516bd5e479e0b6aa6f243d372730b68d2", // ARB / USD SVR Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.7,
        liquidateCollateralFactor: 0.8,
        liquidationFactor: 0.9,
        supplyCap: "1946834000000000000000000",
      },
      {
        asset: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
        symbol: "GMX",
        decimals: 18,
        priceFeed: "0xdb98056fecfff59d032ab628337a4887110df3db", // GMX / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.6,
        liquidateCollateralFactor: 0.75,
        liquidationFactor: 0.85,
        supplyCap: "2596000000000000000000",
      },
      {
        asset: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        symbol: "WETH",
        decimals: 18,
        priceFeed: "0xb2988bdadc45c43e3fe1a728f715e94bee4db406", // ETH / USD SVR Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.83,
        liquidateCollateralFactor: 0.88,
        liquidationFactor: 0.93,
        supplyCap: "40000000000000000000000",
      },
      {
        asset: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
        symbol: "WBTC",
        decimals: 8,
        priceFeed: "0xcc392d2c3b37520e01712320be331d41f7661013", // BTC / USD SVR Price Feed
        scale: "100000000",
        borrowCollateralFactor: 0.75,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "100000000000",
      },
      {
        asset: "0x5979d7b546e38e414f7e9822514be443a4800529",
        symbol: "wstETH",
        decimals: 18,
        priceFeed: "0x92014e7f331dfab2848a5872aa8b2e7b6f3ce8b4", // wstETH / USD CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "8000000000000000000000",
      },
      {
        asset: "0x2416092f143378750bb29b79ed961ab195cceea5",
        symbol: "ezETH",
        decimals: 18,
        priceFeed: "0x5eba6ec97843163c92ab48a7ac0ccc8423c652b1", // ezETH / USD CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "102000000000000000000",
      },
      {
        asset: "0x57f5e098cad7a3d1eed53991d4d66c45c9af7812",
        symbol: "wUSDM",
        decimals: 18,
        priceFeed: "0x5d173813b4505701e79e654b36a95e6c1fad4448", // Constant price feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.0,
        liquidateCollateralFactor: 0.0001,
        liquidationFactor: 1.0,
        supplyCap: "0",
      },
      {
        asset: "0xd09acb80c1e8f2291862c4978a008791c9167003",
        symbol: "tETH",
        decimals: 18,
        priceFeed: "0x5372bcf3486d59c23f5fc85745b41f180efff881", // tETH / USD price feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "0",
      },
      {
        asset: "0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40",
        symbol: "tBTC",
        decimals: 18,
        priceFeed: "0xe808488e8627f6531ba79a13a9e0271b39abeb1c", // TBTC / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "0",
      },
    ],
  },
  {
    key: "usdce",
    label: "cUSDCev3",
    comet: "0xa5edbdd9646f8dff606d7448e414884c7d905dca",
    baseSymbol: "USDC.e",
    baseToken: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    baseDecimals: 6,
    quoteUnit: "USD",
    deployBlock: 87_335_214,
    baseFeed: "0x50834f3163758fcc1df9973b6e91f0f0f0434ad3", // USDC / USD
    baseScale: "1000000",
    baseBorrowMin: "100000000",
    trackingIndexScale: "1000000000000000",
    collateral: [
      {
        asset: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        symbol: "ARB",
        decimals: 18,
        priceFeed: "0xb2a824043730fe05f3da2efafa1cbbe83fa548d6", // ARB / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.55,
        liquidateCollateralFactor: 0.6,
        liquidationFactor: 0.9,
        supplyCap: "29851000000000000000000",
      },
      {
        asset: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
        symbol: "GMX",
        decimals: 18,
        priceFeed: "0xdb98056fecfff59d032ab628337a4887110df3db", // GMX / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.4,
        liquidateCollateralFactor: 0.45,
        liquidationFactor: 0.85,
        supplyCap: "0",
      },
      {
        asset: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        symbol: "WETH",
        decimals: 18,
        priceFeed: "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612", // ETH / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.78,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.93,
        supplyCap: "5000000000000000000000",
      },
      {
        asset: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
        symbol: "WBTC",
        decimals: 8,
        priceFeed: "0xd0c7101eacbb49f3decccc166d238410d6d46d57", // WBTC / USD
        scale: "100000000",
        borrowCollateralFactor: 0.7,
        liquidateCollateralFactor: 0.77,
        liquidationFactor: 0.9,
        supplyCap: "20000000000",
      },
    ],
  },
  {
    key: "usdt",
    label: "cUSDTv3",
    comet: "0xd98be00b5d27fc98112bde293e487f8d4ca57d07",
    baseSymbol: "USD₮0",
    baseToken: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    baseDecimals: 6,
    quoteUnit: "USD",
    deployBlock: 223_796_350,
    baseFeed: "0xedfb5fd27b0259b0a696364b183223b5ca3cbe62", // USDT / USD SVR Price Feed
    baseScale: "1000000",
    baseBorrowMin: "1000000",
    trackingIndexScale: "1000000000000000",
    collateral: [
      {
        asset: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        symbol: "ARB",
        decimals: 18,
        priceFeed: "0x5998a5c516bd5e479e0b6aa6f243d372730b68d2", // ARB / USD SVR Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.7,
        liquidateCollateralFactor: 0.8,
        liquidationFactor: 0.9,
        supplyCap: "454105000000000000000000",
      },
      {
        asset: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        symbol: "WETH",
        decimals: 18,
        priceFeed: "0xb2988bdadc45c43e3fe1a728f715e94bee4db406", // ETH / USD SVR Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.83,
        liquidateCollateralFactor: 0.88,
        liquidationFactor: 0.93,
        supplyCap: "20000000000000000000000",
      },
      {
        asset: "0x5979d7b546e38e414f7e9822514be443a4800529",
        symbol: "wstETH",
        decimals: 18,
        priceFeed: "0xc35137f62b825aeeaf30b69b6b32e3953d8d624a", // wstETH / USD CAPO SVR Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "16000000000000000000000",
      },
      {
        asset: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
        symbol: "WBTC",
        decimals: 8,
        priceFeed: "0xcc392d2c3b37520e01712320be331d41f7661013", // BTC / USD SVR Price Feed
        scale: "100000000",
        borrowCollateralFactor: 0.7,
        liquidateCollateralFactor: 0.8,
        liquidationFactor: 0.9,
        supplyCap: "100000000000",
      },
      {
        asset: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
        symbol: "GMX",
        decimals: 18,
        priceFeed: "0xdb98056fecfff59d032ab628337a4887110df3db", // GMX / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.6,
        liquidateCollateralFactor: 0.7,
        liquidationFactor: 0.8,
        supplyCap: "2729000000000000000000",
      },
      {
        asset: "0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40",
        symbol: "tBTC",
        decimals: 18,
        priceFeed: "0xe808488e8627f6531ba79a13a9e0271b39abeb1c", // TBTC / USD
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "3000000000000000000",
      },
      {
        asset: "0xd09acb80c1e8f2291862c4978a008791c9167003",
        symbol: "tETH",
        decimals: 18,
        priceFeed: "0x5372bcf3486d59c23f5fc85745b41f180efff881", // tETH / USD price feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "0",
      },
    ],
  },
  {
    key: "weth",
    label: "cWETHv3",
    comet: "0x6f7d514bbd4aff3bcd1140b7344b32f063dee486",
    baseSymbol: "WETH",
    baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    baseDecimals: 18,
    // "Constant price feed": a base priced in itself, so every figure in
    // this market is in ETH, as cWETHv3 is on Ethereum and Base.
    quoteUnit: "ETH",
    deployBlock: 219_386_101,
    baseFeed: "0xdb7edfa090061d9367cbeaf6be16ecbde596676c", // Constant price feed
    baseScale: "1000000000000000000",
    baseBorrowMin: "1000000000000",
    trackingIndexScale: "1000000000000000",
    collateral: [
      {
        asset: "0x35751007a407ca6feffe80b3cb397736d2cf4dbe",
        symbol: "weETH",
        decimals: 18,
        priceFeed: "0x4f12633d511dc3049de1ea923b7047fbed0070d2", // weETH / ETH CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.9,
        liquidateCollateralFactor: 0.93,
        liquidationFactor: 0.96,
        supplyCap: "760000000000000000000",
      },
      {
        asset: "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8",
        symbol: "rETH",
        decimals: 18,
        priceFeed: "0x60f2058379716a64a7a5d29219397e79bc552194", // rETH / ETH CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.9,
        liquidateCollateralFactor: 0.93,
        liquidationFactor: 0.97,
        supplyCap: "0",
      },
      {
        asset: "0x5979d7b546e38e414f7e9822514be443a4800529",
        symbol: "wstETH",
        decimals: 18,
        priceFeed: "0x311930889c61e141e15a61d11be974d749390e7a", // wstETH / ETH CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.88,
        liquidateCollateralFactor: 0.93,
        liquidationFactor: 0.97,
        supplyCap: "10000000000000000000000",
      },
      {
        asset: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
        symbol: "WBTC",
        decimals: 8,
        priceFeed: "0xfa454de61b317b6535a0c462267208e8fdb89f45", // WBTC / BTC BTC / ETH
        scale: "100000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.9,
        supplyCap: "50000000000",
      },
      {
        asset: "0x4186bfc76e2e237523cbc30fd220fe055156b41f",
        symbol: "rsETH",
        decimals: 18,
        priceFeed: "0xa4f2e977cab3177d61e2e7eaecd257bf09f2f915", // rsETH / ETH CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.0,
        liquidateCollateralFactor: 0.93,
        liquidationFactor: 0.96,
        supplyCap: "0",
      },
      {
        asset: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        symbol: "USD₮0",
        decimals: 6,
        priceFeed: "0x15eb948705933433826b9a7956741764e1432156", // USDT / ETH SVR Price Feed
        scale: "1000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.95,
        supplyCap: "20000000000000",
      },
      {
        asset: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        symbol: "USDC",
        decimals: 6,
        priceFeed: "0x675dafae7d2711032615bd32e6d352af32e5a8bd", // USDC / ETH SVR Price Feed
        scale: "1000000",
        borrowCollateralFactor: 0.8,
        liquidateCollateralFactor: 0.85,
        liquidationFactor: 0.95,
        supplyCap: "15000000000000",
      },
      {
        asset: "0x2416092f143378750bb29b79ed961ab195cceea5",
        symbol: "ezETH",
        decimals: 18,
        priceFeed: "0xa2699232b341881b1ed85d91592b7c259e029acf", // ezETH / ETH CAPO Price Feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.9,
        liquidateCollateralFactor: 0.93,
        liquidationFactor: 0.96,
        supplyCap: "0",
      },
      {
        asset: "0xd09acb80c1e8f2291862c4978a008791c9167003",
        symbol: "tETH",
        decimals: 18,
        priceFeed: "0x250bd3da70b1844dbe7491c521b9490abd57b709", // tETH / ETH price feed
        scale: "1000000000000000000",
        borrowCollateralFactor: 0.88,
        liquidateCollateralFactor: 0.93,
        liquidationFactor: 0.96,
        supplyCap: "0",
      },
    ],
  },
];

/** The chain every address here lives on. */
export const COMPOUND_ARBITRUM_CHAIN_ID = ARBITRUM_CHAIN_ID;

export const COMPOUND_ARBITRUM_DEPLOYMENT: CometDeployment = {
  chainId: ARBITRUM_CHAIN_ID,
  markets: ARBITRUM_MARKETS,
};

/** The Comet a market page's `market` segment names, by roster key in any
 *  case; null for a key the roster does not hold, which the route answers
 *  with a 404 (rails-ops reference/arbitrum-position-first-lane.md). */
export function compoundArbitrumMarketOf(key: string): CometMarket | null {
  const k = key.toLowerCase();
  return ARBITRUM_MARKETS.find((m) => m.key === k) ?? null;
}

/** The USDC.e Comet's creation block, the earliest of the four: where the
 *  history rails-server serves starts, and what lets it claim a whole life. */
export const COMPOUND_ARBITRUM_DEPLOY_BLOCK = 87_335_214;

/** The Bulker the four Comets share (roots.json, the same in all four; code
 *  present on chain). Their Rewards contract is
 *  0x88730d254a2f7e6ac8388c3198afd694ba9f7fae; no surface reads it yet. */
export const COMPOUND_ARBITRUM_BULKER = "0xbde8f31d2ddda895264e27dd990fab3dc87b372d" as const;
