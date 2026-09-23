// ============================================================================
// FETCH COMPOUND V3 POSITION (chain state)
// ============================================================================
//
// Per-(market, account) state read directly from the Comet contract at the live
// head — the risk-surface companion to the captured event replay. Comet is
// single-base / multi-collateral with no aggregate account getter, so the
// response carries the parts and the protocol's own verdicts:
//
//   • balanceOf / borrowBalanceOf — the signed base, interest included,
//   • per held collateral asset: exact balance, the market's own oracle price
//     (getPrice on the asset's configured feed), and its two collateral factors
//     (borrow / liquidate — governance deprecates an asset by setting the
//     borrow factor to 0 while it stays liquidation-eligible),
//   • isBorrowCollateralized / isLiquidatable — the CONTRACT's own account
//     verdicts (kind "chain", stronger than any client arithmetic),
//   • the derived aggregates the risk cards draw: borrow capacity, liquidation
//     capacity, debt value and the health factor (liquidation capacity ÷ debt),
//   • market economics: utilization, supply/borrow APR, the minimum borrow.
//
// VALUES ARE IN THE MARKET'S OWN QUOTE UNIT, NOT ALWAYS USD. Each market prices
// its base and all its collateral against ONE numeraire, and which one is a
// deployment fact — whatever `baseTokenPriceFeed()` quotes in, stated per
// market in the catalog and verified from the feed's own `description()`. On
// Ethereum that is USD for cUSDCv3/cUSDTv3 and ETH for cWETHv3, so the base
// price reads ≈ 1.0 in every market (scripts/verify-compound-v3-chain.mjs).
// Base breaks that coincidence rather than the rule: cAEROv3's base IS the
// volatile asset and the market still quotes in dollars, so its base price
// reads $0.475. `quoteUnit` names the unit; the base-token figures (`*Base`)
// are unit-safe for display in every market.
//
// Balances are TEXT to preserve integer precision; scale by `decimals`.

export interface CompoundChainCollateral {
  /** Underlying token address, lowercase. */
  address: string;
  symbol: string;
  decimals: number;
  /** Token wei (raw integer string) — collateralBalanceOf. */
  balanceRaw: string;
  /** The market's own oracle price for this asset (getPrice on its configured
   *  feed), in the market's quote unit. */
  price: number;
  /** Borrow collateral factor (0..1). 0 = deprecated for new borrowing. */
  borrowCollateralFactor: number;
  /** Liquidate collateral factor (0..1) — the liquidation line's weight. */
  liquidateCollateralFactor: number;
  /** Share of seized collateral value returned to the account on absorb
   *  (1 − this = the liquidation penalty). */
  liquidationFactor: number;
}

export interface CompoundMarketChainResponse {
  wallet: string;
  market: string;
  comet: string;
  blockNumber: number;
  baseSymbol: string;
  baseDecimals: number;
  /** The unit the market's price feeds quote in ("USD" | "ETH"). */
  quoteUnit: string;
  /** Base-token wei (raw integer strings) — balanceOf / borrowBalanceOf. At
   *  most one is nonzero (verified on-chain). */
  supplyBalanceRaw: string;
  borrowBalanceRaw: string;
  /** getPrice(baseTokenPriceFeed) in the quote unit — 1.0 only where the base
   *  IS the numeraire (cWETHv3), not as a rule (cAEROv3 reads $0.475). */
  basePrice: number;
  /** Held collateral assets (nonzero balance only). */
  collateral: CompoundChainCollateral[];
  /** Σ collateral × price × borrowCollateralFactor — the borrow cap, quote units. */
  borrowCapacity: number;
  /** Σ collateral × price × liquidateCollateralFactor — the liquidation line. */
  liquidationCapacity: number;
  /** borrowBalance × basePrice — the debt in quote units. 0 when lending. */
  debtValue: number;
  /** liquidationCapacity ÷ debtValue. Null when no debt. */
  healthFactor: number | null;
  /** The contract's own account verdicts (isBorrowCollateralized / isLiquidatable). */
  isBorrowCollateralized: boolean;
  isLiquidatable: boolean;
  /** Market economics at the same head: fractions (0..1) / nominal APR. */
  utilization: number;
  supplyApr: number;
  borrowApr: number;
  /** Minimum base borrow, in base tokens. */
  baseBorrowMin: number;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

export interface FetchCompoundPositionParams {
  wallet: string;
  market: string;
  baseUrl?: string;
}

export async function fetchCompoundPosition(p: FetchCompoundPositionParams): Promise<CompoundMarketChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet, market: p.market });
  const url = `${p.baseUrl ?? ""}/api/chain/compound/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchCompoundPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as CompoundMarketChainResponse;
}

/** Scale a raw balance string by token decimals into a display Number (BigInt-safe,
 *  ES2017). */
export function scaleCompoundChainBalance(raw: string, decimals: number): number {
  if (!raw || raw === "0") return 0;
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return 0;
  }
  if (big === BigInt(0)) return 0;
  if (decimals <= 0) return Number(big);
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(big / divisor) + Number(big % divisor) / Number(divisor);
}
