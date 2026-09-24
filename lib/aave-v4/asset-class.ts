// Coarse asset classification for plain-language position summaries. Neutral,
// descriptive buckets only — no risk valence (see memory feedback-no-opinionated-color).
// "correlated" describes price behaviour (these move with ETH / BTC), not a judgement.

export type AssetClass = "eth" | "btc" | "stablecoin" | "gold" | "other";

const ETH_CORRELATED = new Set<string>([
  "ETH",
  "WETH",
  "stETH",
  "wstETH",
  "weETH",
  "rsETH",
  "ETHx",
  "osETH",
  "cbETH",
  "rETH",
  "ezETH",
  "rswETH",
]);
const BTC_CORRELATED = new Set<string>(["WBTC", "cbBTC", "LBTC", "tBTC", "BTCB", "eBTC", "swBTC"]);
const GOLD = new Set<string>(["XAUt", "PAXG"]);

// Stable-DENOMINATED assets: fiat stables (USD and EUR), Ethena dollars, the
// Pendle principal tokens of those, and the yield-bearing shares (sDAI, sUSDS,
// sUSDe, syrup) that appreciate against a dollar. This bucket describes price
// behaviour for the hub and exposure prose, so a name list is the right tool
// here. It is NOT the $1-rail rule the liquidation figures use: that is
// `isDollarRail` in lib/aave-v4/liquidation-thresholds.ts, decided per asset
// from its own oracle price, because sDAI, sUSDS and sUSDe are stable-denominated
// and not worth a dollar.
const STABLE_DENOMINATED = new Set<string>([
  "USDC",
  "USDT",
  "DAI",
  "GHO",
  "EURC",
  "USDG",
  "frxUSD",
  "RLUSD",
  "USDe",
  "sUSDe",
  "PT-sUSDE",
  "PT-sUSDE-7MAY2026",
  "PT-USDe-7MAY2026",
  "PT-USDG-24SEP2026",
  "LUSD",
  "BOLD",
  "USDS",
  "sUSDS",
  "sDAI",
  "PYUSD",
  "crvUSD",
  "FRAX",
  "USDtb",
  "syrupUSDC",
  "syrupUSDT",
]);

/** Bucket a token symbol. */
export function assetClass(symbol: string): AssetClass {
  if (ETH_CORRELATED.has(symbol)) return "eth";
  if (BTC_CORRELATED.has(symbol)) return "btc";
  if (GOLD.has(symbol)) return "gold";
  if (STABLE_DENOMINATED.has(symbol)) return "stablecoin";
  return "other";
}

// Sentence-case label — for inline prose ("Collateral is 60% stablecoin, 40%
// eth-correlated…"). Lowercase on purpose so it reads naturally mid-sentence.
export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  eth: "ETH-correlated",
  btc: "BTC-correlated",
  stablecoin: "stablecoin",
  gold: "gold",
  other: "other",
};

// Title-case label — for standalone UI (legends, chips, table cells), where a
// label is a noun, not part of a sentence.
export const ASSET_CLASS_TITLE: Record<AssetClass, string> = {
  eth: "ETH Correlated",
  btc: "BTC Correlated",
  stablecoin: "Stablecoin",
  gold: "Gold Correlated",
  other: "Other",
};

// Categorical grouping color per class — a grouping aid, NOT a risk valence
// (green here means "stablecoin", never "safe"). Applied to supply-mix bars,
// filter-chip dots and table class markers on the hub surfaces. Single hex per
// class, legible on both light and dark `bg-raised`.
export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  stablecoin: "#22c55e", // green
  eth: "#3b82f6", // blue
  btc: "#f97316", // orange
  gold: "#eab308", // gold
  other: "#8b5e34", // brown
};
