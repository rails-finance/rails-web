// Coarse asset classification for plain-language position summaries. Neutral,
// descriptive buckets only — no risk valence (see memory feedback-no-opinionated-color).
// "correlated" describes price behaviour (these move with ETH / BTC), not a judgement.

import { isStable } from "./liquidation-thresholds";

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

// Stable-DENOMINATED assets beyond the simulator's STABLE_SYMBOLS ($1 rails):
// yield-bearing stables and fiat stables the V3-family rosters list. These
// price like dollars (the classification is price behaviour) but are NOT $1
// rails — sDAI/sUSDS/syrup shares appreciate — so they must not join
// STABLE_SYMBOLS, which would give them a fixed-$1 treatment in the simulator.
const STABLE_DENOMINATED = new Set<string>([
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

/** Bucket a token symbol. Stablecoins are resolved via the simulator's
 *  STABLE_SYMBOLS set (USD + EUR fiat stables, Ethena dollars) plus the
 *  stable-denominated set above. */
export function assetClass(symbol: string): AssetClass {
  if (ETH_CORRELATED.has(symbol)) return "eth";
  if (BTC_CORRELATED.has(symbol)) return "btc";
  if (GOLD.has(symbol)) return "gold";
  if (isStable(symbol) || STABLE_DENOMINATED.has(symbol)) return "stablecoin";
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
