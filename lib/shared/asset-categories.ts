// Asset categories on the asset explorer (rails-ops reference/asset-key-map.md,
// "The asset explorer"). Rails' classification: the protocols and the chain
// state no category, so the field carries no source receipt and the page says
// whose grouping it is. The six categories and the first rows are the
// prototype's (rails-web-prototype packages/shared/src/protocol-metadata.ts);
// the table runs over the price roster by symbol, and a symbol it does not
// name is "other". Liquidity-pool shares, Pendle PTs, receipt tokens (aTokens,
// cTokens, Spark's spDAI), the Maker RWA ilks and tokens whose kind Rails has
// not settled stay "other" until someone classifies them.

export type AssetCategory =
  | "network"
  | "stablecoin"
  | "yield-stable"
  | "liquid-staking"
  | "wrapped-asset"
  | "governance"
  | "other";

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  network: "Network",
  stablecoin: "Stablecoin",
  "yield-stable": "Yield-bearing Stable",
  "liquid-staking": "Liquid Staking",
  "wrapped-asset": "Wrapped Asset",
  governance: "Governance",
  other: "Other",
};

/** Pill order. */
export const ASSET_CATEGORY_ORDER: readonly AssetCategory[] = [
  "network",
  "stablecoin",
  "yield-stable",
  "liquid-staking",
  "wrapped-asset",
  "governance",
  "other",
];

const TABLE: Record<Exclude<AssetCategory, "other">, readonly string[]> = {
  network: ["ETH", "WETH", "BTC"],
  stablecoin: [
    "USDC",
    "USDT",
    "DAI",
    "LUSD",
    "BOLD",
    "GHO",
    "crvUSD",
    "USDS",
    "USDe",
    "USDaf",
    "ebUSD",
    "fxUSD",
    "ZCHF",
    "SAI",
    "FEI",
    "FRAX",
    "frxUSD",
    "GUSD",
    "PYUSD",
    "RLUSD",
    "TUSD",
    "USD1",
    "USDbC",
    "USDG",
    "USDP",
    "USDtb",
    "EURC",
    "deUSD",
    "mUSD",
    "rUSD",
  ],
  "yield-stable": [
    "sDAI",
    "sUSDe",
    "sUSDS",
    "scrvUSD",
    "sBOLD",
    "sfrxUSD",
    "ysyBOLD",
    "sFRAX",
    "sdeUSD",
    "srUSD",
    "wsrUSD",
    "stcUSD",
    "wUSDM",
    "syrupUSDC",
    "syrupUSDT",
    "syrupUSDG",
  ],
  "liquid-staking": [
    "stETH",
    "wstETH",
    "rETH",
    "weETH",
    "eETH",
    "ezETH",
    "rsETH",
    "wrsETH",
    "frxETH",
    "sfrxETH",
    "cbETH",
    "ETHx",
    "mETH",
    "osETH",
    "pufETH",
    "rswETH",
    "tETH",
    "wOETH",
    "wsuperOETHb",
    "LBTC",
    "eBTC",
  ],
  "wrapped-asset": ["WBTC", "cbBTC", "tBTC", "FBTC", "BTC.b", "renBTC", "SolvBTC", "cbXRP", "PAXG", "XAUt"],
  governance: [
    "LQTY",
    "CRV",
    "AAVE",
    "COMP",
    "LDO",
    "UNI",
    "BAL",
    "COW",
    "PENDLE",
    "MKR",
    "RPL",
    "EIGEN",
    "GRT",
    "SKY",
    "YFI",
    "FXS",
    "FXN",
    "SNX",
    "ALCX",
    "AURA",
    "PEPE",
    "FPS",
    "MATIC",
    "1INCH",
    "ENS",
    "GNO",
    "KNC",
    "LRC",
    "LINK",
    "MANA",
    "BAT",
    "ZRX",
    "REP",
    "SUSHI",
    "STG",
    "AERO",
    "SEAM",
    "WELL",
    "MORPHO",
    "DOLO",
    "WLFI",
    "VVV",
    "VIRTUAL",
    "MAMO",
    "DEGEN",
    "BRETT",
  ],
};

const BY_SYMBOL: ReadonlyMap<string, AssetCategory> = new Map(
  (Object.entries(TABLE) as [AssetCategory, readonly string[]][]).flatMap(([c, syms]) => syms.map((s) => [s, c])),
);

/** The category Rails puts a symbol in; "other" where the table names none. */
export function assetCategory(symbol: string): AssetCategory {
  return BY_SYMBOL.get(symbol) ?? "other";
}
