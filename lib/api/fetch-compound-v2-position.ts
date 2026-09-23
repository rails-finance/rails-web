// ============================================================================
// FETCH COMPOUND V2 POSITION (chain state)
// ============================================================================
//
// Per-ACCOUNT state read directly from Compound V2's contracts at the live
// head — the risk-surface companion to the captured event replay. Compound V2
// cross-collateralises its twenty listed markets through one Comptroller
// (0x3d98…Cd3B), so — like Moonwell and unlike Comet's per-market reads — a
// single fetch covers the whole account:
//
//   • per market: the exact cToken balance (balanceOf), the pool's own
//     exchange rate (exchangeRateStored), borrowBalanceStored, the
//     Comptroller's oracle USD price (and whether a live FEED stands behind
//     it — three markets are priced by a stored constant nothing updates),
//     the live collateral factor (null when zero: DISABLED as collateral,
//     not a 0% parameter), and per-block rates annualized on EACH MARKET'S
//     OWN interest rate model's blocksPerYear() — the roster does not agree
//     on one constant (cETH's model says 2,628,000; the rest 2,102,400),
//   • `entered` — Comptroller.getAssetsIn membership. Supplying alone does
//     NOT enter a market, so an un-entered supply backs nothing,
//   • liquidity / shortfall — the CONTRACT's own account verdict
//     (getAccountLiquidity returns (error, liquidity, shortfall), NOT a
//     boolean; shortfall > 0 is the liquidation line). That tuple is the
//     chain fact. The HF-style ratio beside it (capacity ÷ debt) is an
//     explicitly-labeled REPLICA of the Comptroller's walk — presented as
//     arithmetic over the same reads, not as the contract's own verdict,
//   • protocol constants at the same head: closeFactor (0.5 → liquidations
//     are PARTIAL), liquidationIncentive.
//
// All USD figures price through the Comptroller's own oracle (chain-derived).
// Balances are TEXT to preserve integer precision; scale by decimals.

export interface CompoundV2ChainMarket {
  /** The backend market key ('dai' | 'sai' | 'wbtc' | 'wbtc2' | …). */
  market: string;
  /** Underlying display symbol (catalog-labeled: SAI, not its bytes32 "DAI"). */
  symbol: string;
  /** Underlying decimals. */
  decimals: number;
  /** cToken wei (8 dp, raw integer string) — balanceOf, the exact holding. */
  ctokenBalanceRaw: string;
  /** cTokens (8 dp) → underlying (whole units): underlying = cTokens × this. */
  exchangeRate: number;
  /** Underlying units currently redeemable (cTokens × exchangeRate — includes
   *  accrued supply interest). */
  supplyUnderlying: number;
  /** Underlying wei (raw integer string) — borrowBalanceStored. */
  borrowBalanceRaw: string;
  /** Borrowed underlying in whole units. */
  borrowUnderlying: number;
  /** Comptroller oracle USD per whole underlying token (chain-derived). */
  priceUsd: number | null;
  /** False when the oracle prices this market from a stored constant with NO
   *  feed behind it (getConfig.priceFeed == 0). The number is the one the
   *  Comptroller itself uses, but nothing updates it — cSAI's constant is
   *  $14.4263 on a token that targets $1. */
  priceHasFeed: boolean;
  /** The Comptroller's LIVE collateral factor (0..1); null when ZERO — the
   *  market is disabled as collateral, not parameterised at 0%. */
  collateralFactor: number | null;
  /** True when the collateral factor is exactly zero. */
  collateralDisabled: boolean;
  /** getAssetsIn membership — false means this supply backs NOTHING. */
  entered: boolean;
  /** Annualized simple rates (fraction) from the per-BLOCK getters × this
   *  market's own model's blocksPerYear. Null when either read fails. */
  supplyApr: number | null;
  borrowApr: number | null;
  /** The model's own annualization constant — NOT one value across the roster. */
  blocksPerYear: number | null;
}

export interface CompoundV2ChainResponse {
  wallet: string;
  blockNumber: number;
  /** The oracle the Comptroller itself reads — read from it, not hardcoded. */
  oracle: string | null;
  /** Markets where the account has a nonzero supply or borrow. */
  markets: CompoundV2ChainMarket[];
  /** The Comptroller's own verdict (getAccountLiquidity), USD. The contract
   *  exposes (error, liquidity, shortfall) — no boolean: exactly one of these
   *  is nonzero. liquidity = capacity still unborrowed; shortfall > 0 = the
   *  account is liquidatable now. */
  liquidityUsd: number;
  shortfallUsd: number;
  /** Σ entered supply × price — collateral value at the protocol's oracle. */
  collateralValueUsd: number;
  /** Σ entered supply × price × CF — the borrowing/liquidation line (V2 has
   *  ONE collateral factor: borrow limit and liquidation threshold coincide). */
  collateralCapacityUsd: number;
  /** Σ borrow × price. */
  debtValueUsd: number;
  /** capacity ÷ debt — an HF-style REPLICA of the Comptroller's liquidity
   *  walk, labeled as such everywhere it renders. The chain fact is the
   *  liquidity/shortfall tuple above; this ratio is client arithmetic over
   *  the same reads (float, not the contract's own truncation order). Null
   *  when no debt. */
  healthReplica: number | null;
  /** Protocol constants at the same head. closeFactor 0.5 → PARTIAL
   *  liquidations: borrowers commonly survive them. */
  closeFactor: number;
  liquidationIncentive: number;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

export interface FetchCompoundV2PositionParams {
  wallet: string;
  baseUrl?: string;
}

export async function fetchCompoundV2ChainPosition(p: FetchCompoundV2PositionParams): Promise<CompoundV2ChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  const url = `${p.baseUrl ?? ""}/api/chain/compound-v2/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchCompoundV2ChainPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as CompoundV2ChainResponse;
}
