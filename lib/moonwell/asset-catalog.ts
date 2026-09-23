// Moonwell (Ethereum L1) contract + market catalog.
// ----------------------------------------------------------------------------
// Moonwell's Ethereum deployment (live 2026-05-27) is a Compound v2 fork: four
// FIXED MErc20Delegator mTokens cross-collateralised through one Comptroller,
// priced by a Chainlink oracle wrapper. Markets are enumerable (governance-
// gated MarketListed, not a factory), so — unlike Spark's open reserve set —
// symbols and decimals live HERE, chain-verified, with no per-request ERC20
// resolution. All values verified on-chain 2026-07-14 (Comptroller
// getAllMarkets + markets() + per-mToken reads; collateral factors are
// governance constants — re-verify when Moonwell risk params change).
//
// Accrual is per-TIMESTAMP (borrowRatePerTimestamp — Moonwell kept its
// Base/Moonbeam convention; original Compound v2's per-block reverts here).

import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export const MOONWELL_ADDRESSES = {
  /** Comptroller (Unitroller proxy) — risk engine, market registry. */
  COMPTROLLER: "0xdec80bb934397575594e91970b37baf65f5b21be",
  /** Chainlink oracle wrapper — getUnderlyingPrice(mToken), the SAME price the
   *  Comptroller reads for liquidity/liquidation math, so its USD is
   *  chain-derived (survives the on-chain-only gate). Scale: 1e(36 − underlying
   *  decimals). */
  ORACLE: "0x599a01297fc181558bdfa1737cafee513694b654",
  /** WETH Router — proxies native-ETH mints/repays on the WETH market. It is
   *  the emitted Mint.minter / RepayBorrow.payer on routed flows (98/99 mWETH
   *  mints measured 2026-07-14); the index resolves the real owner via the
   *  same-tx router-leg Transfer. */
  WETH_ROUTER: "0xa218a4776e2487eaa25e738e6d6a64f21593ca22",
} as const;

/** Short, copy-friendly form of a wallet address. */
export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

// ── Market catalog ───────────────────────────────────────────────────────────
// Market keys mirror the backend's `market` tag ('weth' | 'usdc' | 'usdt' |
// 'cbbtc'). mTokens are 8-dp ERC-20s; collateralFactor is the Comptroller's
// governance-set fraction (0..1).

export interface MoonwellMarket {
  /** The backend market key. */
  key: string;
  /** Underlying display symbol. */
  symbol: string;
  /** mToken display symbol. */
  mSymbol: string;
  /** mToken contract address (lowercased). */
  mtoken: string;
  /** Underlying token address (lowercased). */
  underlying: string;
  /** Underlying decimals. */
  decimals: number;
  /** Comptroller collateral factor (0..1), chain-read 2026-07-14. */
  collateralFactor: number;
}

/** mToken ERC-20 decimals (all four markets). */
export const MTOKEN_DECIMALS = 8;

export const MOONWELL_MARKETS: MoonwellMarket[] = [
  {
    key: "weth",
    symbol: "WETH",
    mSymbol: "mWETH",
    mtoken: "0xb85ca1decc4971f8094da7676f8b71002a9590c4",
    underlying: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    decimals: 18,
    collateralFactor: 0.8,
  },
  {
    key: "usdc",
    symbol: "USDC",
    mSymbol: "mUSDC",
    mtoken: "0xe655790552c68f2871eb44b2cfe3dcfe6a63e62e",
    underlying: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
    collateralFactor: 0.85,
  },
  {
    key: "usdt",
    symbol: "USDT",
    mSymbol: "mUSDT",
    mtoken: "0xeddc25b67d474eeecfa4f69227b81d870c467011",
    underlying: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    collateralFactor: 0.85,
  },
  {
    key: "cbbtc",
    symbol: "cbBTC",
    mSymbol: "mcbBTC",
    mtoken: "0x636080eb65f1b665b646f47d31f21901cdaaee9f",
    underlying: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    decimals: 8,
    collateralFactor: 0.8,
  },
];

/** Market key → catalog entry. */
export const MOONWELL_MARKET_BY_KEY: Record<string, MoonwellMarket> = Object.fromEntries(
  MOONWELL_MARKETS.map((m) => [m.key, m]),
);

/** Underlying display symbol → market key (filter chips). */
export const MOONWELL_KEY_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  MOONWELL_MARKETS.map((m) => [m.symbol, m.key]),
);

// ── Deployments ──────────────────────────────────────────────────────────────
// Moonwell runs the same Compound v2 fork on several chains, and Rails carries
// two of them as separate explorers: this Ethereum deployment and the Base one
// (lib/moonwell-base/asset-catalog.ts). They are separate because they are
// separate contracts — a wallet's position on one says nothing about its
// position on the other — not because the protocol differs.
//
// A deployment is what the shared chain readers take instead of reaching for
// the constants above. Ethereum passes its roster in; Base resolves one.

/** The minimum a chain reader needs to read one market: which mToken, what its
 *  underlying is called and at what scale. `key` identifies the market in the
 *  read's OWN output — on Ethereum it is the backend's `market` tag, because
 *  the index is keyed on it; on Base, where no index stands behind the
 *  explorer, it is the mToken address (Base lists two markets whose mTokens
 *  BOTH answer `symbol()` = "mUSDC", so nothing else is unique). */
export interface MoonwellRosterMarket {
  key: string;
  symbol: string;
  mtoken: string;
  /** The underlying ERC-20 (lowercased) — what the market lends, and the
   *  address every oracle price and lifetime flow is keyed on. */
  underlying: string;
  decimals: number;
}

export interface MoonwellDeployment {
  chainId: ChainId;
  /** Comptroller (Unitroller proxy) — the market registry and risk engine.
   *  Every other address in the deployment is reachable from it. */
  comptroller: string;
  /**
   * The roster and oracle written down, or null to resolve both from the
   * Comptroller at read time.
   *
   * Ethereum writes them down for two reasons that do not hold on Base: its
   * four market keys are the backend index's own tags, so they cannot become
   * addresses, and four fixed markets let a whole account read in ONE
   * multicall. Base's roster is twenty-one markets and governance moves it, so
   * resolving `getAllMarkets()` / `oracle()` live is both cheaper to maintain
   * and truer — a market listed tomorrow appears without a file changing here.
   */
  fixed: { oracle: string; markets: MoonwellRosterMarket[] } | null;
}

/** Moonwell on Ethereum — the four governance-listed markets above, priced by
 *  the Chainlink wrapper the Comptroller reads. */
export const MOONWELL_DEPLOYMENT: MoonwellDeployment = {
  chainId: MAINNET_CHAIN_ID,
  comptroller: MOONWELL_ADDRESSES.COMPTROLLER,
  fixed: { oracle: MOONWELL_ADDRESSES.ORACLE, markets: MOONWELL_MARKETS },
};
