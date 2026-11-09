// The Aave-family markets that have a market page (anatomy M1) and reserve
// pages under it (M3, ui-jobs 541): one entry per Pool, read by both pages so
// the route, the chain and the names are written once.
// ----------------------------------------------------------------------------
// A reserve page sits at `<marketHref>/<asset>`, the asset its lowercased
// underlying address (the key /assets/<chain>/<token> uses). Aave V3 on
// Ethereum runs three Pools on one route: /ethereum/aave-v3/markets is the
// overview of all three (a panel each), and `?market=core|prime|etherfi`, the
// selector the Aave V3 wallet pages and listing read (lib/aave-v3/asset-
// catalog.ts asV3Market), is one Pool's panel and reserves table. A sub-route
// would collide with the reserve page's `[asset]` segment.

import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { asV3Market, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { SEAMLESS_FREEZE_DATE, SEAMLESS_FREEZE_TX } from "@/lib/seamless/asset-catalog";
import { explorerUrl } from "@/lib/shared/chains";

export type AaveMarketKey =
  | "aave-v3"
  | "aave-v3-prime"
  | "aave-v3-etherfi"
  | "aave-v3-base"
  | "aave-v3-arbitrum"
  | "spark"
  | "seamless";

export interface AaveMarketConfig {
  /** The provenance vocabulary and the view's protocol id. */
  key: AaveMarketKey;
  chainId: ChainId;
  /** The market's chain proxy. */
  apiRoute: string;
  /** The market page; a reserve page is `<marketHref>/<asset><marketQuery>`. */
  marketHref: string;
  /** `?market=…` for a Pool that shares its route with another; else "". */
  marketQuery: string;
  /** The page with this Pool's reserves table (M1): `marketHref` where the
   *  Pool has the route to itself, `?market=` on Ethereum's Aave V3. */
  reservesHref: string;
  /** The explorer's listing (the breadcrumb root). */
  listingHref: string;
  /** The listing filtered to this Pool's positions ("View all … positions"). */
  positionsHref: string;
  protocolName: string;
  marketLabel: string;
  purpose: string;
  /** Which Aave V3 market explainer the "?" opens; SparkLend has its own. */
  modal: "aave-v3" | "aave-v3-base" | "aave-v3-arbitrum" | "seamless" | "spark";
  /** Listing URL filtered to one asset on one side, where the listing supports it. */
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
  /** Off-site pages the market head's ⋮ carries besides the Pool and oracle. */
  offsite?: { item: string; title: string; subtitle: string; href: string }[];
}

const ETHEREUM_AAVE_V3: Record<AaveV3MarketKey, AaveMarketConfig> = {
  core: {
    key: "aave-v3",
    chainId: MAINNET_CHAIN_ID,
    apiRoute: "/api/chain/aave-v3/market",
    marketHref: "/ethereum/aave-v3/markets",
    marketQuery: "",
    reservesHref: "/ethereum/aave-v3/markets?market=core",
    listingHref: "/ethereum/aave-v3",
    positionsHref: "/ethereum/aave-v3?market=core",
    protocolName: "Aave V3",
    marketLabel: "Aave V3 Core",
    purpose:
      "The main Aave V3 market on Ethereum: one Pool, the broadest reserve roster, every account cross-collateralised under a shared health factor.",
    modal: "aave-v3",
  },
  prime: {
    key: "aave-v3-prime",
    chainId: MAINNET_CHAIN_ID,
    apiRoute: "/api/chain/aave-v3/market?market=prime",
    marketHref: "/ethereum/aave-v3/markets",
    marketQuery: "?market=prime",
    reservesHref: "/ethereum/aave-v3/markets?market=prime",
    listingHref: "/ethereum/aave-v3",
    positionsHref: "/ethereum/aave-v3?market=prime",
    protocolName: "Aave V3",
    marketLabel: "Aave V3 Prime",
    purpose:
      "A second Aave V3 Pool on Ethereum for ETH, its liquid staking tokens and a few stablecoins, with its own reserves and risk parameters apart from Core.",
    modal: "aave-v3",
  },
  etherfi: {
    key: "aave-v3-etherfi",
    chainId: MAINNET_CHAIN_ID,
    apiRoute: "/api/chain/aave-v3/market?market=etherfi",
    marketHref: "/ethereum/aave-v3/markets",
    marketQuery: "?market=etherfi",
    reservesHref: "/ethereum/aave-v3/markets?market=etherfi",
    listingHref: "/ethereum/aave-v3",
    positionsHref: "/ethereum/aave-v3?market=etherfi",
    protocolName: "Aave V3",
    marketLabel: "Aave V3 EtherFi",
    purpose:
      "An Aave V3 Pool on Ethereum built around ether.fi's weETH as collateral against stablecoins, with its own reserves and risk parameters apart from Core.",
    modal: "aave-v3",
  },
};

/** The Ethereum Aave V3 market a `?market=` value names (Core when absent). */
export const ethereumAaveV3Market = (market: string | null | undefined): AaveMarketConfig =>
  ETHEREUM_AAVE_V3[asV3Market(market)];

/** Core, Prime and EtherFi, the overview's three panels. */
export const ETHEREUM_AAVE_V3_MARKETS: readonly { key: AaveV3MarketKey; config: AaveMarketConfig }[] = (
  ["core", "prime", "etherfi"] as const
).map((key) => ({ key, config: ETHEREUM_AAVE_V3[key] }));

export const AAVE_V3_BASE_MARKET: AaveMarketConfig = {
  key: "aave-v3-base",
  chainId: BASE_CHAIN_ID,
  apiRoute: "/api/chain/aave-v3-base/market",
  marketHref: "/base/aave-v3/markets",
  marketQuery: "",
  reservesHref: "/base/aave-v3/markets",
  listingHref: "/base/aave-v3",
  positionsHref: "/base/aave-v3",
  protocolName: "Aave V3",
  marketLabel: "Aave V3 · Base",
  purpose:
    "Aave V3's Base deployment: its own Pool, its own reserves and its own risk parameters, separate from the Ethereum market of the same name.",
  modal: "aave-v3-base",
};

export const AAVE_V3_ARBITRUM_MARKET: AaveMarketConfig = {
  key: "aave-v3-arbitrum",
  chainId: ARBITRUM_CHAIN_ID,
  apiRoute: "/api/chain/aave-v3-arbitrum/market",
  marketHref: "/arbitrum/aave-v3/markets",
  marketQuery: "",
  reservesHref: "/arbitrum/aave-v3/markets",
  listingHref: "/arbitrum/aave-v3",
  positionsHref: "/arbitrum/aave-v3",
  protocolName: "Aave V3",
  marketLabel: "Aave V3 · Arbitrum",
  purpose:
    "Aave V3's Arbitrum deployment: its own Pool, its own reserves and its own risk parameters, separate from the Ethereum market of the same name.",
  modal: "aave-v3-arbitrum",
};

export const SPARK_MARKET: AaveMarketConfig = {
  key: "spark",
  chainId: MAINNET_CHAIN_ID,
  apiRoute: "/api/chain/spark/market",
  marketHref: "/ethereum/spark/markets",
  marketQuery: "",
  reservesHref: "/ethereum/spark/markets",
  listingHref: "/ethereum/spark",
  positionsHref: "/ethereum/spark",
  protocolName: "SparkLend",
  marketLabel: "SparkLend",
  purpose:
    "The single SparkLend market: an Aave-V3-architecture Pool governed by Sky, centred on stablecoin liquidity against sDAI, ETH and BTC collateral.",
  modal: "spark",
  assetHref: (symbol, side) =>
    `/ethereum/spark?${side === "supply" ? "supply" : "borrow"}=${encodeURIComponent(symbol)}`,
};

export const SEAMLESS_MARKET: AaveMarketConfig = {
  key: "seamless",
  chainId: BASE_CHAIN_ID,
  apiRoute: "/api/chain/seamless/market",
  marketHref: "/base/seamless/markets",
  marketQuery: "",
  reservesHref: "/base/seamless/markets",
  listingHref: "/base/seamless",
  positionsHref: "/base/seamless",
  protocolName: "Seamless",
  marketLabel: "Seamless · Base",
  purpose:
    "An Aave V3 fork on Base with its own Pool, reserves, risk parameters and oracle, frozen since April 2025 and winding down.",
  modal: "seamless",
  offsite: [
    {
      item: "freeze",
      title: "The freeze on Basescan",
      subtitle: `The transaction that froze every reserve, ${SEAMLESS_FREEZE_DATE}`,
      href: explorerUrl(BASE_CHAIN_ID, "tx-logs", SEAMLESS_FREEZE_TX),
    },
  ],
};

/** A reserve's page under its market. */
export const reserveHref = (m: AaveMarketConfig, asset: string): string =>
  `${m.marketHref}/${asset.toLowerCase()}${m.marketQuery}`;

/** A market's config by key, for a client page handed the key by its server route. */
export function aaveMarketConfig(key: AaveMarketKey): AaveMarketConfig {
  switch (key) {
    case "aave-v3":
      return ETHEREUM_AAVE_V3.core;
    case "aave-v3-prime":
      return ETHEREUM_AAVE_V3.prime;
    case "aave-v3-etherfi":
      return ETHEREUM_AAVE_V3.etherfi;
    case "aave-v3-base":
      return AAVE_V3_BASE_MARKET;
    case "aave-v3-arbitrum":
      return AAVE_V3_ARBITRUM_MARKET;
    case "spark":
      return SPARK_MARKET;
    case "seamless":
      return SEAMLESS_MARKET;
  }
}
