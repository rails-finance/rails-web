// A hand-maintained snapshot of supported-token addresses. No build step
// regenerates it — edit by hand when tokens change. When new symbols appear in
// the API response that aren't here, the TokenChipIcon falls through to
// UnknownTokenSvg (acceptable).
//
// Addresses are lowercased; consumers checksum at lookup time when needed
// (Trust Wallet CDN URLs require EIP-55 case).

import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { BASE_TOKEN_ADDRESSES } from "@/lib/shared/token-addresses.base";
import { SEPOLIA_TOKEN_ADDRESSES } from "@/lib/shared/token-addresses.sepolia";

export const TOKEN_ADDRESSES: Record<string, string> = {
  "1INCH": "0x111111111117dc0aa78b770fa6a738034120c302",
  AAVE: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
  ALCX: "0xdbdb4d16eda451d0503b854cf79d55697f90c8df",
  // alUSD's own address: already read from the chain twice over, as the
  // yieldToken() of two Pendle PTs that mature on it (pt-underlying.ts). Not
  // a local PNG (no source hosts one yet), but present here so the chip's CDN
  // tiers get a real address to ask about instead of none.
  alUSD: "0xdcd0f5ab30856f28385f641580bbd85f88349124",
  // alETH's own address, the Alchemix V3 eth-aleth line's debtToken()
  // (migration 328 on rails-server-onboarding); symbol() confirmed "alETH" on
  // chain. public/icons/tokens/aleth.png resolves first via the local-by-
  // symbol tier; this entry is the CDN fallback behind it.
  alETH: "0x0100546f2cd4c9d97f798ffc9755e47865ff7ee6",
  ankrETH: "0xe95a203b1a91a908f9b9ce46459d101078c2c3cb",
  AURA: "0xc0c293ce456ff0ed870add98a0828dd4d2903dbf",
  BAL: "0xba100000625a3754423978a60c9317c58a424e3d",
  BOLD: "0x6440f144b7e50d6a8439336510312d2f54beb01d",
  cbBTC: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  cbETH: "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
  COMP: "0xc00e94cb662c3520282e6f5717214004a7f26888",
  CRV: "0xd533a949740bb3306d119cc777fa900ba034cd52",
  crvUSD: "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
  CVX: "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b",
  cvxCRV: "0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7",
  DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
  ebUSD: "0x09fd37d9aa613789c517e76df1c53aece2b60df4",
  eETH: "0x35fa164735182de50811e8e2e824cfb9b6118ac2",
  EIGEN: "0xec53bf9167f50cdeb3ae105f56099aaab9061f83",
  ENJ: "0xe6a934089bbee34f832060ce98848359883749b3",
  ENS: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
  ETHx: "0xa35b1b31ce002fbf2058d22f30f95d405200a15b",
  EURC: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
  ezETH: "0xbf5495efe5db9ce00f80364c8b423567e58d2110",
  FPS: "0x1ba26788dfde592fec8bcb0eaff472a42be341b2",
  FRAX: "0x853d955acef822db058eb8505911ed77f175b99e",
  frxETH: "0x5e8422345238f34275888049021821e8e08caa1f",
  frxUSD: "0xcacd6fd266af91b8aed52accc382b4e165586e29",
  FXN: "0x365accfca291e7d3914637abf1f7635db165bb09",
  FXS: "0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0",
  fxUSD: "0x085780639cc2cacd35e474e71f4d000e2405d8f6",
  GHO: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f",
  GNO: "0x6810e776880c02933d47db1b9fc05908e5386b96",
  GRT: "0xc944e90c64b2c07662a292be6244bdf05cda44a7",
  KNC: "0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202",
  LBTC: "0x8236a87084f8b84306f72007f36f2618a5634494",
  LDO: "0x5a98fcbea516cf06857215779fd812ca3bef1b32",
  LINK: "0x514910771af9ca656af840dff83e8264ecf986ca",
  LQTY: "0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d",
  lsETH: "0x8c1bed5b9a0928467c9b1341da1d7bd5e10b6549",
  LUSD: "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
  MATIC: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0",
  mETH: "0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa",
  MKR: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
  oETH: "0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3",
  osETH: "0xf1c9acdc66974dfb6decb12aa385b9cd01190e38",
  PAXG: "0x45804880de22913dafe09f4980848ece6ecbaf78",
  PENDLE: "0x808507121b80c02388fad14726482e061b8da827",
  PEPE: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
  "PT-sUSDE": "0x3de0ff76e8b528c092d47b9dac775931cef80f49",
  pufETH: "0xd9a442856c234a39a81a089c06451ebaa4306a72",
  PYUSD: "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
  rETH: "0xae78736cd615f374d3085123a210448e74fc6393",
  RLUSD: "0x8292bb45bf1ee4d140127049757c0cca2f5f11de",
  RPL: "0xd33526068d116ce69f19a9ee46f0bd304f21a51f",
  rsETH: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
  sBOLD: "0x50bd66d59911f5e086ec87ae43c811e0d059dd11",
  scrvUSD: "0x0655977feb2f289a4ab78af67bab0d17aab84367",
  sDAI: "0x83f20f44975d03b1b09e64809b757c47f942beea",
  sfrxETH: "0xac3e018457b222d93114458476f3e3416abbe38f",
  sfrxUSD: "0xcf62f905562626cfcdd2261162a51fd02fc9c5b6",
  SKY: "0x56072c95faa701256059aa122697b133aded9279",
  SNX: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f",
  stcUSD: "0x55c08ca52497e2f1534b59e2917bf524d4765257",
  stETH: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
  STG: "0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6",
  sUSDe: "0x9d39a5de30e57443bff2a8307a4256c8797a3497",
  sUSDS: "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd",
  swETH: "0xf951e335afb289353dc249e82926178eac7ded78",
  tBTC: "0x18084fba666a33d37592fa2633fd49a74dd93a88",
  UNI: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  USDaf: "0x9cf12ccd6020b6888e4d4c4e4c7aca33c1eb91f8",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "USDC.e": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  USDe: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
  USDFI: "0xa0ed3359902eff692e5b8167038133a73d641909",
  USDG: "0xe343167631d89b6ffc58b88d6b7fb0228795491d",
  USDS: "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  wBETH: "0xa2e3356610840701bdf5611a53974510ae27e2e1",
  WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  weETH: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee",
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  wstETH: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  XAUt: "0x68749665ff8d2d112fa859aa293f07a622782f38",
  yBOLD: "0x9f4330700a36b29952869fac9b33f45eedd8a3d8",
  YFI: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e",
  // Yearn Staked yBOLD, chain-confirmed by symbol() and by Asymmetry's ysyBOLD
  // ActivePool.collToken(). The old value here (0xb45ad160…) is sDOLA — every
  // symbol-only ysyBOLD chip drew Inverse's mark.
  ysyBOLD: "0x23346b04a7f55b8760e5860aa5a77383d63491cd",
  ZCHF: "0xb58e61c3098d85632df34eecfb899a1ed80921cb",
};

/** The address a symbol names on `chainId` — Ethereum's hand-kept table, the
 *  generated Base one (token-addresses.base.ts), or Sepolia's three-row one.
 *  No cross-chain fallback: a caller that wants Ethereum's brand mark for a
 *  Base symbol asks for chain 1 explicitly, so the CDN path it builds matches
 *  the address. */
export function getTokenAddress(symbol: string, chainId: ChainId = MAINNET_CHAIN_ID): string | null {
  const table =
    chainId === BASE_CHAIN_ID
      ? BASE_TOKEN_ADDRESSES
      : chainId === SEPOLIA_CHAIN_ID
        ? SEPOLIA_TOKEN_ADDRESSES
        : TOKEN_ADDRESSES;
  return table[symbol] ?? null;
}
