// One-off, read-only: authoritative per-(hub, asset) liquidity fee (reserve factor)
// for Aave V4 on Ethereum mainnet, read directly on-chain.
//
// Getter: getAssetConfig(uint256 assetId) -> (address feeReceiver, uint16 liquidityFee,
//   address irStrategy, address reinvestmentController) on each hub impl.
// Scaling: liquidityFee is in BPS (PercentageMath.PERCENTAGE_FACTOR = 1e4 = 100%),
//   so fee% = liquidityFee / 100. Source: aave-v4 hub impl (verified Etherscan),
//   "@dev liquidityFee ... expressed in BPS." + require(<= PERCENTAGE_FACTOR).
//
// RPC discipline: ONE Multicall3 aggregate3 batch for all (hub, assetId) pairs.
// Reads RPC from sibling server .env; never prints secrets.

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../../rails-server-onboarding/.env", import.meta.url), "utf8");
const rpc = env.match(/^PONDER_RPC_URL_2=(.+)$/m)[1].trim();
const c = createPublicClient({ chain: mainnet, transport: http(rpc), batch: { multicall: true } });

const HUBS = {
  Core: "0xcca852bc40e560adc3b1cc58ca5b55638ce826c9",
  Plus: "0x06002e9c4412cb7814a791ea3666d905871e536a",
  Prime: "0x943827dca022d0f354a8a8c332da1e5eb9f9f931",
};

const HUB_ABI = [
  {
    type: "function",
    name: "getAssetConfig",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "feeReceiver", type: "address" },
          { name: "liquidityFee", type: "uint16" },
          { name: "irStrategy", type: "address" },
          { name: "reinvestmentController", type: "address" },
        ],
      },
    ],
  },
];

// (hub, asset_id, underlying, decimals) from aave_v4_hub_spoke_credit (distinct).
const PAIRS = [
  ["Core", 0, "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", 18],
  ["Core", 1, "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", 18],
  ["Core", 2, "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee", 18],
  ["Core", 3, "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7", 18],
  ["Core", 4, "0xdac17f958d2ee523a2206206994597c13d831ec7", 6],
  ["Core", 5, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6],
  ["Core", 6, "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", 18],
  ["Core", 7, "0x8292bb45bf1ee4d140127049757c2e0ff06317ed", 18],
  ["Core", 8, "0xe343167631d89b6ffc58b88d6b7fb0228795491d", 6],
  ["Core", 9, "0xcacd6fd266af91b8aed52accc382b4e165586e29", 18],
  ["Core", 10, "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c", 6],
  ["Core", 11, "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", 8],
  ["Core", 12, "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", 8],
  ["Core", 13, "0x8236a87084f8b84306f72007f36f2618a5634494", 8],
  ["Core", 14, "0x68749665ff8d2d112fa859aa293f07a622782f38", 6],
  ["Core", 15, "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", 18],
  ["Core", 16, "0x514910771af9ca656af840dff83e8264ecf986ca", 18],
  ["Plus", 0, "0x3de0ff76e8b528c092d47b9dac775931cef80f49", 18],
  ["Plus", 1, "0xaebf0bb9f57e89260d57f31af34eb58657d96ce0", 18],
  ["Plus", 2, "0x9d39a5de30e57443bff2a8307a4256c8797a3497", 18],
  ["Plus", 3, "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", 18],
  ["Plus", 4, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6],
  ["Plus", 5, "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", 18],
  ["Plus", 6, "0xdac17f958d2ee523a2206206994597c13d831ec7", 6],
  ["Prime", 0, "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", 18],
  ["Prime", 1, "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", 8],
  ["Prime", 2, "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", 8],
  ["Prime", 3, "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", 18],
  ["Prime", 4, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6],
  ["Prime", 5, "0xdac17f958d2ee523a2206206994597c13d831ec7", 6],
  ["Prime", 6, "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", 18],
];

const SYM = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "wstETH",
  "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee": "weETH",
  "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7": "rsETH",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f": "GHO",
  "0x8292bb45bf1ee4d140127049757c2e0ff06317ed": "USDS",
  "0xe343167631d89b6ffc58b88d6b7fb0228795491d": "USDG",
  "0xcacd6fd266af91b8aed52accc382b4e165586e29": "frxUSD",
  "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c": "RLUSD",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": "cbBTC",
  "0x8236a87084f8b84306f72007f36f2618a5634494": "LBTC",
  "0x68749665ff8d2d112fa859aa293f07a622782f38": "PYUSD",
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "AAVE",
  "0x514910771af9ca656af840dff83e8264ecf986ca": "LINK",
  "0x3de0ff76e8b528c092d47b9dac775931cef80f49": "?(plus0)",
  "0xaebf0bb9f57e89260d57f31af34eb58657d96ce0": "?(plus1)",
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "sUSDe",
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USDe",
};

const contracts = PAIRS.map(([hub, id]) => ({
  address: HUBS[hub],
  abi: HUB_ABI,
  functionName: "getAssetConfig",
  args: [BigInt(id)],
}));

// SINGLE Multicall3 aggregate3 batch (allowFailure) for all pairs.
const results = await c.multicall({ contracts, allowFailure: true });

console.log("HUB   | ASSET    | assetId | raw(bps) | fee %");
console.log("------+----------+---------+----------+-------");
let bad = 0;
for (let i = 0; i < PAIRS.length; i++) {
  const [hub, id, underlying] = PAIRS[i];
  const sym = SYM[underlying] ?? underlying;
  const r = results[i];
  if (r.status !== "success") {
    bad++;
    console.log(
      `${hub.padEnd(5)} | ${sym.padEnd(8)} | ${String(id).padStart(7)} | REVERT   | ${r.error?.shortMessage ?? r.error}`,
    );
    continue;
  }
  const raw = Number(r.result.liquidityFee);
  const pct = raw / 100;
  console.log(
    `${hub.padEnd(5)} | ${sym.padEnd(8)} | ${String(id).padStart(7)} | ${String(raw).padStart(8)} | ${pct.toFixed(2)}%`,
  );
}
console.log(`\n${PAIRS.length} pairs, ${bad} reverts. Scaling: BPS (10000=100%), fee% = raw/100.`);
