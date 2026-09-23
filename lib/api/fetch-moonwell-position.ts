// ============================================================================
// FETCH MOONWELL POSITION (chain state)
// ============================================================================
//
// Per-ACCOUNT state read directly from Moonwell's contracts at the live head —
// the risk-surface companion to the captured event replay. Moonwell (a
// Compound v2 fork) cross-collateralises all four fixed markets through one
// Comptroller, so unlike Comet's per-market reads a single fetch covers the
// whole account:
//
//   • per market: the exact mToken balance (balanceOf), the pool's own
//     exchange rate (exchangeRateStored — the book identity
//     (cash + borrows − reserves) / totalSupply, verified BigInt-exact),
//     borrowBalanceStored, the Comptroller's oracle USD price and live
//     collateral factor, and the per-timestamp rates annualized,
//   • `entered` — Comptroller.getAssetsIn membership. Minting alone does NOT
//     enter a market (verified live: a real lender's supply backs nothing),
//     so an un-entered supply is excluded from every capacity figure and the
//     surfaces must say so,
//   • liquidity / shortfall — the CONTRACT's own account verdict
//     (getAccountLiquidity, kind "chain"; shortfall > 0 is the liquidation
//     line), with the derived aggregates the risk cards draw: collateral
//     value, CF-weighted capacity, debt value and the health factor
//     (capacity ÷ debt — a replica proven EXACT against the Comptroller's own
//     truncation order by scripts/verify-moonwell-chain.mjs),
//   • protocol constants at the same head: closeFactor, liquidationIncentive.
//
// All USD figures price through the Comptroller's own oracle (chain-derived,
// survives the on-chain-only gate). Balances are TEXT to preserve integer
// precision; scale by decimals.

export interface MoonwellChainMarket {
  /** The market's key within this response. On Ethereum it is the backend's
   *  own `market` tag ('weth' | 'usdc' | 'usdt' | 'cbbtc'), because the index
   *  is keyed on it; on Base, where no index stands behind the explorer, it is
   *  the mToken address — two Base markets both answer symbol() = "mUSDC", so
   *  nothing shorter is unique. Treat it as opaque. */
  market: string;
  /** Underlying display symbol. */
  symbol: string;
  /** The underlying ERC-20 address (lowercased) — the key every oracle price
   *  and lifetime flow is stated against, on both deployments. */
  underlying: string;
  /** Underlying decimals. */
  decimals: number;
  /** mToken wei (8 dp, raw integer string) — balanceOf, the exact holding. */
  mtokenBalanceRaw: string;
  /** mTokens (8 dp) → underlying (whole units): underlying = mTokens × this. */
  exchangeRate: number;
  /** Underlying units currently redeemable (mTokens × exchangeRate — includes
   *  accrued supply interest). */
  supplyUnderlying: number;
  /** Underlying wei (raw integer string) — borrowBalanceStored. */
  borrowBalanceRaw: string;
  /** Borrowed underlying in whole units. */
  borrowUnderlying: number;
  /** Comptroller oracle USD per whole underlying token (chain-derived). */
  priceUsd: number | null;
  /** The Comptroller's LIVE collateral factor for this market (0..1). */
  collateralFactor: number;
  /** getAssetsIn membership — false means this supply backs NOTHING. */
  entered: boolean;
  /** Annualized simple rates (fraction) from the per-timestamp getters. */
  supplyApr: number | null;
  borrowApr: number | null;
}

export interface MoonwellChainResponse {
  wallet: string;
  blockNumber: number;
  /** The head block's own timestamp, seconds — what a live market note states
   *  its elapsed time from. 0 on a stub (chainStale). */
  blockTimestamp: number;
  /** Markets where the account has a nonzero supply or borrow. */
  markets: MoonwellChainMarket[];
  /** The Comptroller's own verdict (getAccountLiquidity), USD. Exactly one is
   *  nonzero: liquidity = capacity still unborrowed, shortfall > 0 = the
   *  account is liquidatable now. */
  liquidityUsd: number;
  shortfallUsd: number;
  /** Σ entered supply × price — collateral value at the protocol's oracle. */
  collateralValueUsd: number;
  /** Σ entered supply × price × CF — the borrowing/liquidation line (v2 has
   *  ONE collateral factor: borrow limit and liquidation threshold coincide). */
  collateralCapacityUsd: number;
  /** Σ borrow × price. */
  debtValueUsd: number;
  /** collateralCapacityUsd ÷ debtValueUsd — 1.0 IS the shortfall line
   *  (replica proven exact vs getAccountLiquidity). Null when no debt. */
  healthFactor: number | null;
  /** Protocol constants at the same head. */
  closeFactor: number;
  liquidationIncentive: number;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

export interface FetchMoonwellPositionParams {
  wallet: string;
  baseUrl?: string;
  /** Which deployment's route to ask. Defaults to Ethereum's, so every
   *  existing call site is unchanged; Base passes
   *  "/api/chain/moonwell-base/position". The response SHAPE is identical —
   *  same fork, same reader — which is exactly why the route has to be named
   *  rather than inferred from the payload. */
  route?: string;
}

export async function fetchMoonwellChainPosition(p: FetchMoonwellPositionParams): Promise<MoonwellChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  const url = `${p.baseUrl ?? ""}${p.route ?? "/api/chain/moonwell/position"}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchMoonwellChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MoonwellChainResponse;
}
