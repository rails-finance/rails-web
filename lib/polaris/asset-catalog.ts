// Polaris (Sepolia testnet) — the contract map, the two markets and the
// position-grain vocabulary.
// ----------------------------------------------------------------------------
// The position grain is (market, cdpId): each market's cdpManager numbers its
// CDPs from 1, and the CDP NFT on that market's cdpNft carries the same id.
// The owner is a mutable fact (the last ERC-721 Transfer's `to`), never the
// key. Two markets share one collateral, pETH — the bonding-curve ETH wrapper
// — and differ only in what they mint (USDp tracks the dollar, GOLDp tracks
// gold) and in the oracle leg that prices pETH in that unit.
//
// Addresses are the 2026-08 Sepolia deployment (rails-ops
// TO-DO-polaris-scoping.md §1.2), lowercase. A redeploy on the testnet is a
// new map here and a new `polaris_deployments` row on the server, not a code
// change anywhere else — the routes and the verifier read this file.
//
// UNITS ARE NATIVE and every token is 18 decimals. USD is never assumed: the
// overlay reads the protocol's own price feed at head (lib/sources/chain/
// polaris-position.ts) and the receipts say which leg produced each figure.

import { SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";

export const POLARIS_CHAIN_ID = SEPOLIA_CHAIN_ID;

export type PolarisMarket = "usdp" | "goldp";

/** Both markets, in display order. */
export const POLARIS_MARKETS: PolarisMarket[] = ["usdp", "goldp"];

export interface PolarisTokenMeta {
  symbol: string;
  address: string;
  decimals: 18;
}

/** pETH — the one collateral, minted on the bonding curve against ETH. */
export const PETH: PolarisTokenMeta = {
  symbol: "pETH",
  address: "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89",
  decimals: 18,
};

export interface PolarisMarketConfig {
  key: PolarisMarket;
  /** The market's name in prose — "USDp market". */
  label: string;
  /** The stablecoin this market mints — the debt unit. */
  stable: PolarisTokenMeta;
  /** What the stablecoin tracks, for copy: "the dollar" / "gold". */
  tracks: string;
  cdpManager: string;
  stabilityPool: string;
  cdpNft: string;
  priceFeed: string;
  psm: string;
  /** The medianiser whose price turns the ETH leg into this market's unit —
   *  ETH/USD for USDp; GOLDp additionally divides by XAU/USD (below). */
  ethUsdMedianiser: string;
  xauUsdMedianiser: string | null;
}

/** The shared core contracts (both markets read them). */
export const POLARIS_CORE = {
  /** `currentPrice()` — pETH's price in ETH, 1e18. */
  bondingCurve: "0x07ea2ff889e6228cded329a09f66e370f12c705e",
  feeRouter: "0x133e695512bf7b11ad5f7c2739971e99ea5b0965",
  shareSystem: "0x5543ca71ed8c88daf217488b1808994e080d925b",
  /** Reserve loans — captured raw by the backend, not rendered day one. */
  reserveLoansManager: "0xcaa0757808a96f9f4ee76c04256536d6c17e6e27",
  reserveLoansNft: "0xa1382064bbd50a3740b03cc9c512385e60e03b2f",
  interestController: "0xe1f008948215e6328cf99a32ef4fdf03138dd7ea",
  ethUsdMedianiser: "0x1cbc98793da57bb3ec659058434870fae89532de",
  xauUsdMedianiser: "0x331ed8031be714d2b43df97f31542d89dc5df50e",
  /** Chainlink's Sepolia ETH/USD feed — one of the sources the ETH/USD
   *  medianiser reads (its `oracles(0)`), named so a receipt can point at it. */
  chainlinkEthUsd: "0x694aa1769357215de4fac081bf1f309adc325306",
} as const;

export const POLARIS_MARKET_CONFIG: Record<PolarisMarket, PolarisMarketConfig> = {
  usdp: {
    key: "usdp",
    label: "USDp market",
    stable: { symbol: "USDp", address: "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6", decimals: 18 },
    tracks: "the dollar",
    cdpManager: "0xbdc1fe97e787ae7f653ffbccd74ec49814fe6aa1",
    stabilityPool: "0xb61eb4712b285d9621af4ccba74a93c8d88502e5",
    cdpNft: "0x1f3f4a0f65c4255d7b488816a629fbebf5269e1b",
    priceFeed: "0xdf7f2c41c3c0639a952b19639c532350c4cdc4a1",
    psm: "0xa03798ad2d5a51e23d3221e18ce89aacedd9fad1",
    ethUsdMedianiser: POLARIS_CORE.ethUsdMedianiser,
    xauUsdMedianiser: null,
  },
  goldp: {
    key: "goldp",
    label: "GOLDp market",
    stable: { symbol: "GOLDp", address: "0x1068ed496d21bf5357b2f1e9d25f46934f43ca99", decimals: 18 },
    tracks: "gold",
    cdpManager: "0x18f652c41a5d30b4b49a9962800b34a6f1abfe41",
    stabilityPool: "0x6a506c0738e238784d171c2062ce7dde246e542f",
    cdpNft: "0x6c6de65191929dc0f607f641642b6aadb1f91af8",
    priceFeed: "0x53450cabbac3ef0c1fe29abd7602790d32fcb442",
    psm: "0x90b0fcf35dd2ff2b43c6eb08e598f9f725f93b65",
    ethUsdMedianiser: POLARIS_CORE.ethUsdMedianiser,
    xauUsdMedianiser: POLARIS_CORE.xauUsdMedianiser,
  },
};

/** The market key a URL segment or an API field names, or null. */
export function normalizeMarket(raw: string | null | undefined): PolarisMarket | null {
  const k = (raw ?? "").toLowerCase();
  return k === "usdp" || k === "goldp" ? k : null;
}

/** A CDP id is a non-negative integer, spelled without padding or sign. */
export function normalizeCdpId(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^(0|[1-9][0-9]*)$/.test(s) ? s : null;
}

export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
