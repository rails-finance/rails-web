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
import type { ProtocolLifecycle } from "@/lib/shared/lifecycle";

export const POLARIS_CHAIN_ID = SEPOLIA_CHAIN_ID;

/** This deployment closed on 16 Nov 2026 (ui-jobs 621): Polaris's notice, and
 *  its testnet app's banner read that day. The contracts kept answering on
 *  Sepolia (block 12,150,116, 21:56 UTC), so the state rests on the notice. */
export const POLARIS_TESTNET_CLOSED: ProtocolLifecycle = {
  state: "closed",
  at: 1_794_787_200,
  lead: "Polaris closed this testnet on",
  rest: " and will redeploy it. Balances, positions and locks do not carry over to the new deployment; this deployment's history stays on Rails.",
  source: {
    by: "Polaris",
    quote:
      "This testnet will be discontinued on Monday 16 November. It will redeploy shortly after. Balances, positions and locks will not carry over.",
    href: "https://testnet.polaris.finance",
    reads:
      "This testnet has been retired, thanks to everyone for testing. A new version with protocol updates is coming soon. Balances, positions and locks won't carry over to the new deployment.",
    readOn: "16 Nov 2026",
  },
};

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
  address: "0x07ea2ff889e6228cded329a09f66e370f12c705e",
  decimals: 18,
};

/** fpETH — the floor part of pETH, the reserve loans' collateral. Its price in
 *  WETH is the bonding curve's `floorPrice()`. */
export const FPETH: PolarisTokenMeta = {
  symbol: "fpETH",
  address: "0x94220c1c340336527c719bcf06067ca7769ac185",
  decimals: 18,
};

/** WETH — the reserve token, what a reserve loan borrows and repays. */
export const POLARIS_WETH: PolarisTokenMeta = {
  symbol: "WETH",
  address: "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89",
  decimals: 18,
};

/** vpETH — minted 1:1 with fpETH when the splitter splits pETH. The pETH
 *  account page states a balance of it and values none (ui-jobs 865). */
export const VPETH: PolarisTokenMeta = {
  symbol: "vpETH",
  address: "0x43cc4978e11bc1e1d8cfcd8348cb7e7246c49b6e",
  decimals: 18,
};

/** svpETH — staked vpETH, the fee router's third recipient. */
export const SVPETH: PolarisTokenMeta = {
  symbol: "svpETH",
  address: "0x7b118bd63bbe9023a2a509cecd48bc283d150539",
  decimals: 18,
};

/** The zap router (`MultiSwap`): a zap trade names its user only in that log. */
export const POLARIS_ZAP_ROUTER = "0xd09416d328dfaa07a422a1df233d1d968b80fbf8";

/** The three venues whose LP shares the pETH account page reads at the head,
 *  keyed as the server's `polaris_deployments` columns name them. */
export type PolarisVenueKey = "venue_curve_tripool" | "venue_univ2_polar_peth" | "venue_univ2_peth_weth";

export interface PolarisVenue {
  key: PolarisVenueKey;
  /** The venue's name in prose. */
  label: string;
  /** The pool, which is its LP token on all three. */
  address: string;
}

export const POLARIS_VENUES: Record<PolarisVenueKey, PolarisVenue> = {
  venue_curve_tripool: {
    key: "venue_curve_tripool",
    label: "Curve pETH/fpETH/vpETH pool",
    address: "0x28b6f412904834dee78a4fa464f2089f5264770c",
  },
  venue_univ2_polar_peth: {
    key: "venue_univ2_polar_peth",
    label: "Uniswap V2 pETH/POLAR pair",
    address: "0xdce2d72d07760cdb29604baee6271fcb1f3a7565",
  },
  venue_univ2_peth_weth: {
    key: "venue_univ2_peth_weth",
    label: "Uniswap V2 pETH/WETH pair",
    address: "0xb3348b1c358aa118b6304a91c48f3ee5a13f06a8",
  },
};

/** The deployment these addresses belong to: the `polaris_deployments` id the
 *  deposit and loan proxies pass as `deployment`, so the pages keep naming it
 *  once a redeploy adds a second row. */
export const POLARIS_DEPLOYMENT_ID = "sepolia-2026-08";

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
  /** The savings vault that holds this market's deposit NFT #2 (sUSDp,
   *  sGOLDp). Its share holders stay off the explorer (decision 0014). */
  vault: { symbol: string; address: string };
}

/** The shared core contracts (both markets read them). */
export const POLARIS_CORE = {
  /** `currentPrice()` — pETH's price in ETH, 1e18. */
  bondingCurve: "0x07ea2ff889e6228cded329a09f66e370f12c705e",
  feeRouter: "0x133e695512bf7b11ad5f7c2739971e99ea5b0965",
  shareSystem: "0x5543ca71ed8c88daf217488b1808994e080d925b",
  /** Reserve loans: `loans(id)`, `getLoanDebt(id)`, `debtPerShare()`; the
   *  loan NFT numbers them. */
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
    vault: { symbol: "sUSDp", address: "0x63d01003f67d8807799fdfbdeefb583d3c8f7f73" },
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
    vault: { symbol: "sGOLDp", address: "0xf5777e2a039887aa9362cb3b71bdd5287505e717" },
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
